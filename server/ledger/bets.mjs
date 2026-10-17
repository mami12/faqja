/**
 * Bets: place, book (share a code), list, settle at final result.
 *
 * The rules are the ones the original backend used, kept identical so the UI behaves the
 * same: minimum stake 100 LEK, only ACTIVE accounts, prices validated against the live
 * feed (never trusted from the client), live odds must be fresh, and the stake leaves the
 * balance in the same transaction that creates the ticket.
 *
 * The feed keeps prices in memory (server/odds-store.mjs), so a selection is resolved by
 * looking the market up there - which is also the anti-tamper check, because the price
 * used for the ticket is the server's, not the one the browser sent.
 */
import crypto from 'node:crypto';
import { pool, query } from '../db.mjs';
import { config } from '../config.mjs';
import { getOddsForMatches } from '../odds-store.mjs';
import { withOdds } from '../collector.mjs';
import { getMatchById } from '../matches.mjs';
import { feedIsRefreshing } from '../idle-mode.mjs';
import * as overrides from './overrides.mjs';
import { outcomeIdOf, marketIdOf, parseOutcomeId, toClientMatch } from './view.mjs';
import { parseBuilderId, findLeg, listTemplates } from './bet-builders.mjs';
import { isDecidedLiveMarket } from './decided-markets.mjs';
import { chargeManagerCommission, refundManagerCommission } from './manager-finance.mjs';
import { assertPlayerCanBet } from './player-controls.mjs';
import { ticketTypeForSelectionCount, totalOddsForSelections, potentialPayout as calculatePotentialPayout } from './ticket-pricing.mjs';
import { isResultBttsMarket, parseResultBttsOutcome } from './result-btts.mjs';
import { liveRiskReason } from '../live-risk.mjs';
import { lockLiveRiskSettings } from './live-risk-store.mjs';
import { assertLiveBetRisk } from './bet-risk.mjs';
import { isResultTotalMarket, isTotalBttsMarket, isFirstHalfResultBtts, parseResultTotal, parseTotalBtts } from './mixed-combos.mjs';

const MIN_STAKE = 100; // LEK
const STALE_LIVE_ODDS_MS = 120 * 1000; // live prices older than this are not bettable
// Prematch prices are refreshed hourly (SUBSCRIBE/PREMATCH_REFRESH_MS) unless the fixture is
// about to start, so they are allowed to be older - but not unbounded: a price the feed has
// stopped refreshing must not be sold, so the window is the hourly tier plus a margin.
const STALE_PREMATCH_ODDS_MS = Number(config.prematchStaleMs) || 90 * 60 * 1000;
const PRICE_TOLERANCE = 0.1; // 10% drift between the shown price and the server's

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

const bookingCode = () => crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

/**
 * Turns one selection from the client ({ outcomeId, oddsAtPlacement }) into the row we
 * will store, using our own live price. Throws a 400 with a user-facing message.
 */
async function resolveSelection(selection) {
  const builder = parseBuilderId(selection?.outcomeId);
  if (builder) return resolveBuilderSelection(selection,builder);
  // idle mode: while the feed is paused (or starting again) the prices on the board have not
  // been refreshed since before the pause - selling one of them would be selling a stale price
  if (feedIsRefreshing()) {
    throw badRequest('Kuotat po rifreskohen. Provo përsëri pas pak sekondash.');
  }

  const parsed = parseOutcomeId(selection?.outcomeId);
  if (!parsed) throw badRequest('Zgjedhja nuk u njoh. Rifresko faqen dhe provo përsëri.');

  const matchId = Number(parsed.matchId);
  const match = await getMatchById(matchId);
  if (!match) throw badRequest('Ndeshja nuk është më e disponueshme.');

  const row = (await getOddsForMatches([matchId])).find(
    (o) => o.market_key === parsed.marketKey && String(o.line ?? '') === String(parsed.line ?? '') && o.outcome_key === parsed.outcomeKey,
  );
  if (!row) throw badRequest('Kuota për këtë zgjedhje nuk është më e disponueshme.');
  // Never accept an expired contract even if a stale client still shows it.
  if (isDecidedLiveMarket(match, { name: row.market_name, line: row.line })) {
    const err = badRequest('Ky treg ka përfunduar dhe nuk pranon më baste.');
    err.code = 'MARKET_DECIDED';
    throw err;
  }
  if (row.suspended === true) throw badRequest('Kjo kuotë është pezulluar për momentin.');

  const comboParser = isResultTotalMarket(row.market_name) ? parseResultTotal
    : isTotalBttsMarket(row.market_name) ? parseTotalBtts : null;
  if (comboParser && !comboParser(row.outcome_key, match.home, match.away) &&
      !comboParser(row.outcome_name, match.home, match.away)) {
    throw badRequest('Kombinimi nuk u identifikua saktë nga furnizuesi.');
  }

  // Only sell result + BTTS selections when both parts of the contract are identifiable.
  // An unknown provider code cannot safely be graded at the end of the match.
  if (isResultBttsMarket(row.market_name) &&
      !parseResultBttsOutcome(row.outcome_key, match.home, match.away) &&
      !parseResultBttsOutcome(row.outcome_name, match.home, match.away)) {
    throw badRequest('Ky kombinim Rezultati + Të dy ekipet shënojnë nuk është identifikuar plotësisht.');
  }

  // admin overrides win over the feed: a suspended match/market/outcome blocks the bet, and
  // a pinned price is the price the ticket gets
  const matchOverride = overrides.matchOverride(matchId);
  const marketOverride = overrides.marketOverride(matchId, parsed.marketKey, parsed.line);
  const outcomeOverride = overrides.outcomeOverride(matchId, parsed.marketKey, parsed.line, parsed.outcomeKey);
  if (matchOverride?.suspended || marketOverride?.suspended || outcomeOverride?.suspended) {
    throw badRequest('Ndeshja ose kuota është pezulluar nga administrata.');
  }

  const price = outcomeOverride?.price ?? (row.price === null || row.price === undefined ? null : Number(row.price));
  if (price === null) throw badRequest('Kjo kuotë nuk ka çmim.');

  // Never trust a disabled button as protection: enforce the same reversible
  // live-risk suspension here, before balance deduction AND booking creation.
  const riskReason = liveRiskReason(match, {
    marketName: row.market_name,
    marketKey: parsed.marketKey,
    outcomeName: row.outcome_name,
    outcomeKey: parsed.outcomeKey,
    price,
  });
  if (riskReason) {
    const err = badRequest('Ky koeficient është pezulluar automatikisht për shkak të rrezikut live.');
    err.code = 'LIVE_RISK_SUSPENDED';
    throw err;
  }

  // prices must be fresh, otherwise a bet could take a price that has already moved: live
  // prices have 120s, prematch the hourly refresh window plus a margin (see the constants)
  const at = row.updated_at instanceof Date ? row.updated_at.getTime() : new Date(row.updated_at ?? 0).getTime();
  const maxAge = String(match.service).toUpperCase() === 'LIVE' ? STALE_LIVE_ODDS_MS : STALE_PREMATCH_ODDS_MS;
  if (!at || Date.now() - at > maxAge) {
    throw badRequest('Kuotat po rifreskohen. Provo përsëri pas pak sekondash.');
  }

  const shown = Number(selection?.oddsAtPlacement ?? selection?.odds ?? price);
  if (Number.isFinite(shown) && shown > 0 && Math.abs(price - shown) / shown > PRICE_TOLERANCE) {
    const err = badRequest('Koeficienti ka ndryshuar gjatë vendosjes së bastit.');
    err.code = 'ODDS_CHANGED';
    err.outcomeId = selection.outcomeId;
    err.oldOdds = shown;
    err.newOdds = price;
    err.outcomeName = row.outcome_name ?? parsed.outcomeKey;
    err.marketName = row.market_name ?? parsed.marketKey;
    err.matchName = `${match.home} vs ${match.away}`;
    throw err;
  }

  return {
    matchId: String(matchId),
    marketKey: parsed.marketKey,
    line: String(parsed.line ?? ''),
    outcomeKey: parsed.outcomeKey,
    outcomeName: row.outcome_name ?? parsed.outcomeKey,
    marketName: row.market_name ?? parsed.marketKey,
    matchName: `${match.home} vs ${match.away}`,
    price,
  };
}

// A regular ticket must never multiply correlated picks from one match.
function assertDistinctMatches(lines) {
  const ids = lines.map(line => String(line.matchId));
  if (new Set(ids).size !== ids.length) {
    throw badRequest('Dy markete nga e njëjta ndeshje duhen ndarë në kolona ose zgjedhur si Bet Builder.');
  }
}

// Resolve each template leg through the exact same price, lock, freshness and
// risk checks as a normal ticket. Never trust browser-provided composite odds.
async function resolveBuilderSelection(selection, { matchId, templateId }) {
  if (feedIsRefreshing()) throw badRequest('Kuotat po rifreskohen.');
  const template = (await listTemplates({ activeOnly: true })).find(t => t.id === templateId);
  if (!template) throw badRequest('Bet Builder nuk është më aktiv.');
  const match = await getMatchById(Number(matchId));
  if (!match) throw badRequest('Ndeshja nuk është e disponueshme.');
  const [raw] = await withOdds([match]);
  const projected = toClientMatch(raw);
  if (projected.isSuspended || projected.status === 'ENDED') throw badRequest('Ndeshja është pezulluar.');
  const parts = template.legs.map(leg => findLeg(projected,leg));
  if (parts.some(p => !p)) throw badRequest('Një market i Bet Builder është pezulluar ose mungon.');
  const lines = await Promise.all(parts.map(part => resolveSelection({
    outcomeId: part.outcome.id, oddsAtPlacement: part.outcome.odds,
  })));
  const price = Number(lines.reduce((p,l) => p*l.price,1).toFixed(4));
  if (!Number.isFinite(price) || price <= 1 || price > 1000) throw badRequest('Koeficienti i Bet Builder është jashtë kufirit.');
  const shown = Number(selection?.oddsAtPlacement ?? selection?.odds);
  if (Number.isFinite(shown) && shown > 0 && Math.abs(price-shown)/shown > PRICE_TOLERANCE) {
    const err = badRequest('Koeficienti i Bet Builder ka ndryshuar.');
    err.code = 'ODDS_CHANGED'; err.outcomeId = selection.outcomeId;
    err.oldOdds = shown; err.newOdds = price;
    err.outcomeName = template.name; err.marketName = 'Bet Builder';
    err.matchName = `${match.home} vs ${match.away}`;
    throw err;
  }
  return {
    matchId: String(matchId), marketKey: `BB:${templateId}`, line: '',
    outcomeKey: 'builder', outcomeName: template.name, marketName: 'Bet Builder',
    matchName: `${match.home} vs ${match.away}`, price,
    builderLegs: lines.map(({ matchId: _matchId, ...rest }) => ({
      ...rest, match_id: Number(matchId), market_key: rest.marketKey,
      outcome_key: rest.outcomeKey, outcome_name: rest.outcomeName,
      market_name: rest.marketName,
    })),
  };
}

const round = (n, digits = 2) => Number(Number(n).toFixed(digits));

const TICKET_COLUMNS = `t.id, t.booking_code, t.user_id, t.stake, t.total_odds, t.potential_payout,
                        t.ticket_type, t.system_type, t.status, t.placed_at, t.settled_at`;

const toClientLine = (l) => ({
  id: l.id,
  ticketId: l.ticket_id,
  matchId: String(l.match_id),
  marketId: marketIdOf(String(l.match_id), l.market_key, l.line),
  outcomeId: outcomeIdOf(String(l.match_id), l.market_key, l.line, l.outcome_key),
  outcomeName: l.outcome_name,
  // Return the provider code so UI can disambiguate correlated market labels.
  outcomeCode: l.outcome_key,
  marketName: l.market_name,
  // This parameter is essential for goal-by-minute and other line-specific tickets.
  marketLine: String(l.line ?? ''),
  matchName: l.match_name,
  oddsAtPlacement: Number(l.odds_at_placement),
  status: l.status,
});

/** the shape the app expects (numbers, not the strings numeric columns arrive as) */
export const toClientTicket = (row, lines = [], username = null) => ({
  id: row.id,
  userId: row.user_id,
  bookingCode: row.booking_code,
  stake: Number(row.stake),
  totalOdds: Number(row.total_odds),
  potentialPayout: Number(row.potential_payout),
  ticketType: row.ticket_type,
  systemType: row.system_type,
  status: row.status,
  placedAt: row.placed_at,
  settledAt: row.settled_at,
  user: username ? { username } : null,
  lines: (lines ?? []).map(toClientLine),
});

async function linesOf(ticketId) {
  const res = await query('select * from app_ticket_line where ticket_id = $1 order by id', [ticketId]);
  return res.rows;
}

export async function getTicketWithLines(ticketId) {
  const res = await query(
    `select ${TICKET_COLUMNS}, u.username
       from app_ticket t
       left join app_user u on u.id = t.user_id
      where t.id = $1`,
    [ticketId],
  );
  if (!res.rows.length) return null;
  return toClientTicket(res.rows[0], await linesOf(ticketId), res.rows[0].username ?? null);
}

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function betRequestHash({ stake, selections, ticketType, systemType }) {
  const payload = {
    stake: Number(stake),
    ticketType: ticketType ?? null,
    systemType: systemType ?? null,
    selections: selections.map(s => ({
      outcomeId: String(s.outcomeId ?? ''),
      odds: Number(s.oddsAtPlacement ?? s.odds),
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function existingRequestTicket(userId, requestId, payloadHash, db = { query }) {
  const { rows } = await db.query(
    'select id, request_payload_hash from app_ticket where user_id = $1 and client_request_id = $2',
    [userId, requestId],
  );
  if (!rows.length) return null;
  if (rows[0].request_payload_hash !== payloadHash) {
    throw Object.assign(new Error('Kjo kërkesë basti është përdorur me të dhëna të tjera.'), { status: 409 });
  }
  return rows[0].id;
}

/**
 * Places a real ticket: every selection is validated against the live feed, then the stake,
 * the ticket (with its frozen lines) and the money movement are written in ONE database
 * transaction - a failure can never leave money and tickets out of step.
 */
export async function placeBet({ user, stake, selections = [], ticketType = null, systemType = null, clientRequestId = null }) {
  const amount = Number(stake) || 0;
  if (amount < MIN_STAKE) throw badRequest(`Shuma minimale për të vendosur një bast është ${MIN_STAKE} Lek`);
  if (user.status !== 'ACTIVE') {
    throw Object.assign(new Error('Llogaria juaj nuk është aktive ose është e pezulluar'), { status: 403 });
  }
  if (!selections.length) throw badRequest('Bileta është bosh: zgjidh të paktën një kuotë.');

  if (clientRequestId != null && !requestIdPattern.test(String(clientRequestId))) {
    throw badRequest('Identifikues i pavlefshëm i kërkesës së bastit.');
  }
  const requestId = clientRequestId == null ? null : String(clientRequestId).toLowerCase();
  const payloadHash = requestId ? betRequestHash({ stake: amount, selections, ticketType, systemType }) : null;
  if (requestId) {
    const previous = await existingRequestTicket(user.id, requestId, payloadHash);
    if (previous) return getTicketWithLines(previous);
  }

  const type = ticketTypeForSelectionCount(ticketType, selections.length);
  // Independent odds checks can be awaited together instead of serially.
  const lines = await Promise.all(selections.map(resolveSelection));

  assertDistinctMatches(lines);
  const totalOdds = totalOddsForSelections(lines);
  const payout = calculatePotentialPayout(amount, totalOdds);

  const client = await pool.connect();
  try {
    await client.query('begin');

    // lock the balance row: two simultaneous bets must not both pass the check
    const locked = await client.query('select balance, manager_id, username from app_user where id = $1 for update', [user.id]);
    if (!locked.rows.length) throw badRequest('Llogaria nuk u gjet.');
    // The balance lock serializes simultaneous requests from the same player.
    // An already committed request returns the same ticket, without another debit.
    if (requestId) {
      const previous = await existingRequestTicket(user.id, requestId, payloadHash, client);
      if (previous) {
        await client.query('commit');
        return getTicketWithLines(previous);
      }
    }
    // Serialize risk/exposure calculations globally. This lock is shared
    // across all players and is acquired BEFORE any ticket insertion.
    const riskSettings = await lockLiveRiskSettings(client);
    await assertLiveBetRisk(client, [{ stake: amount, payout, lines }], riskSettings);
    const balance = Number(locked.rows[0].balance);
    await assertPlayerCanBet(client, user.id, amount);
    if (balance - amount < 0) {
      throw badRequest(`Bilanci juaj nuk mjafton për këtë bast. Ju keni ${balance.toLocaleString()} Lek në llogari.`);
    }
    const after = round(balance - amount);

    const inserted = await client.query(
      `insert into app_ticket (user_id, stake, total_odds, potential_payout, ticket_type, system_type, status, client_request_id, request_payload_hash)
       values ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8)
       returning id`,
      [user.id, amount, totalOdds, payout, type, systemType, requestId, payloadHash],
    );
    const ticketId = inserted.rows[0].id;

    // Store all ticket lines in one DB round trip (rather than one per pick).
    for (let offset = 0; offset < lines.length; offset += 100) {
      const batch = lines.slice(offset, offset + 100);
      const params = [];
      const tuples = batch.map((line, index) => {
        const base = index * 10;
        params.push(ticketId, line.matchId, line.marketKey, line.line, line.outcomeKey,
          line.outcomeName, line.marketName, line.matchName, line.price, JSON.stringify(line.builderLegs ?? null));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, 'PENDING', $${base + 10}::jsonb)`;
      });
      await client.query(
        `insert into app_ticket_line
           (ticket_id, match_id, market_key, line, outcome_key, outcome_name, market_name, match_name, odds_at_placement, status, builder_legs)
         values ${tuples.join(', ')}`,
        params,
      );
    }

    await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [user.id, after]);
    await client.query(
      `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
       values ($1, $2, 'BET_PLACED', $3, $4, $5)`,
      [user.id, -amount, ticketId, after, `Bast ${type} - ${lines.length} zgjedhje`],
    );
    await chargeManagerCommission(client, {
      managerId: locked.rows[0].manager_id,
      ticketId,
      username: locked.rows[0].username,
      stake: amount,
      selectionCount: lines.length,
    });

    await client.query('commit');
    return getTicketWithLines(ticketId);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Places 2–24 columns atomically. Stake is PER COLUMN, not the total.
 * The server resolves every leg, rejects same-match multiplications, and charges
 * all columns together under one wallet lock and one idempotency key.
 */
export async function placeColumns({ user, stake, columns, clientRequestId }) {
  const amount = Number(stake);
  if (!Number.isFinite(amount) || amount < MIN_STAKE || round(amount) !== amount) {
    throw badRequest(`Shuma minimale për kolonë është ${MIN_STAKE} Lek.`);
  }
  if (user.role !== 'PLAYER' || user.status !== 'ACTIVE') {
    throw Object.assign(new Error('Llogaria nuk mund të vendosë baste.'), { status: 403 });
  }
  if (!Array.isArray(columns) || columns.length < 2 || columns.length > 24 ||
      columns.some(col => !Array.isArray(col) || col.length < 1 || col.length > 20)) {
    throw badRequest('Numër i pavlefshëm kolonash (2–24).');
  }
  if (!requestIdPattern.test(String(clientRequestId ?? ''))) {
    throw badRequest('Identifikues i pavlefshëm i kërkesës.');
  }
  const requestId = String(clientRequestId).toLowerCase();
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ amount, columns })).digest('hex');
  const getPrevious = async (db) => {
    const { rows } = await db.query(
      'select request_payload_hash, ticket_ids from app_ticket_batch where user_id = $1 and client_request_id = $2',
      [user.id, requestId],
    );
    if (!rows.length) return null;
    if (rows[0].request_payload_hash !== payloadHash) {
      throw Object.assign(new Error('Kjo kërkesë është përdorur me të dhëna të tjera.'), { status: 409 });
    }
    return rows[0].ticket_ids;
  };
  const previous = await getPrevious({ query });
  if (previous) return { tickets: await Promise.all(previous.map(getTicketWithLines)) };

  const resolved = await Promise.all(columns.map(async col => {
    const lines = await Promise.all(col.map(resolveSelection));
    assertDistinctMatches(lines);
    return lines;
  }));
  // Identical columns are not a legitimate split and would duplicate the charge.
  const fingerprints = resolved.map(lines => lines.map(l => outcomeIdOf(l.matchId,l.marketKey,l.line,l.outcomeKey)).sort().join(';'));
  if (new Set(fingerprints).size !== fingerprints.length) throw badRequest('Kolona të përsëritura.');
  const totalStake = round(amount * resolved.length);
  if (!Number.isFinite(totalStake) || totalStake > 100000000) throw badRequest('Shuma totale është shumë e madhe.');

  const client = await pool.connect();
  let ids = [];
  try {
    await client.query('begin');
    const locked = await client.query('select balance, manager_id, username from app_user where id = $1 for update', [user.id]);
    if (!locked.rows.length) throw badRequest('Llogaria nuk u gjet.');
    const retry = await getPrevious(client);
    if (retry) {
      await client.query('commit');
      return { tickets: await Promise.all(retry.map(getTicketWithLines)) };
    }
    const riskSettings = await lockLiveRiskSettings(client);
    await assertLiveBetRisk(client, resolved.map(lines => ({
      stake: amount, payout: calculatePotentialPayout(amount, totalOddsForSelections(lines)), lines,
    })), riskSettings);
    const balance = Number(locked.rows[0].balance);
    await assertPlayerCanBet(client, user.id, totalStake);
    if (balance < totalStake) throw badRequest('Bilanci nuk mjafton për të gjitha kolonat.');
    for (let i = 0; i < resolved.length; i++) {
      const lines = resolved[i];
      const odds = totalOddsForSelections(lines);
      const type = lines.length > 1 ? 'COMBO' : 'SINGLE';
      const inserted = await client.query(
        `insert into app_ticket (user_id, stake, total_odds, potential_payout, ticket_type, status)
         values ($1,$2,$3,$4,$5,'PENDING') returning id`,
        [user.id, amount, odds, calculatePotentialPayout(amount, odds), type],
      );
      const id = inserted.rows[0].id;
      ids.push(id);
      for (const line of lines) {
        await client.query(
          `insert into app_ticket_line
           (ticket_id,match_id,market_key,line,outcome_key,outcome_name,market_name,match_name,odds_at_placement,status,builder_legs)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10::jsonb)`,
          [id,line.matchId,line.marketKey,line.line,line.outcomeKey,line.outcomeName,line.marketName,line.matchName,line.price,JSON.stringify(line.builderLegs ?? null)],
        );
      }
      const after = round(balance - amount * (i + 1));
      await client.query(
        `insert into app_transaction (user_id,amount,type,reference_id,balance_after,description)
         values ($1,$2,'BET_PLACED',$3,$4,$5)`,
        [user.id,-amount,id,after,`Kolona ${i+1}/${resolved.length} - ${type}`],
      );
      await chargeManagerCommission(client, {
        managerId: locked.rows[0].manager_id, ticketId: id,
        username: locked.rows[0].username, stake: amount, selectionCount: lines.length,
      });
    }
    await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [user.id, round(balance-totalStake)]);
    await client.query(
      'insert into app_ticket_batch (user_id,client_request_id,request_payload_hash,ticket_ids) values ($1,$2,$3,$4)',
      [user.id,requestId,payloadHash,ids],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { tickets: await Promise.all(ids.map(getTicketWithLines)) };
}

/**
 * "Book" a ticket: same validation, but no stake and no account - just a shareable code
 * that anyone can look up (the app's booking-code flow).
 */
export async function bookTicket({ stake, selections = [], ticketType = null, systemType = null }) {
  const amount = Number(stake) || 0;
  if (amount < MIN_STAKE) throw badRequest(`Shuma minimale për të prenotuar një skedinë është ${MIN_STAKE} Lek`);
  if (!selections.length) throw badRequest('Bileta është bosh: zgjidh të paktën një kuotë.');

  const type = ticketTypeForSelectionCount(ticketType, selections.length);
  const lines = [];
  for (const selection of selections) lines.push(await resolveSelection(selection));

  const totalOdds = totalOddsForSelections(lines);
  const code = bookingCode();

  const inserted = await query(
    `insert into app_ticket (booking_code, stake, total_odds, potential_payout, ticket_type, system_type, status)
     values ($1, $2, $3, $4, $5, $6, 'PENDING') returning id`,
    [code, amount, totalOdds, calculatePotentialPayout(amount, totalOdds), type, systemType],
  );
  const ticketId = inserted.rows[0].id;

  for (const line of lines) {
    await query(
      `insert into app_ticket_line
         (ticket_id, match_id, market_key, line, outcome_key, outcome_name, market_name, match_name, odds_at_placement, status, builder_legs)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10::jsonb)`,
      [ticketId, line.matchId, line.marketKey, line.line, line.outcomeKey, line.outcomeName, line.marketName, line.matchName, line.price, JSON.stringify(line.builderLegs ?? null)],
    );
  }

  return { bookingCode: code, ticket: await getTicketWithLines(ticketId) };
}

/** attaches lines to ticket rows with one extra query (no N+1) */
async function withLines(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const res = await query('select * from app_ticket_line where ticket_id = any($1::uuid[]) order by id', [ids]);
  const byTicket = new Map();
  for (const line of res.rows) {
    if (!byTicket.has(line.ticket_id)) byTicket.set(line.ticket_id, []);
    byTicket.get(line.ticket_id).push(line);
  }
  return rows.map((row) => toClientTicket(row, byTicket.get(row.id) ?? [], row.username ?? null));
}

/** open tickets (My Bets -> active) */
export async function listActive(userId) {
  const res = await query(
    `select ${TICKET_COLUMNS} from app_ticket t where t.user_id = $1 and t.status = 'PENDING' order by t.placed_at desc`,
    [userId],
  );
  return withLines(res.rows);
}

/** settled tickets (My Bets -> history): the last 50 */
export async function listHistory(userId) {
  const res = await query(
    `select ${TICKET_COLUMNS} from app_ticket t
      where t.user_id = $1 and t.status <> 'PENDING'
      order by t.placed_at desc limit 50`,
    [userId],
  );
  return withLines(res.rows);
}

/** booking code (public) or a ticket id fragment, as the betslip's search box does */
export async function searchTickets(term) {
  const raw = String(term ?? '').trim();
  if (!raw) return null;
  const res = await query(
    `select ${TICKET_COLUMNS}, u.username
       from app_ticket t left join app_user u on u.id = t.user_id
      where t.booking_code = $1 or t.id::text like $2
      order by t.placed_at desc limit 1`,
    [raw.toUpperCase(), `%${raw.toLowerCase()}%`],
  );
  if (!res.rows.length) return null;
  const [ticket] = await withLines(res.rows);
  return ticket;
}

/** a shared booking code, no login needed */
export async function getBookingTicket(code) {
  const res = await query(`select ${TICKET_COLUMNS} from app_ticket t where t.booking_code = $1`, [
    String(code ?? '').toUpperCase(),
  ]);
  if (!res.rows.length) return null;
  const [ticket] = await withLines(res.rows);
  return ticket;
}

/** Refunds an open ticket and its placement-time manager commission atomically. */
export async function revertTicket(ticketId, managerId = null) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const found = await client.query(
      `select t.*, u.manager_id, u.username as player_username
         from app_ticket t
         left join app_user u on u.id = t.user_id
        where t.id = $1
        for update of t`,
      [ticketId],
    );
    const ticket = found.rows[0];
    if (!ticket) throw Object.assign(new Error('ticket not found'), { status: 404 });
    if (ticket.status !== 'PENDING') throw badRequest('only pending tickets can be reverted');
    if (!ticket.user_id) throw badRequest('a booked (guest) ticket has no stake to refund');
    if (managerId && ticket.manager_id !== managerId) {
      throw Object.assign(new Error('this ticket belongs to another manager'), { status: 403 });
    }

    const player = await client.query('select balance from app_user where id = $1 for update', [ticket.user_id]);
    if (!player.rows.length) throw Object.assign(new Error('player not found'), { status: 404 });
    const stake = Number(ticket.stake);
    const balanceAfter = round(Number(player.rows[0].balance) + stake);

    await client.query(`update app_ticket set status = 'REVERTED', settled_at = now() where id = $1`, [ticketId]);
    await client.query(`update app_ticket_line set status = 'VOID' where ticket_id = $1`, [ticketId]);
    await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [ticket.user_id, balanceAfter]);
    await client.query(
      `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
       values ($1, $2, 'TICKET_REVERT', $3, $4, $5)`,
      [ticket.user_id, stake, ticketId, balanceAfter, 'Bileta u anulua nga paneli'],
    );
    await refundManagerCommission(client, {
      managerId: ticket.manager_id,
      ticketId,
      username: ticket.player_username,
    });

    await client.query('commit');
    return { success: true, refunded: stake };
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}