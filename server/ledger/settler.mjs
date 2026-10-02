/**
 * Settlement.
 *
 * Grades the lines of a finished match and closes the tickets: any LOST line makes the
 * ticket LOST, otherwise the ticket is WON with the odds of the surviving lines (VOID
 * lines are removed from the price, as a real bookmaker does), and an all-VOID ticket is
 * refunded. A manager who owns the player carries the payout (WON) or collects the stake
 * (LOST).
 *
 * The rules come from the original app, with one addition: because our feed also delivers
 * corners and cards, those markets can be graded instead of always being voided.
 */
import { pool, query } from '../db.mjs';
import { getMatchById } from '../matches.mjs';
import { getResult, captureFinishedMatches, unsettledMatchIds } from './results.mjs';

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
  const s = String(marketName).toLowerCase();
  if (/corner/.test(s)) return 'CORNERS';
  if (/\bcards?\b|booking|yellow|red/.test(s)) return 'CARDS';
  if (/both teams to score|\bbtts\b/.test(s)) return 'BTTS';
  if (/double chance/.test(s)) return 'DC';
  if (/handicap|fora|asian/.test(s)) return 'HANDICAP';
  if (/full time result|1 ?x ?2|match result|winner|moneyline/.test(s)) return '1X2';
  if (/total|over\/?under|goals|odd\/even/.test(s)) return 'TOTAL';
  return 'OTHER';
}

const num = (v) => (Number.isFinite(Number(String(v).replace(',', '.'))) ? Number(String(v).replace(',', '.')) : null);

/**
 * 'WON' | 'LOST' | 'VOID' for one stored line against a stored result.
 * VOID means "we cannot prove it" - the stake for that line is returned.
 */
export function gradeLine(line, result) {
  const home = Number(result.home_score);
  const away = Number(result.away_score);
  const totalGoals = home + away;
  const homeWin = home > away;
  const awayWin = away > home;
  const draw = home === away;
  const bothScored = home > 0 && away > 0;

  const key = String(line.outcome_key ?? '').toLowerCase().trim();
  const name = String(line.outcome_name ?? '').toLowerCase();
  const lineValue = num(line.line);
  const type = classify(line.market_name);

  const homeName = norm(result.home_team);
  const awayName = norm(result.away_team);
  const isHomeName = (n) => !!n && !!homeName && homeName.startsWith(n);
  const isAwayName = (n) => !!n && !!awayName && awayName.startsWith(n);

  const decide = (yes) => (yes ? 'WON' : 'LOST');

  switch (type) {
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
      if (type === 'CORNERS') {
        if (result.corners_home === null || result.corners_away === null) return 'VOID';
        target = Number(result.corners_home) + Number(result.corners_away);
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
 * Closes one ticket once all of its lines are decided, paying out when it won.
 * Runs in a transaction and re-reads the ticket under a lock, so two settlement passes
 * can never pay the same ticket twice.
 */
export async function recalcTicket(ticketId) {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const found = await client.query('select * from app_ticket where id = $1 for update', [ticketId]);
    const ticket = found.rows[0];
    if (!ticket || ticket.status !== 'PENDING') {
      await client.query('commit');
      return null;
    }

    const lines = (await client.query('select * from app_ticket_line where ticket_id = $1', [ticketId])).rows;
    if (lines.some((l) => l.status === 'PENDING')) {
      await client.query('commit'); // still waiting for another match
      return null;
    }

    const lost = lines.filter((l) => l.status === 'LOST');
    const won = lines.filter((l) => l.status === 'WON');
    const voids = lines.filter((l) => l.status === 'VOID');
    const activeOdds = lines
      .filter((l) => l.status !== 'VOID')
      .reduce((acc, l) => acc * Number(l.odds_at_placement || 1), 1);

    let status;
    let payout;
    if (!lost.length && won.length) {
      status = 'WON';
      payout = round(Number(ticket.stake) * activeOdds);
    } else if (!lost.length && !won.length && voids.length) {
      status = 'VOID';
      payout = round(Number(ticket.stake)); // full refund
    } else {
      status = 'LOST';
      payout = 0;
    }

    await client.query(
      `update app_ticket set status = $2, potential_payout = $3, settled_at = now() where id = $1`,
      [ticketId, status, payout || Number(ticket.potential_payout)],
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

    // the manager who owns the player carries a win, and collects a loss
    if (ticket.user_id) {
      const user = await client.query('select manager_id, username from app_user where id = $1', [ticket.user_id]);
      const managerId = user.rows[0]?.manager_id;
      if (managerId && (status === 'WON' || status === 'LOST')) {
        const amount = status === 'WON' ? -payout : Number(ticket.stake);
        const manager = await client.query('select balance from app_user where id = $1 for update', [managerId]);
        const managerAfter = round(Number(manager.rows[0]?.balance ?? 0) + amount);
        await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [managerId, managerAfter]);
        await client.query(
          `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            managerId,
            amount,
            status === 'WON' ? 'MANAGER_PAYOUT_DEDUCTION' : 'MANAGER_LOST_COLLECTED',
            ticketId,
            managerAfter,
            status === 'WON'
              ? `Pagesë për biletën fituese të lojtarit ${user.rows[0].username}`
              : `Fonde nga bileta humbëse e lojtarit ${user.rows[0].username}`,
          ],
        );
      }
    }

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
export async function settleMatch(matchId) {
  const result = await getResult(matchId);
  if (!result) return { matchId: String(matchId), settled: 0, reason: 'no result stored yet' };

  const lines = (
    await query(`select * from app_ticket_line where match_id = $1 and status = 'PENDING'`, [Number(matchId)])
  ).rows;
  if (!lines.length) return { matchId: String(matchId), settled: 0 };

  const tickets = new Set();
  for (const line of lines) {
    const status = gradeLine(line, result);
    await query(`update app_ticket_line set status = $2 where id = $1 and status = 'PENDING'`, [line.id, status]);
    tickets.add(line.ticket_id);
  }

  const closed = [];
  for (const ticketId of tickets) {
    const done = await recalcTicket(ticketId);
    if (done) closed.push(done);
  }

  await query('update app_match_result set settled_at = now() where match_id = $1', [Number(matchId)]);
  return { matchId: String(matchId), settled: lines.length, tickets: closed };
}

/** one pass: store newly finished results, then settle everything that can be settled */
export async function settleAll() {
  const captured = await captureFinishedMatches();
  const ids = await unsettledMatchIds();

  const results = [];
  for (const id of ids) results.push(await settleMatch(id));

  return {
    captured,
    matches: ids.length,
    lines: results.reduce((acc, r) => acc + r.settled, 0),
    closed: results.reduce((acc, r) => acc + (r.tickets?.length ?? 0), 0),
  };
}

/**
 * Safety valve: a ticket older than `hours` whose match has no stored result and is no
 * longer on the board can never be judged, so its lines are voided and the stake returned.
 */
export async function voidUnresolved(hours = 12) {
  const rows = (
    await query(
      `select l.id, l.ticket_id, l.match_id
         from app_ticket_line l
         join app_ticket t on t.id = l.ticket_id
        where l.status = 'PENDING'
          and t.status = 'PENDING'
          and t.placed_at < now() - make_interval(hours => $1::int)`,
      [Math.max(1, Number(hours) || 12)],
    )
  ).rows;

  const touched = new Set();
  let voided = 0;
  for (const row of rows) {
    if (await getResult(row.match_id)) continue; // settleMatch will handle it
    if (await getMatchById(row.match_id)) continue; // still on the board: give it time
    await query(`update app_ticket_line set status = 'VOID' where id = $1 and status = 'PENDING'`, [row.id]);
    touched.add(row.ticket_id);
    voided++;
  }

  const closed = [];
  for (const ticketId of touched) {
    const done = await recalcTicket(ticketId);
    if (done) closed.push(done);
  }

  return { voided, closed };
}