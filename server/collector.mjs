import { config } from './config.mjs';
import { liveClock } from './minute.mjs';
import { fetchRealFootball } from './upstream.mjs';
import { upsertMatches, expireStaleMatches, getCounts, getMatches, getOddsForMatches } from './db.mjs';
import { marketColumn } from './odds.mjs';

/** groups odds_current rows into markets for the UI */
export function buildMarkets(oddsRows) {
  const markets = new Map();

  for (const o of oddsRows) {
    const key = `${o.market_key}|${o.line}`;
    if (!markets.has(key)) {
      markets.set(key, {
        key: o.market_key,
        name: o.market_name,
        line: o.line,
        column: o.board_column ?? marketColumn(o.market_key, o.market_name),
        period: Number(o.period ?? 0),
        isBase: o.is_base === true,
        order: Number(o.grp_order ?? 0),
        renderType: o.render_type ?? null,
        subgames: o.subgames ?? null,
        suspended: false,
        outcomes: [],
      });
    }
    markets.get(key).outcomes.push({
      key: o.outcome_key,
      name: o.outcome_name,
      price: o.price === null ? null : Number(o.price),
      suspended: o.suspended === true,
    });
  }

  const list = [...markets.values()];
  for (const m of list) {
    m.suspended = m.outcomes.length > 0 && m.outcomes.every((o) => o.suspended);
  }
  list.sort(
    (a, b) =>
      Number(b.isBase) - Number(a.isBase) ||
      a.order - b.order ||
      String(a.key).localeCompare(String(b.key)) ||
      String(a.line).localeCompare(String(b.line)),
  );
  return list;
}

/** converts normalised (camelCase) odds rows to the DB row shape buildMarkets expects */
export const toDbOddsShape = (rows) =>
  rows.map((r) => ({
    match_id: r.matchId,
    market_key: r.marketKey,
    market_name: r.marketName,
    line: r.line ?? '',
    outcome_key: r.outcomeKey,
    outcome_name: r.outcomeName,
    price: r.price,
    suspended: r.suspended === true,
    is_base: r.isBase === true,
    grp_order: Number(r.order ?? 0),
    render_type: r.renderType ?? null,
    period: Number(r.period ?? 0),
    board_column: r.column ?? null,
    subgames: r.subgames ?? null,
  }));

/**
 * match-info pushes per-team stats keyed by competitor id:
 *   {"87150":{"corners":2,"yellow":1,"red":0}, ...}
 * This maps them onto home/away using the competitor ids stored in `raw`.
 */
export function statsFromRow(row) {
  const map = row?.stats;
  if (!map || typeof map !== 'object') return null;
  const homeId = row.raw?.homeTeam?.id != null ? String(row.raw.homeTeam.id) : null;
  const awayId = row.raw?.awayTeam?.id != null ? String(row.raw.awayTeam.id) : null;
  const home = homeId ? map[homeId] ?? null : null;
  const away = awayId ? map[awayId] ?? null : null;
  if (!home && !away) return null;
  return { home, away };
}

export function serializeMatch(row, oddsRows = [], now = Date.now()) {
  const startAt = row.start_at instanceof Date ? row.start_at : new Date(row.start_at);
  const clock = row.service === 'LIVE' ? liveClock(startAt, now) : { minute: null, phase: 'pre', status: 'scheduled' };
  const markets = buildMarkets(oddsRows);

  return {
    id: row.match_id,
    service: row.service,
    live: row.service === 'LIVE',
    status: clock.status,
    phase: clock.phase,
    minute: clock.minute,
    startAt: startAt.toISOString(),
    league: { slug: row.category_slug, name: row.category_name },
    tournament: { id: row.tournament_id, name: row.tournament_name },
    home: row.home,
    away: row.away,
    score: row.home_score === null || row.home_score === undefined ? null : { home: row.home_score, away: row.away_score },
    periodsScore: row.periods_score ?? null,
    stats: statsFromRow(row),
    oddsCount: row.odds_count ?? null,
    isHot: row.is_hot === true,
    suspended: markets.length > 0 && markets.every((m) => m.suspended),
    hasSuspended: markets.some((m) => m.suspended),
    marketCount: markets.length,
    markets,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

/** loads current odds for the given match rows and serialises everything */
export async function withOdds(rows, now = Date.now()) {
  const odds = await getOddsForMatches(rows.map((r) => r.match_id));
  const byMatch = new Map();
  for (const o of odds) {
    if (!byMatch.has(o.match_id)) byMatch.set(o.match_id, []);
    byMatch.get(o.match_id).push(o);
  }
  return rows.map((r) => serializeMatch(r, byMatch.get(r.match_id) ?? [], now));
}

export function startCollector({ io } = {}) {
  const state = {
    syncedAt: null, lastError: null, received: 0, kept: 0, skipped: 0, cycles: 0, running: false,
  };
  let timer = null;

  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const { rows, received, skipped } = await fetchRealFootball();
      const now = Date.now();

      // refresh the derived live clock on every cycle
      for (const r of rows) {
        if (r.service !== 'LIVE') continue;
        const c = liveClock(r.start_at, now);
        r.live_minute = c.minute;
        r.phase = c.phase;
        r.status = c.status;
      }

      await upsertMatches(rows);
      const expired = await expireStaleMatches(Math.max(150, Math.round((config.pollIntervalMs / 1000) * 6)));

      state.syncedAt = new Date().toISOString();
      state.received = received;
      state.kept = rows.length;
      state.skipped = skipped;
      state.cycles++;
      state.lastError = null;

      console.log(
        `[collector] ${state.syncedAt} received=${received} real=${rows.length} filtered=${skipped} expired=${expired.length}`,
      );

      if (io) {
        const liveRows = await getMatches({ service: 'LIVE', limit: 500 });
        const matches = await withOdds(liveRows, now);
        const counts = await getCounts();
        io.emit('matches:live', { at: state.syncedAt, counts, matches });
        io.emit('meta', {
          ...counts,
          at: state.syncedAt,
          received,
          kept: rows.length,
          skipped,
          oddsMode: config.subscribeFrames.length || process.env.ODDS_SOCKET === 'true' ? 'socket' : 'ingest',
        });
      }
    } catch (e) {
      state.lastError = e.message;
      console.error('[collector] error:', e.message);
    } finally {
      state.running = false;
    }
  };

  tick();
  timer = setInterval(tick, config.pollIntervalMs);

  return { state, stop: () => clearInterval(timer), tick };
}
