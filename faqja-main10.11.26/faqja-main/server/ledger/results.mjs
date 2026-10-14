/**
 * Final results.
 *
 * The board keeps matches in memory, so when a match is seen finished its result is copied
 * here immediately. Settlement then never depends on the live feed: it works after a
 * restart, and later (admin "settle") for matches that have long left the board.
 */
import { query } from '../db.mjs';
import { getMatches } from '../matches.mjs';

/** true when the feed says the match is over (its own status, or the derived clock) */
const isFinished = (row) => {
  if (!row) return false;
  if (String(row.status).toLowerCase() === 'ended') return true;
  const feed = String(row.feed_status ?? '').toLowerCase();
  return /finish|ended|\bft\b|after (match|penalt)/.test(feed);
};

const statNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** copies every finished match with a known score into app_match_result (idempotent) */
export async function captureFinishedMatches() {
  const rows = await getMatches({ includeEnded: true, limit: 2000 });
  const finished = rows.filter(
    (r) => isFinished(r) && r.home_score !== null && r.away_score !== null,
  );
  if (!finished.length) return 0;

  let stored = 0;
  for (const row of finished) {
    const home = row.stats ? statNum(row.stats.home?.corners) : null;
    const away = row.stats ? statNum(row.stats.away?.corners) : null;
    const homeCards = row.stats
      ? (statNum(row.stats.home?.yellow) ?? 0) + (statNum(row.stats.home?.red) ?? 0)
      : null;
    const awayCards = row.stats
      ? (statNum(row.stats.away?.yellow) ?? 0) + (statNum(row.stats.away?.red) ?? 0)
      : null;

    const res = await query(
      `insert into app_match_result
         (match_id, home_team, away_team, home_score, away_score, corners_home, corners_away, cards_home, cards_away)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (match_id) do update set
         home_score   = excluded.home_score,
         away_score   = excluded.away_score,
         corners_home = coalesce(excluded.corners_home, app_match_result.corners_home),
         corners_away = coalesce(excluded.corners_away, app_match_result.corners_away),
         cards_home   = coalesce(excluded.cards_home, app_match_result.cards_home),
         cards_away   = coalesce(excluded.cards_away, app_match_result.cards_away)
       returning (xmax = 0) as inserted`,
      [row.match_id, row.home, row.away, row.home_score, row.away_score, home, away, homeCards, awayCards],
    );
    if (res.rows[0]?.inserted) stored++;
  }
  return stored;
}

export async function getResult(matchId) {
  const res = await query('select * from app_match_result where match_id = $1', [Number(matchId)]);
  return res.rows[0] ?? null;
}

/** manual result (admin "settle" button): stores the score the admin entered */
export async function storeResult(matchId, homeScore, awayScore, { homeTeam = null, awayTeam = null } = {}) {
  await query(
    `insert into app_match_result (match_id, home_team, away_team, home_score, away_score)
     values ($1, $2, $3, $4, $5)
     on conflict (match_id) do update set
       home_score = excluded.home_score,
       away_score = excluded.away_score,
       home_team  = coalesce(excluded.home_team, app_match_result.home_team),
       away_team  = coalesce(excluded.away_team, app_match_result.away_team)`,
    [Number(matchId), homeTeam, awayTeam, Number(homeScore), Number(awayScore)],
  );
  return getResult(matchId);
}

/** results for a set of matches (used by the settler to find work) */
export async function resultsFor(matchIds = []) {
  if (!matchIds.length) return new Map();
  const res = await query('select * from app_match_result where match_id = any($1::bigint[])', [matchIds]);
  return new Map(res.rows.map((r) => [String(r.match_id), r]));
}

export async function recentResults(limit = 50) {
  const res = await query(
    `select r.*, (select count(*)::int from app_ticket_line l where l.match_id = r.match_id) as lines
       from app_match_result r order by r.finished_at desc limit $1`,
    [Math.min(Number(limit) || 50, 200)],
  );
  return res.rows;
}

/** results that still have unsettled lines (the settler's work queue) */
export async function unsettledMatchIds() {
  const res = await query(
    `select distinct l.match_id
       from app_ticket_line l
       join app_match_result r on r.match_id = l.match_id
      where l.status = 'PENDING'
      limit 200`,
  );
  return res.rows.map((r) => r.match_id);
}