/**
 * Final results.
 *
 * The board keeps matches in memory, so when a match is seen finished its result is copied
 * here immediately. Settlement then never depends on the live feed: it works after a
 * restart, and later (admin "settle") for matches that have long left the board.
 */
import { query } from '../db.mjs';
import { getMatches, getMatchById } from '../matches.mjs';

/**
 * Do not settle bets from a made-up 0-0 or a kickoff timer. A final score
 * requires a genuine LIVE match score observed from the provider (score_at)
 * and either a definitive final feed phase or a match marked ended.
 * The absence of evidence deliberately leaves the ticket pending for review.
 */
export const isFinished = (row) => {
  if (!row || String(row.service ?? '').toUpperCase() !== 'LIVE') return false;
  if (!row.score_at || row.home_score == null || row.away_score == null) return false;
  const score = [Number(row.home_score), Number(row.away_score)];
  if (!score.every(n => Number.isInteger(n) && n >= 0)) return false;
  // Collector expiry and kickoff extrapolation also set status='ended'!
  // Only a provider-delivered FT signal proves the final score.
  const feed = String(row.feed_status ?? '').trim().toLowerCase();
  return /^(?:ft|full.?time|finished|ended|after (?:match|penalt(?:y|ies)))(?:\b|$)/.test(feed);
};

const statNum = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null);

/** Safely take first-period scores only from a complete two-half breakdown.
 * With a single unlabeled period we cannot know whether it is a first-half score.
 */
export function verifiedFirstHalf(periodsScore) {
  let periods = periodsScore;
  if (typeof periods === 'string') {
    try { periods = JSON.parse(periods); } catch { return null; }
  }
  if (!Array.isArray(periods) || periods.length < 2) return null;
  const first = periods[0];
  const home = first?.t1, away = first?.t2;
  if (home === null || home === undefined || away === null || away === undefined) return null;
  if (!/^[0-9]+$/.test(String(home)) || !/^[0-9]+$/.test(String(away))) return null;
  return { home: Number(home), away: Number(away) };
}

/**
 * Eleven columns AND eleven parameters. The old nine-placeholder statement
 * accidentally received eleven parameters once half-time scores were added;
 * PostgreSQL refused every automatic result capture, leaving tickets PENDING.
 *
 * Preserve previously confirmed half scores when the next frame omits them.
 */
export const FINISHED_RESULT_INSERT = `
  insert into app_match_result
    (match_id, home_team, away_team, home_score, away_score,
     corners_home, corners_away, cards_home, cards_away,
     half_home_score, half_away_score)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  on conflict (match_id) do update set
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    corners_home = coalesce(excluded.corners_home, app_match_result.corners_home),
    corners_away = coalesce(excluded.corners_away, app_match_result.corners_away),
    cards_home = coalesce(excluded.cards_home, app_match_result.cards_home),
    cards_away = coalesce(excluded.cards_away, app_match_result.cards_away),
    half_home_score = coalesce(excluded.half_home_score, app_match_result.half_home_score),
    half_away_score = coalesce(excluded.half_away_score, app_match_result.half_away_score)
  -- A verified admin correction or already-settled result must not be
  -- overwritten by a later stale or conflicting provider frame.
  where app_match_result.source = 'FEED' and app_match_result.settled_at is null
  returning (xmax = 0) as inserted
`;

export function finishedResultParameters(row) {
  const home = row.stats ? statNum(row.stats.home?.corners) : null;
  const away = row.stats ? statNum(row.stats.away?.corners) : null;
  const cards = side => {
    const team = row.stats?.[side];
    return team ? (statNum(team.yellow) ?? 0) + (statNum(team.red) ?? 0) : null;
  };
  const half = verifiedFirstHalf(row.periods_score);
  return [row.match_id, row.home, row.away, Number(row.home_score), Number(row.away_score),
    home, away, cards('home'), cards('away'), half?.home ?? null, half?.away ?? null];
}

/**
 * Persist the verified FT snapshot immediately, before the volatile LIVE match
 * map is discarded or the server restarts. The regular settlement pass can
 * later grade tickets against this durable score without relying on the feed.
 * Returns {recorded, inserted}, including no-op for unconfirmed scores.
 */
export async function archiveFinishedMatch(row) {
  if (!isFinished(row)) return { recorded: false, inserted: false };
  const result = await query(FINISHED_RESULT_INSERT, finishedResultParameters(row));
  const inserted = result.rows[0]?.inserted === true;
  return { recorded: result.rowCount > 0, inserted };
}

/** copies every verified FT result into the durable result table (idempotent) */
export async function captureFinishedMatches() {
  const rows = await getMatches({ includeEnded: true, limit: 2000 });

  // Specifically check matches from any currently pending ticket lines
  const pendingLines = await query(`select distinct match_id from app_ticket_line
    where status = 'PENDING' order by match_id limit 2000`);
  const pendingMatchIds = new Set(pendingLines.rows.map((r) => Number(r.match_id)));

  const candidateMatches = [...rows];
  for (const matchId of pendingMatchIds) {
    if (!candidateMatches.some((r) => Number(r.match_id) === matchId)) {
      const match = await getMatchById(matchId);
      if (match) candidateMatches.push(match);
    }
  }

  const finished = candidateMatches.filter(
    (r) => isFinished(r) && r.home_score !== null && r.away_score !== null,
  );
  if (!finished.length) return 0;

  let stored = 0;
  for (const row of finished) {
    try {
      const result = await archiveFinishedMatch(row);
      if (result.inserted) stored++;
    } catch (e) {
      // A single malformed feed record may not block settlement of hundreds
      // of unrelated football fixtures already saved to the ledger.
      console.error('[settle] result archive failed for match', row.match_id, e.message);
    }
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
    `insert into app_match_result (match_id, home_team, away_team, home_score, away_score, source)
     values ($1, $2, $3, $4, $5, 'ADMIN')
     on conflict (match_id) do update set
       home_score = excluded.home_score,
       away_score = excluded.away_score,
       source = 'ADMIN',
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