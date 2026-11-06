/**
 * Settlement.
 *
 * Grades the lines of a finished match and closes the tickets: any LOST line makes the
 * ticket LOST, otherwise the ticket is WON with the odds of the surviving lines (VOID
 * lines are removed from the price, as a real bookmaker does), and an all-VOID ticket is
 * refunded. Manager commissions and results remain reports for manual settlement;
 * player payouts are the only automatic wallet movement here.
 *
 * The rules come from the original app, with one addition: because our feed also delivers
 * corners and cards, those markets can be graded instead of always being voided.
 */
import { pool, query } from '../db.mjs';
import {gradeEventLine,needsEvents,gradeClosedCornerWindow,loadEventEvidence} from './event-evidence.mjs';
import { getMatchById } from '../matches.mjs';
import { getResult, captureFinishedMatches, unsettledMatchIds } from './results.mjs';
import { chargeManagerCommission, refundManagerCommission } from './manager-finance.mjs';
import { isResultBttsMarket, parseResultBttsOutcome, gradeResultBtts } from './result-btts.mjs';
import { isResultTotalMarket, isTotalBttsMarket, isFirstHalfResultBtts, parseResultTotal, parseTotalBtts, gradeMixedTotal } from './mixed-combos.mjs';
import { systemColumnPayout } from './system-columns.mjs';
import { eventMarketRequirement } from './event-market-policy.mjs';
import { isStatisticMarket, hasStatisticEvidence, gradeStatisticLine } from './statistic-markets.mjs';
import {goalTotalContract} from './goal-total-contract.mjs';
import {cornerTotalContract} from './corner-total-contract.mjs';
import {statisticsNeedReview} from './settlement-review.mjs';
import {auditSettledLiveSelections} from './stitch-settlement-audit.mjs';
import {createLiveSettlementPreviews} from './live-shadow-settlement.mjs';
import {backfillPendingTeamGoalContracts} from './live-contract-backfill.mjs';
import {settleVerifiedLiveProposals} from './verified-live-settlement.mjs';

const round = (n) => Number(Number(n).toFixed(2));

/** accents/spaces removed so "Südtirol" == "sudtirol" and team names compare safely */
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** which family a market belongs to, from the name we stored with the line */
function classify(marketName = '') {
  if (isFirstHalfResultBtts(marketName)) return 'HALF_RESULT_BTTS';
  if (isResultTotalMarket(marketName)) return 'RESULT_TOTAL';
  if (isTotalBttsMarket(marketName)) return 'TOTAL_BTTS';
  if (isResultBttsMarket(marketName)) return 'RESULT_BTTS';
  const s = String(marketName).toLowerCase();
  if (/corner/.test(s)) return 'CORNERS';
  if (/\bcards?\b|booking|yellow|red/.test(s)) return 'CARDS';
  if (/both teams to score|\bbtts\b/.test(s)) return 'BTTS';
  if (isFirstHalfLine(s) && /\b(?:result|winner|1x2)\b/.test(s)) return '1X2';
  if (/double chance/.test(s)) return 'DC';
  if (/handicap|fora|asian/.test(s)) return 'HANDICAP';
  if (/full time result|1 ?x ?2|match result|winner|moneyline/.test(s)) return '1X2';
  if (/total|over\/?under|goals|odd\/even/.test(s)) return 'TOTAL';
  return 'OTHER';
}

const num = (v) => (v != null && v !== '' && Number.isFinite(Number(String(v).replace(',', '.'))) ? Number(String(v).replace(',', '.')) : null);
const isFirstHalfLine = (marketName = '') =>
  /\b(?:first|1st)\s*half\b|\b1h\b|\bhalf.?time\b|^ht(?:\s|$)/i.test(marketName) &&
  !/halftime\s*\/?\s*fulltime|ht\s*\/\s*ft/i.test(marketName);
const isSecondHalfLine = (marketName = '') =>
  /\b(?:second|2nd)\s*half\b|\b2h\b/i.test(marketName);

/** A known final score is not enough to grade first-half/corner/card props.
 * Keep those lines pending for more authoritative feed evidence instead of
 * inventing a win/loss or immediately refunding a valid winning proposition.
 */
export function hasRequiredSettlementEvidence(line, result) {
  if (!result) return false;
  if(statisticsNeedReview(line,result))return false;
  if (Array.isArray(line.builder_legs)) return line.builder_legs.every(leg => hasRequiredSettlementEvidence(leg, result));
  if (needsEvents(line)) return ['WON','LOST','VOID'].includes(gradeEventLine(line,result));
  if (isStatisticMarket(line)) return hasStatisticEvidence(line,result);
  const marketName = String(line.market_name ?? '');
  if (isFirstHalfLine(marketName) && (result.half_home_score == null || result.half_away_score == null)) return false;
  const family = goalTotalContract(line,result)?'TOTAL':classify(marketName);
  if (family === 'CORNERS') {
    const contract = cornerTotalContract(line, result);
    if (!contract) return false;
    if ((contract.scope !== 'away' && result.corners_home == null) ||
        (contract.scope !== 'home' && result.corners_away == null)) return false;
  }
  if (family === 'CARDS' && (result.cards_home == null || result.cards_away == null)) return false;
  // Early-payout promotions depend on event history, not only the final score.
  if (/early\s*payout/i.test(marketName)) return false;
  return true;
}

/**
 * 'WON' | 'LOST' | 'VOID' for one stored line against a stored result.
 * VOID means "we cannot prove it" - the stake for that line is returned.
 */
export function gradeLine(line, result) {
  if(needsEvents(line)&&!Array.isArray(line.builder_legs))return gradeEventLine(line,result)??'VOID';
  if (line.builder_legs !== null && line.builder_legs !== undefined) {
    const legs = line.builder_legs;
    if (!Array.isArray(legs) || legs.length < 2 || legs.length > 5 || legs.some(l => l.builder_legs)) return 'VOID';
    const statuses = legs.map(leg => gradeLine(leg,result));
    if (statuses.includes('LOST')) return 'LOST';
    return statuses.every(s => s === 'WON') ? 'WON' : 'VOID';
  }
  // 1H totals and BTTS cannot be graded from the full-time score. Their
  // original ticket contract is snapshotted in market_name.
  if (!hasRequiredSettlementEvidence(line, result)) return 'VOID';
  if (isStatisticMarket(line)) return gradeStatisticLine(line,result);
  if (isSecondHalfLine(line.market_name)) return 'VOID'; // no 2H score snapshot
  const half = isFirstHalfLine(line.market_name);
  const home = Number(half ? result.half_home_score : result.home_score);
  const away = Number(half ? result.half_away_score : result.away_score);
  const totalGoals = home + away;
  const homeWin = home > away;
  const awayWin = away > home;
  const draw = home === away;
  const bothScored = home > 0 && away > 0;

  const key = String(line.outcome_key ?? '').toLowerCase().trim();
  const name = String(line.outcome_name ?? '').toLowerCase();
  const lineValue = num(line.line);
  const goalTotal=goalTotalContract(line,result);
  const cornerTotal=cornerTotalContract(line,result);
  const type = goalTotal?'TOTAL':classify(line.market_name);

  const homeName = norm(result.home_team);
  const awayName = norm(result.away_team);
  const isHomeName = (n) => !!n && !!homeName && homeName.startsWith(n);
  const isAwayName = (n) => !!n && !!awayName && awayName.startsWith(n);

  const decide = (yes) => (yes ? 'WON' : 'LOST');

  switch (type) {
    case 'HALF_RESULT_BTTS': {
      if (result.half_home_score == null || result.half_away_score == null) return 'VOID';
      const selection = parseResultBttsOutcome(line.outcome_key, result.home_team, result.away_team)
        ?? parseResultBttsOutcome(line.outcome_name, result.home_team, result.away_team);
      return gradeResultBtts(selection, result.half_home_score, result.half_away_score);
    }
    case 'RESULT_TOTAL':
    case 'TOTAL_BTTS': {
      const parse = type === 'RESULT_TOTAL' ? parseResultTotal : parseTotalBtts;
      const selection = parse(line.outcome_key, result.home_team, result.away_team)
        ?? parse(line.outcome_name, result.home_team, result.away_team);
      return gradeMixedTotal(line.market_name, selection, home, away);
    }
    case 'RESULT_BTTS': {
      const selection = parseResultBttsOutcome(line.outcome_key, result.home_team, result.away_team)
        ?? parseResultBttsOutcome(line.outcome_name, result.home_team, result.away_team);
      if (!selection) return 'VOID'; // Never grade an unidentified combination as ordinary BTTS.
      return gradeResultBtts(selection, home, away);
    }
    case '1X2': {
      if (key === '1' || key === 'home' || /^home/.test(name)) return decide(homeWin);
      if (key === 'x' || key === 'draw' || /^draw|^tie/.test(name)) return decide(draw);
      if (key === '2' || key === 'away' || /^away/.test(name)) return decide(awayWin);
      if (isHomeName(norm(name))) return decide(homeWin);
      if (isAwayName(norm(name))) return decide(awayWin);
      return 'VOID';
    }

    case 'DC': {
      if (key === '1x' || key === 'homeordraw') return decide(homeWin || draw);
      if (key === '12' || key === 'homeoraway') return decide(homeWin || awayWin);
      if (key === 'x2' || key === 'draworaway') return decide(awayWin || draw);
      const flat = norm(name);
      if (/^1x|homeordraw/.test(flat)) return decide(homeWin || draw);
      if (/^12|homeoraway/.test(flat)) return decide(homeWin || awayWin);
      if (/^x2|draworaway/.test(flat)) return decide(awayWin || draw);
      return 'VOID';
    }

    case 'BTTS':
      if (key === 'yes' || /^yes/.test(name)) return decide(bothScored);
      if (key === 'no' || /^no/.test(name)) return decide(!bothScored);
      return 'VOID';

    case 'TOTAL':
    case 'CORNERS':
    case 'CARDS': {
      let target = totalGoals;
      if(type==='TOTAL'&&goalTotal?.scope==='home')target=home;
      if(type==='TOTAL'&&goalTotal?.scope==='away')target=away;
      if (type === 'CORNERS') {
        if (!cornerTotal) return 'VOID';
        const h=num(result.corners_home),a=num(result.corners_away);
        if (cornerTotal.scope==='home' && h===null || cornerTotal.scope==='away' && a===null ||
            cornerTotal.scope==='total' && (h===null || a===null)) return 'VOID';
        target = cornerTotal.scope==='home'?h:cornerTotal.scope==='away'?a:h+a;
      }
      if (type === 'CARDS') {
        if (result.cards_home === null || result.cards_away === null) return 'VOID';
        target = Number(result.cards_home) + Number(result.cards_away);
      }
      if (lineValue === null) return 'VOID';
      if (key === 'over' || /^over/.test(name)) return decide(target > lineValue);
      if (key === 'under' || /^under/.test(name)) return decide(target < lineValue);
      return 'VOID';
    }

    case 'HANDICAP': {
      if (lineValue === null) return 'VOID';
      const side = key === '1' || /^home/.test(name) || isHomeName(norm(name)) ? 'home' : key === '2' || /^away/.test(name) || isAwayName(norm(name)) ? 'away' : null;
      if (!side) return 'VOID';
      const adjusted = (side === 'home' ? home : away) + lineValue;
      const opponent = side === 'home' ? away : home;
      if (adjusted === opponent) return 'VOID'; // push: stake returned
      return decide(adjusted > opponent);
    }

    default:
      // anything we cannot judge (player props, halves, unknown markets) is voided
      return 'VOID';
  }
}

/**
 * Closes a ticket after all legs resolve, or immediately when any leg loses.
 * A lost accumulator can close while unrelated lines are still PENDING.
 *
 * Runs in a transaction and re-reads the ticket under a lock, so two settlement passes
 * can never pay the same ticket twice.
 */
export async function recalcTicket(ticketId, { database = pool } = {}) {
  const client = await database.connect();
  try {
    await client.query('begin');

    const found = await client.query('select * from app_ticket where id = $1 for update', [ticketId]);
    const ticket = found.rows[0];
    if (!ticket || ticket.status !== 'PENDING') {
      await client.query('commit');
      return null;
    }

    const lines = (await client.query('select * from app_ticket_line where ticket_id = $1', [ticketId])).rows;
    const lost = lines.filter((l) => l.status === 'LOST');
    // A standard accumulator is lost as soon as ANY accepted selection loses.
    // Do not leave a provably lost ticket open just because other games remain live.
    // Preserve other line statuses as PENDING for an honest per-match audit.
    if (!lost.length && lines.some((l) => l.status === 'PENDING')) {
      await client.query('commit'); // no losing leg; still waiting for another match
      return null;
    }

    const won = lines.filter((l) => l.status === 'WON');
    const voids = lines.filter((l) => l.status === 'VOID');

    let status;
    let payout;
    if (!lost.length && won.length) {
      status = 'WON';
      // Honor the accepted ticket quote in full, including legacy rounding.
      // Only removed VOID legs require recomputing the reduced contract.
      payout = voids.length
        ? systemColumnPayout(Number(ticket.stake), won.map(line => line.odds_at_placement))
        : round(Number(ticket.potential_payout));
    } else if (!lost.length && !won.length && voids.length) {
      status = 'VOID';
      payout = round(Number(ticket.stake)); // full refund
    } else {
      status = 'LOST';
      payout = 0;
    }

    await client.query(
      `update app_ticket set status = $2, potential_payout = $3, settled_at = now() where id = $1`,
      [ticketId, status, payout],
    );

    if (payout > 0 && ticket.user_id) {
      const userRow = await client.query('select balance, manager_id, username from app_user where id = $1 for update', [
        ticket.user_id,
      ]);
      const after = round(Number(userRow.rows[0].balance) + payout);
      await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [ticket.user_id, after]);
      await client.query(
        `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          ticket.user_id,
          payout,
          status === 'VOID' ? 'BET_REFUND' : 'BET_WON',
          ticketId,
          after,
          status === 'VOID' ? 'Kthim basti (VOID)' : 'Fitim basti',
        ],
      );
    }

    // Manager earnings are reports for manual settlement, never wallet money.
    if (ticket.user_id) {
      const user = await client.query('select manager_id, username from app_user where id = $1', [ticket.user_id]);
      const managerId = user.rows[0]?.manager_id;
      if (managerId && (status === 'WON' || status === 'LOST')) {
        await chargeManagerCommission(client, {managerId,ticketId,username:user.rows[0].username,stake:ticket.stake,selectionCount:lines.length});
      } else if (status === 'VOID') {
        // Refund actual historical debits to their original actor exactly once.
        const actors=await client.query(`select distinct user_id from app_transaction where reference_id=$1 and type='MANAGER_COMMISSION_DEBIT' order by user_id`,[ticketId]);
        for(const actor of actors.rows)await refundManagerCommission(client,{managerId:actor.user_id,ticketId,username:user.rows[0]?.username});
      }
    }

    // Freeze fully graded results in the same transaction as their payment.
    // A recovered payment must not leave its accepted score open to a later
    // conflicting provider frame because the original match pass was aborted.
    await client.query(`update app_match_result r set settled_at=coalesce(r.settled_at,now())
      where r.match_id in (select match_id from app_ticket_line where ticket_id=$1)
        and not exists(select 1 from app_ticket_line l where l.match_id=r.match_id and l.status='PENDING')`, [ticketId]);
    await client.query('commit');
    return { ticketId, status, payout };
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** grades every pending line of one match, then closes the affected tickets */
export async function updatePendingLine(lineId,status,ticketId,{database=pool}={}){
  const client=await database.connect();
  try{
    await client.query('begin');
    const ticket=(await client.query('select status from app_ticket where id=$1 for update',[ticketId])).rows[0];
    const changed=ticket?.status==='PENDING'?await client.query(`update app_ticket_line set status=$2 where id=$1 and status='PENDING' and not exists(select 1 from app_settlement_override o where o.line_id=app_ticket_line.id)`,[lineId,status]):{rowCount:0};
    await client.query('commit');return changed.rowCount;
  }catch(error){await client.query('rollback').catch(()=>{});throw error;}finally{client.release();}
}
export async function settleMatch(matchId) {
  const result = await getResult(matchId);
  if (!result) return { matchId: String(matchId), settled: 0, reason: 'no result stored yet' };

  const lines = (
    await query(`select l.* from app_ticket_line l where match_id = $1 and l.status = 'PENDING' and not exists(select 1 from app_settlement_override o where o.line_id=l.id)`, [Number(matchId)])
  ).rows;
  if (!lines.length) return { matchId: String(matchId), settled: 0 };

  const tickets = new Set();
  let graded = 0;
  for (const line of lines) {
    if (!hasRequiredSettlementEvidence(line, result)) continue;
    const status = gradeLine(line, result);
    const updated = await updatePendingLine(line.id,status,line.ticket_id);
    if (updated > 0) graded++;
    tickets.add(line.ticket_id);
  }

  const closed = [];
  for (const ticketId of tickets) {
    const done = await recalcTicket(ticketId);
    if (done) closed.push(done);
  }

  // Keep accepting later provider corner/card/HT statistics until every
  // selection is gradeable. Premature settled_at blocked archival refreshes.
  if (graded === lines.length) {
    await query(
      `update app_match_result set settled_at = now()
        where match_id = $1 and not exists
          (select 1 from app_ticket_line
            where match_id = $1 and status = 'PENDING')`,
      [Number(matchId)],
    );
  }
  return { matchId: String(matchId), settled: graded, awaitingEvidence: lines.length - graded, tickets: closed };
}

/** Grade only verified, elapsed corner YES/NO windows, independently of a
 * full-time result. Every other live market remains on the existing final
 * result path; missing evidence means PENDING rather than a guessed answer.
 */
export async function settleClosedCornerWindows({runQuery=query,loadEvidence=loadEventEvidence,update=updatePendingLine,recalc=recalcTicket}={}){
 const {rows}=await runQuery(`select l.* from app_ticket_line l
   join app_ticket t on t.id=l.ticket_id
   where l.status='PENDING' and t.status='PENDING'
     and l.market_name ~* 'corner'
     and l.market_name ~* '(minute|from)'
     and not exists(select 1 from app_settlement_override o where o.line_id=l.id)
   order by l.match_id,l.id`);
 const cache=new Map(),tickets=new Set();let graded=0;
 for(const line of rows){
  const id=String(line.match_id);
  if(!cache.has(id))cache.set(id,await loadEvidence(id).catch(()=>null));
  const status=gradeClosedCornerWindow(line,cache.get(id));
  if(status!== 'WON'&&status!=='LOST')continue;
  if(await update(line.id,status,line.ticket_id)){
   graded++;tickets.add(line.ticket_id);
  }
 }
 const closed=[];
 for(const id of tickets){const ticket=await recalc(id);if(ticket)closed.push(ticket);}
 return {graded,closed};
}

/** Line grading commits before ticket payment. A crash or transient database
 * error in between must not strand an otherwise resolved ticket forever.
 * Reuse the existing locked, idempotent payment transaction for every retry.
 */
export async function recoverResolvedTickets() {
  const { rows } = await query(`select t.id from app_ticket t
    where t.status='PENDING'
      and exists(select 1 from app_ticket_line l where l.ticket_id=t.id)
      and (exists(select 1 from app_ticket_line l where l.ticket_id=t.id and l.status='LOST')
        or not exists(select 1 from app_ticket_line l where l.ticket_id=t.id and l.status='PENDING'))
    order by t.placed_at,t.id`);
  const recovered = [];
  for (const { id } of rows) {
    try {
      const ticket = await recalcTicket(id);
      if (ticket) recovered.push(ticket);
    } catch (error) { console.error('[settle] resolved ticket', id, 'retry failed:', error.message); }
  }
  return recovered;
}

/** one pass: store newly finished results, then settle everything that can be settled */
export async function settleAll() {
  // Recover contracts for already accepted team-goal tickets before reading
  // the newest Zizobet frame or proposing a wallet settlement.
  let backfilled={examined:0,filled:0};
  try{backfilled=await backfillPendingTeamGoalContracts();}
  catch(error){console.error('[settle] team-goal backfill failed:',error.message);}
  let captured = 0;
  // A malformed/unavailable catalogue must not block already stored results or
  // recovery of payments whose line grading succeeded in an earlier pass.
  try { captured = await captureFinishedMatches(); }
  catch (error) { console.error('[settle] result capture failed:', error.message); }
  const ids = await unsettledMatchIds();

  const results = [];
  for (const id of ids) {
    try { results.push(await settleMatch(id)); }
    catch (e) { console.error('[settle] match', id, 'failed:', e.message); }
  }
  let windows={graded:0,closed:[]};
  try {windows=await settleClosedCornerWindows();}
  catch(error){console.error('[settle] elapsed corner windows failed:',error.message);}
  // Re-verify a proposal against a subsequent fresh PRIMARY-provider poll
  // BEFORE refreshing it. Real writes require an explicit opt-in flag.
  let verifiedLive={enabled:false,examined:0,graded:0,closed:[]};
  try{verifiedLive=await settleVerifiedLiveProposals({
    updateLine:updatePendingLine,closeTicket:recalcTicket
  });}
  catch(error){console.error('[settle] verified live settlement failed:',error.message);}
  let preview={examined:0,proposed:0,held:0,mode:'SHADOW_ONLY'};
  try{preview=await createLiveSettlementPreviews();}
  catch(error){console.warn('[settle] live shadow preview failed:',error.message);}
  const recovered = await recoverResolvedTickets();
  try {await auditSettledLiveSelections();}
  catch(error){console.warn('[settle] Stitch audit failed:',error.message);}

  return {
    captured,
    matches: ids.length,
    lines: results.reduce((acc, r) => acc + r.settled, 0) + windows.graded + verifiedLive.graded,
    closed: results.reduce((acc, r) => acc + (r.tickets?.length ?? 0), 0) + windows.closed.length + verifiedLive.closed.length + recovered.length,
    recovered: recovered.length,
    backfilled,
    verifiedLive:{enabled:verifiedLive.enabled,examined:verifiedLive.examined,graded:verifiedLive.graded,closed:verifiedLive.closed.length},
    livePreview:preview,
  };
}

/**
 * A stored match can remain retrievable long after the feed removed it.
 * Retrieval by ID does not mean a finished/inactive match is still in play.
 * Never void a genuinely active game merely because its clock is delayed.
 */
export const isStillOnBoard = (match, at = Date.now()) => {
  if (!match || match.active === false ||
      ['ended', 'finished', 'cancelled'].includes(String(match.status ?? '').toLowerCase())) return false;
  const kickoff = match.start_at ?? match.startAt;
  const startedAt = kickoff ? new Date(kickoff).getTime() : NaN;
  // An old provider row can remain active forever after an abandoned socket
  // subscription. After a *full day* beyond scheduled kickoff it is not a
  // credible in-progress football match, even if the API retained LIVE status.
  // This only matters after the ticket's separate 72h timeout has elapsed.
  if (Number.isFinite(startedAt) && at - startedAt > 24 * 60 * 60 * 1000) return false;
  return true;
};

/**
 * Safety valve: a ticket older than `hours` whose match has no stored result and is no
 * longer on the board can never be judged, so its lines are voided and the stake returned.
 */
/** Unconfirmed evidence is NOT cancellation authority. A timed refund
 * would turn an unverified winner into VOID and silently move player funds.
 * The administrator's review queue owns these cases until a documented
 * decision is recorded via manualSettlement. Genuine provider cancellation
 * requires its own explicit, audited contract rule, never elapsed time alone.
 */
export async function voidUnresolved(hours = 72) {
  const cutoff=Math.max(24,Math.trunc(Number(hours)||72));
  const pending=await query(`select count(*)::int as count
    from app_ticket_line l join app_ticket t on t.id=l.ticket_id
    where l.status='PENDING' and t.status='PENDING'
      and t.placed_at<now()-make_interval(hours=>$1::int)`,[cutoff]);
  return {voided:0,closed:[],heldForManualReview:Number(pending.rows[0]?.count??0)};
}
