/**
 * Bets: place, book (share a code), list, cash out.
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
import { getMatchById } from '../matches.mjs';
import { feedIsRefreshing } from '../idle-mode.mjs';
import * as overrides from './overrides.mjs';
import { outcomeIdOf, marketIdOf, parseOutcomeId } from './view.mjs';

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
  if (row.suspended === true) throw badRequest('Kjo kuotë është pezulluar për momentin.');

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

  // prices must be fresh, otherwise a bet could take a price that has already moved: live
  // prices have 120s, prematch the hourly refresh window plus a margin (see the constants)
  const at = row.updated_at instanceof Date ? row.updated_at.getTime() : new Date(row.updated_at ?? 0).getTime();
  const maxAge = String(match.service).toUpperCase() === 'LIVE' ? STALE_LIVE_ODDS_MS : STALE_PREMATCH_ODDS_MS;
  if (!at || Date.now() - at > maxAge) {
    throw badRequest('Kuotat po rifreskohen. Provo përsëri pas pak sekondash.');
  }

  const shown = Number(selection?.oddsAtPlacement ?? selection?.odds ?? price);
  if (Number.isFinite(shown) && shown > 0 && Math.abs(price - shown) / shown > PRICE_TOLERANCE) {
    throw badRequest('Koeficientët kanë ndryshuar gjatë vendosjes. Ju lutem pranoni koeficientët e rinj.');
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

/** COMBO multiplies the prices; anything else takes the last selection's price (as before) */
function totalOddsFor(ticketType, lines) {
  if (!lines.length) return 0;
  if (ticketType === 'COMBO') return lines.reduce((acc, l) => acc * l.price, 1);
  return lines[lines.length - 1].price;
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
  marketName: l.market_name,
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
  const res = await query(`select ${TICKET_COLUMNS} from app_ticket t where t.id = $1`, [ticketId]);
  if (!res.rows.length) return null;
  return toClientTicket(res.rows[0], await linesOf(ticketId));
}

/**
 * Places a real ticket: every selection is validated against the live feed, then the stake,
 * the ticket (with its frozen lines) and the money movement are written in ONE database
 * transaction - a failure can never leave money and tickets out of step.
 */
export async function placeBet({ user, stake, selections = [], ticketType = null, systemType = null }) {
  const amount = Number(stake) || 0;
  if (amount < MIN_STAKE) throw badRequest(`Shuma minimale për të vendosur një bast është ${MIN_STAKE} Lek`);
  if (user.status !== 'ACTIVE') {
    throw Object.assign(new Error('Llogaria juaj nuk është aktive ose është e pezulluar'), { status: 403 });
  }
  if (!selections.length) throw badRequest('Bileta është bosh: zgjidh të paktën një kuotë.');

  const type = ticketType || (selections.length > 1 ? 'COMBO' : 'SINGLE');
  const lines = [];
  for (const selection of selections) lines.push(await resolveSelection(selection));

  const totalOdds = totalOddsFor(type, lines);
  const potentialPayout = round(amount * totalOdds);

  const client = await pool.connect();
  try {
    await client.query('begin');

    // lock the balance row: two simultaneous bets must not both pass the check
    const locked = await client.query('select balance from app_user where id = $1 for update', [user.id]);
    if (!locked.rows.length) throw badRequest('Llogaria nuk u gjet.');
    const balance = Number(locked.rows[0].balance);
    if (balance - amount < 0) {
      throw badRequest(`Bilanci juaj nuk mjafton për këtë bast. Ju keni ${balance.toLocaleString()} Lek në llogari.`);
    }
    const after = round(balance - amount);

    const inserted = await client.query(
      `insert into app_ticket (user_id, stake, total_odds, potential_payout, ticket_type, system_type, status)
       values ($1, $2, $3, $4, $5, $6, 'PENDING')
       returning id`,
      [user.id, amount, totalOdds, potentialPayout, type, systemType],
    );
    const ticketId = inserted.rows[0].id;

    for (const line of lines) {
      await client.query(
        `insert into app_ticket_line
           (ticket_id, match_id, market_key, line, outcome_key, outcome_name, market_name, match_name, odds_at_placement, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')`,
        [ticketId, line.matchId, line.marketKey, line.line, line.outcomeKey, line.outcomeName, line.marketName, line.matchName, line.price],
      );
    }

    await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [user.id, after]);
    await client.query(
      `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
       values ($1, $2, 'BET_PLACED', $3, $4, $5)`,
      [user.id, -amount, ticketId, after, `Bast ${type} - ${lines.length} zgjedhje`],
    );

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
 * "Book" a ticket: same validation, but no stake and no account - just a shareable code
 * that anyone can look up (the app's booking-code flow).
 */
export async function bookTicket({ stake, selections = [], ticketType = null, systemType = null }) {
  const amount = Number(stake) || 0;
  if (amount < MIN_STAKE) throw badRequest(`Shuma minimale për të prenotuar një skedinë është ${MIN_STAKE} Lek`);
  if (!selections.length) throw badRequest('Bileta është bosh: zgjidh të paktën një kuotë.');

  const type = ticketType || (selections.length > 1 ? 'COMBO' : 'SINGLE');
  const lines = [];
  for (const selection of selections) lines.push(await resolveSelection(selection));

  const totalOdds = totalOddsFor(type, lines);
  const code = bookingCode();

  const inserted = await query(
    `insert into app_ticket (booking_code, stake, total_odds, potential_payout, ticket_type, system_type, status)
     values ($1, $2, $3, $4, $5, $6, 'PENDING') returning id`,
    [code, amount, totalOdds, round(amount * totalOdds), type, systemType],
  );
  const ticketId = inserted.rows[0].id;

  for (const line of lines) {
    await query(
      `insert into app_ticket_line
         (ticket_id, match_id, market_key, line, outcome_key, outcome_name, market_name, match_name, odds_at_placement, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')`,
      [ticketId, line.matchId, line.marketKey, line.line, line.outcomeKey, line.outcomeName, line.marketName, line.matchName, line.price],
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

/**
 * Cash out an open ticket early: 70% of the potential payout (the original rule), the
 * ticket closes as WON, and a manager who owns the player carries the deduction.
 */
export async function cashOut(ticketId, userId) {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const found = await client.query('select * from app_ticket where id = $1 and user_id = $2 for update', [ticketId, userId]);
    const ticket = found.rows[0];
    if (!ticket || ticket.status !== 'PENDING') throw badRequest('Bileta nuk është e vlefshme ose është mbyllur.');

    const reduced = round(Number(ticket.potential_payout) * 0.7);

    await client.query(`update app_ticket set status = 'WON', potential_payout = $2, settled_at = now() where id = $1`, [
      ticket.id,
      reduced,
    ]);
    await client.query(`update app_ticket_line set status = 'VOID' where ticket_id = $1`, [ticket.id]);

    const user = await client.query('select balance, manager_id, username from app_user where id = $1 for update', [userId]);
    const after = round(Number(user.rows[0].balance) + reduced);
    await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [userId, after]);
    await client.query(
      `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
       values ($1, $2, 'BET_WON', $3, $4, $5)`,
      [userId, reduced, ticket.id, after, 'Cash-out i biletës'],
    );

    const managerId = user.rows[0].manager_id;
    if (managerId) {
      const manager = await client.query('select balance from app_user where id = $1 for update', [managerId]);
      const managerAfter = round(Number(manager.rows[0]?.balance ?? 0) - reduced);
      await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [managerId, managerAfter]);
      await client.query(
        `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
         values ($1, $2, 'MANAGER_PAYOUT_DEDUCTION', $3, $4, $5)`,
        [managerId, -reduced, ticket.id, managerAfter, `Pagesë për cash-out të lojtarit ${user.rows[0].username}`],
      );
    }

    await client.query('commit');
    return { success: true, amount: reduced };
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}