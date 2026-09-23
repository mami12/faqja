import pg from 'pg';
import { config, pgClientOptions } from './config.mjs';
import { SCHEMA_SQL } from './schema.mjs';

// bigint + numeric arrive as strings by default; normalise them for JSON output
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool(pgClientOptions());

pool.on('error', (e) => console.error('[db] idle client error:', e.message));

export const query = (text, params) => pool.query(text, params);

export async function initSchema() {
  await query(SCHEMA_SQL);
}

export async function dbHealth() {
  const r = await query('select now() as now, current_database() as db');
  return { ok: true, now: r.rows[0].now, db: r.rows[0].db };
}

const MATCH_COLUMNS = [
  'match_id', 'sport_id', 'sport_tag', 'category_id', 'category_slug', 'category_name',
  'tournament_id', 'tournament_slug', 'tournament_name', 'home', 'away', 'service',
  'start_at', 'is_hot', 'is_real', 'live_minute', 'phase', 'status', 'raw',
];

/** Bulk upsert of normalised matches (chunked multi-row insert). */
export async function upsertMatches(rows, chunkSize = 150) {
  if (rows.length === 0) return 0;
  let written = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const tuples = chunk.map((row, r) => {
      const placeholders = MATCH_COLUMNS.map((col, c) => {
        const idx = r * MATCH_COLUMNS.length + c + 1;
        values.push(col === 'raw' ? JSON.stringify(row[col] ?? {}) : (row[col] ?? null));
        return `$${idx}`;
      });
      return `(${placeholders.join(',')}, now(), now())`;
    });

    const sql = `
      insert into matches (${MATCH_COLUMNS.join(',')}, last_seen_at, updated_at)
      values ${tuples.join(',')}
      on conflict (match_id) do update set
        sport_id        = excluded.sport_id,
        sport_tag       = excluded.sport_tag,
        category_id     = excluded.category_id,
        category_slug   = excluded.category_slug,
        category_name   = excluded.category_name,
        tournament_id   = excluded.tournament_id,
        tournament_slug = excluded.tournament_slug,
        tournament_name = excluded.tournament_name,
        home            = excluded.home,
        away            = excluded.away,
        service         = excluded.service,
        start_at        = excluded.start_at,
        is_hot          = excluded.is_hot,
        is_real         = excluded.is_real,
        live_minute     = excluded.live_minute,
        phase           = excluded.phase,
        status          = excluded.status,
        raw             = excluded.raw,
        active          = true,
        last_seen_at    = now(),
        updated_at      = now()`;

    const res = await query(sql, values);
    written += res.rowCount ?? chunk.length;
  }
  return written;
}

/** Marks matches that vanished from the feed as finished/inactive. */
export async function expireStaleMatches(graceSeconds = 150) {
  const res = await query(
    `update matches
        set active = false,
            status = case when status in ('live','scheduled') then 'ended' else status end,
            updated_at = now()
      where active
        and last_seen_at < now() - make_interval(secs => $1::int)
      returning match_id`,
    [graceSeconds],
  );
  return res.rows.map((r) => r.match_id);
}

export async function getMatches({ service = null, league = null, q = null, limit = 500, offset = 0, includeEnded = false }) {
  const res = await query(
    `select * from matches
      where active
        and ($1::text is null or service = upper($1))
        and ($2::text is null or category_slug = $2)
        and ($3::text is null or home ilike '%' || $3 || '%' or away ilike '%' || $3 || '%'
                            or category_name ilike '%' || $3 || '%'
                            or tournament_name ilike '%' || $3 || '%')
        and ($6::boolean or status <> 'ended')
      order by (service = 'LIVE') desc, start_at asc
      limit $4 offset $5`,
    [service, league, q, Math.min(limit, 2000), offset, includeEnded === true],
  );
  return res.rows;
}

export async function getMatchById(matchId) {
  const res = await query('select * from matches where match_id = $1', [matchId]);
  return res.rows[0] ?? null;
}

export async function getLeagues() {
  const res = await query(
    `select category_slug as slug,
            min(category_name) as name,
            count(*) filter (where service = 'LIVE') as live,
            count(*) filter (where service = 'PREMATCH') as prematch
       from matches
      where active
      group by category_slug
      order by (count(*) filter (where service = 'LIVE')) desc, count(*) desc`,
  );
  return res.rows;
}

export async function getCounts() {
  const res = await query(
    `select count(*) filter (where service = 'LIVE' and status <> 'ended')     as live,
            count(*) filter (where service = 'PREMATCH' and status <> 'ended') as prematch,
            count(*) filter (where status = 'ended')                           as finished,
            max(updated_at)                                                    as updated_at
       from matches where active`,
  );
  const r = res.rows[0];
  return {
    live: Number(r.live),
    prematch: Number(r.prematch),
    finished: Number(r.finished),
    updatedAt: r.updated_at,
  };
}

export async function getOddsForMatches(matchIds) {
  if (!matchIds.length) return [];
  const res = await query(
    `select * from odds_current
      where match_id = any($1::bigint[])
      order by match_id, is_base desc, grp_order asc, period asc, market_key, line,
               case outcome_key when '1' then 1 when 'x' then 2 when '2' then 3
                                when 'under' then 4 when 'over' then 5 else 9 end,
               outcome_key`,
    [matchIds],
  );
  return res.rows;
}

/**
 * Writes current odds and records a history row whenever a price actually moves.
 * Returns the rows that changed (price or suspension) for real-time broadcast.
 */
export async function saveOdds(rows) {
  if (!rows.length) return { changed: [] };

  const matchIds = [...new Set(rows.map((r) => r.matchId))];
  const before = await getOddsForMatches(matchIds);
  const beforeMap = new Map(
    before.map((b) => [`${b.match_id}|${b.market_key}|${b.line}|${b.outcome_key}`, b]),
  );

  const values = [];
  const tuples = rows.map((row, i) => {
    const base = i * 13;
    values.push(
      row.matchId, row.marketKey, row.marketName, row.line ?? '', row.outcomeKey,
      row.outcomeName, row.price ?? null, row.suspended === true,
      row.isBase === true, Number.isFinite(Number(row.order)) ? Number(row.order) : 0,
      row.renderType ?? null, Number.isFinite(Number(row.period)) ? Number(row.period) : 0,
      row.column ?? null,
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13}, now())`;
  });

  await query(
    `insert into odds_current
       (match_id, market_key, market_name, line, outcome_key, outcome_name, price, suspended,
        is_base, grp_order, render_type, period, board_column, updated_at)
     values ${tuples.join(',')}
     on conflict (match_id, market_key, line, outcome_key) do update set
       market_name  = excluded.market_name,
       outcome_name = excluded.outcome_name,
       price        = excluded.price,
       suspended    = excluded.suspended,
       is_base      = excluded.is_base,
       grp_order    = excluded.grp_order,
       render_type  = excluded.render_type,
       board_column = excluded.board_column,
       updated_at   = now()`,
    values,
  );

  const changed = [];
  const history = [];
  for (const row of rows) {
    const key = `${row.matchId}|${row.marketKey}|${row.line ?? ''}|${row.outcomeKey}`;
    const prev = beforeMap.get(key);
    const priceChanged = !prev || Number(prev.price) !== Number(row.price);
    const suspChanged = !prev || prev.suspended !== (row.suspended === true);
    if (!priceChanged && !suspChanged) continue;
    changed.push(row);
    if (priceChanged) {
      history.push([row.matchId, row.marketKey, row.line ?? '', row.outcomeKey, row.price ?? null, row.suspended === true]);
    }
  }

  if (history.length) {
    const params = [];
    const rowsSql = history.map((h, i) => {
      const b = i * 6;
      params.push(...h);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
    });
    await query(
      `insert into odds_history (match_id, market_key, line, outcome_key, price, suspended) values ${rowsSql.join(',')}`,
      params,
    );
  }

  return { changed };
}

export async function logRawFrame(source, payload) {
  if (!config.logRawFrames) return;
  await query('insert into raw_frames (source, payload) values ($1, $2)', [source, JSON.stringify(payload ?? {})]);
}

/** live score / period info pushed as "match-info" */
export async function applyMatchInfo(info) {
  if (!info?.matchId) return null;
  const res = await query(
    `update matches set
        home_score    = coalesce($2, home_score),
        away_score    = coalesce($3, away_score),
        periods_score = coalesce($4::jsonb, periods_score),
        odds_count    = coalesce($5, odds_count),
        updated_at    = now()
      where match_id = $1
      returning match_id, home_score, away_score, periods_score, odds_count`,
    [
      info.matchId,
      Number.isFinite(info.homeScore) ? info.homeScore : null,
      Number.isFinite(info.awayScore) ? info.awayScore : null,
      info.periodsScore?.length ? JSON.stringify(info.periodsScore) : null,
      Number.isFinite(info.enabledOddsCount) ? info.enabledOddsCount : null,
    ],
  );
  return res.rows[0] ?? null;
}

export async function recentRawFrames(limit = 20) {
  const res = await query(
    'select id, source, payload, at from raw_frames order by at desc limit $1',
    [Math.min(Number(limit) || 20, 200)],
  );
  return res.rows;
}

export async function getOddsHistory(matchId, limit = 200) {
  const res = await query(
    `select market_key, line, outcome_key, price, suspended, at
       from odds_history
      where match_id = $1
      order by at desc
      limit $2`,
    [matchId, Math.min(Number(limit) || 200, 1000)],
  );
  return res.rows;
}

export async function closePool() {
  await pool.end().catch(() => {});
}

/** which of the given ids exist in our (football-only) matches table */
export async function knownMatchIds(ids) {
  if (!ids.length) return new Set();
  const res = await query('select match_id from matches where match_id = any($1::bigint[])', [ids]);
  return new Set(res.rows.map((r) => r.match_id));
}
