import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketServer } from 'socket.io';
import { config, dbTarget, dbTargetLabel, dbErrorHint } from './config.mjs';
import { initSchema, dbHealth, getOddsHistory, getOddsForMatches as getDbOddsForMatches, recentRawFrames, closePool, logRawFrame } from './db.mjs';
import { initLedgerSchema } from './ledger/store.mjs';
import * as overrides from './ledger/overrides.mjs';
import { ensureDefaultAccounts } from './ledger/auth.mjs';
import { ledgerRouter } from './ledger/routes.mjs';
import { sizzlingDemoRouter } from './sizzling-demo.mjs';
import { adminRouter } from './ledger/admin.mjs';
import { settleAll, voidUnresolved } from './ledger/settler.mjs';
import { isFinished, archiveFinishedMatch } from './ledger/results.mjs';
import {
  getMatches, getMatchById, getLeagues, getCounts, applyMatchInfo, knownMatchIds,
  getSubscriptionIds, getFeedFreshness, matchStats, boostMatch,
} from './matches.mjs';
import { normalizeOddsPayload, applyOddsRows, groupByMatch } from './odds.mjs';
import * as oddsStore from './odds-store.mjs';
import { decodePushBatch } from './push-decode.mjs';
import { startPusher } from './pusher.mjs';
import { startCollector, withOdds, buildMarkets, toDbOddsShape, statsFromRow } from './collector.mjs';
import { liveClock } from './minute.mjs';
import { liveRiskReason, riskMinute } from './live-risk.mjs';
import { liveRiskSettings, subscribeLiveRiskSettings } from './live-risk-settings.mjs';
import { refreshLiveRiskSettings } from './ledger/live-risk-store.mjs';
import { createIdleMonitor, getFeedMode, setFeedMode, feedIsStopped } from './idle-mode.mjs';

const app = express();
const corsOrigin = config.allowedOrigins.includes('*') ? true : config.allowedOrigins;

let collector = null;
let pusher = null;
let oddsStatus = { connected: false };

// prices for one selection can arrive from two books at once ("10:…" and "12:L:…"): keep one
// of them per selection so the board cannot show a price that changes and then changes back
oddsStore.configure({ pinProvider: config.oddsProviderPin });

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '4mb' }));

const requireToken = (req, res, next) => {
  if (!config.ingestToken) return next();
  const token = req.get('x-ingest-token') ?? req.query.token;
  if (token !== config.ingestToken) return res.status(401).json({ error: 'invalid token' });
  return next();
};

const asInt = (v, def, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(1, Math.trunc(n)), max);
};

app.get('/api/info', (_req, res) => res.json({ name: 'faqja-football-board', ok: true }));

/* --- database status is probed in the background: a dead database must never
   hang /health (Railway healthcheck) or stop the odds board ------------------ */
let dbStatus = { ok: false, error: 'probing' };
let feedStatus = null;
let dbProbe = { at: null, ms: null };
let probing = false;

async function probeDb() {
  if (probing) return; // a slow/dead database must not pile up probes
  probing = true;
  const started = Date.now();
  try {
    dbStatus = await dbHealth();
  } catch (e) {
    dbStatus = { ok: false, error: dbErrorHint(e.message) };
  }
  try {
    feedStatus = await getFeedFreshness();
  } catch (e) {
    feedStatus = { error: dbErrorHint(e.message) };
  } finally {
    probing = false;
    dbProbe = { at: new Date().toISOString(), ms: Date.now() - started };
  }

  // the ledger schema is created/retried whenever the database actually answers
  if (dbStatus.ok && !ledgerReady) await ensureLedgerSchema();
}

/** the ledger tables (users/tickets/results) are created on boot and retried until the database answers */
let ledgerReady = false;
let settleTimer = null;
let settlementBusy = false;
let lastUnresolvedCheck = 0;
// De-duplicate repeated full-time frames after durable result persistence.
const archivedTerminalMatches = new Set();
async function ensureLedgerSchema() {
  if (ledgerReady) return true;
  try {
    await initSchema();
    await initLedgerSchema(); // users / transactions / tickets (additive, create-only)
    await refreshLiveRiskSettings({ initialize: true });
    await ensureDefaultAccounts();
    // admin overrides live in the database and are read through a snapshot: warm it now so a
    // restart does not silently drop a suspension or a pinned price until someone edits again
    await overrides.refresh(true);
    ledgerReady = true;
    console.log('[db] ledger schema ready');
    armSettlement(); // Also starts after a late DB recovery, not just at boot.
  } catch (e) {
    console.error('[db] ledger schema not ready yet:', dbErrorHint(e.message));
    if (config.dbInitStrict) {
      console.error('[db] DB_INIT_STRICT on: exiting instead of running without the ledger schema');
      process.exit(1);
    }
  }
  return ledgerReady;
}

/** the probe is pure database traffic - idle mode stops it so nothing goes out on the wire */
let probeTimer = null;
function armProbe() {
  if (probeTimer) return false;
  probeDb();
  probeTimer = setInterval(probeDb, 15000);
  probeTimer.unref?.();
  return true;
}
function stopProbe() {
  clearInterval(probeTimer);
  probeTimer = null;
  return true;
}

armProbe();

/* ---------------------------------------------------------------- idle mode
 * With no visitor the feed is paused and the instance is free to sleep; the first request
 * wakes it again (server/idle-mode.mjs explains why this is worth doing on Railway).
 * ---------------------------------------------------------------------------- */

const feedState = () => ({
  ...idle.state(),
  at: new Date().toISOString(),
  oddsRows: oddsStore.stats().rows,
});

function broadcastFeedState() {
  try {
    io?.emit('feed:state', feedState());
  } catch {
    /* ignore: no clients */
  }
}

/**
 * Settlement pass: store the results of matches that have finished, then close every ticket
 * whose lines are all decided. Idempotent, so a missed pass is harmless - which is what makes
 * it safe to skip while the feed is stopped (no database round trips when nobody is looking)
 * and to run once on wake, where it catches up on everything that ended while we were asleep.
 */
async function runSettlement(why = 'periodic') {
  if (!ledgerReady || settlementBusy) return null;
  settlementBusy = true;
  try {
    const out = await settleAll();
    if (out.closed || why !== 'periodic') {
      console.log(
        `[settle] (${why}) captured=${out.captured} matches=${out.matches} lines=${out.lines} tickets=${out.closed}`,
      );
    }
    return out;
  } catch (e) {
    console.error('[settle] pass failed:', e.message);
    return null;
  } finally {
    // Even when finished-result capture fails (bad feed row / DB hiccup),
    // old unresolvable tickets must still reach the separate 72h review.
    if (why !== 'periodic' || Date.now() - lastUnresolvedCheck >= 15 * 60 * 1000) {
      lastUnresolvedCheck = Date.now();
      try {
        const unresolved = await voidUnresolved(72);
        if (unresolved.voided) console.log('[settle] unresolved lines voided:', unresolved.voided);
      } catch (error) {
        console.error('[settle] unresolved review failed:', error.message);
      }
    }
    settlementBusy = false;
  }
}

/** Start once after ledger creation OR database recovery. */
function armSettlement() {
  if (!ledgerReady || settleTimer) return;
  void runSettlement('ledger ready');
  const delay = Math.max(10000, Number(process.env.SETTLE_INTERVAL_MS) || 30000);
  settleTimer = setInterval(() => void runSettlement('periodic'), delay);
  settleTimer.unref?.();
}

const idle = createIdleMonitor({
  enabled: config.idleFeed,
  idleAfterMs: config.idleAfterMs,
  coldBootIdleMs: config.idleColdBootMs,
  onIdle: () => {
    pusher?.pause(); // closes the upstream socket: heartbeats are outbound traffic too
    collector?.pause(); // no upstream polling
    if (config.idleStopDbProbe) stopProbe(); // and no database probe
    broadcastFeedState();
  },
  onWake: () => {
    if (config.idleStopDbProbe) armProbe();
    pusher?.resume();
    broadcastFeedState();
    // the board is rebuilt by the first collector cycle (it broadcasts matches:live itself);
    // the settlement pass then catches up on whatever ended while the feed was paused
    Promise.resolve(collector?.resume?.() ?? collector?.tick?.())
      .then(() => runSettlement('after waking'))
      .catch((e) => console.error('[idle] catch-up failed:', e.message))
      .finally(() => {
        idle.markLive();
        broadcastFeedState();
      });
  },
  onMode: () => broadcastFeedState(),
});

/**
 * What counts as a visitor: a board socket (see io.on('connection')) or a call to the app's
 * API. /health and the static bundle are deliberately NOT: an uptime monitor or a crawler
 * pinging them must not keep the feed - and the invoice - running.
 */
const ACTIVITY_RE = /^\/(app\/api|api\/(matches|meta|leagues|odds|raw-frames|info)|ingest)\b/;
app.use((req, _res, next) => {
  if (ACTIVITY_RE.test(req.path)) idle.touch();
  next();
});

app.get('/health', (_req, res) => {
  // 200 even when the database is down: prices come from memory, so a database outage
  // must not restart-loop the service. db.ok / feed.error carry the detail.
  res.json({
    ok: true,
    db: dbStatus,
    dbProbe,
    target: dbTarget(),
    feed: feedStatus,
    matches: matchStats(),
    ledger: { ready: ledgerReady },
    odds: { ...oddsStore.stats(), mode: config.oddsStore },
    providers: oddsStore.providerReport(10),
    collector: collector?.state ?? null,
    oddsSocket: oddsStatus,
    pusher: pusher?.stats() ?? null,
    // idle mode: 'live' | 'idle' | 'waking' plus the visitor counters, and what the tiers cost
    feedMode: getFeedMode(),
    idle: {
      ...idle.state(),
      // the database probe is outbound traffic too: whether it is currently stopped is what
      // decides if the instance is really free to sleep
      stopDbProbeOnIdle: config.idleStopDbProbe,
      dbProbeStopped: probeTimer === null,
    },
    tiers: {
      soonMin: config.prematchSoonMin,
      soonMs: config.prematchSoonRefreshMs,
      laterMs: config.prematchRefreshMs,
      unpricedMs: config.prematchUnpricedRefreshMs,
      enabled: config.prematchRefreshMs > 0,
    },
    upstream: config.gateway,
    at: new Date().toISOString(),
  });
});

app.get('/api/meta', async (_req, res, next) => {
  try {
    const counts = await getCounts();
    res.json({ ...counts, collector: collector?.state ?? null, oddsSocket: oddsStatus });
  } catch (e) {
    next(e);
  }
});

app.get('/api/leagues', async (_req, res, next) => {
  try {
    res.json({ items: await getLeagues() });
  } catch (e) {
    next(e);
  }
});

app.get('/api/matches', async (req, res, next) => {
  try {
    const service = req.query.service && req.query.service !== 'all' ? String(req.query.service) : null;
    const rows = await getMatches({
      service,
      league: req.query.league ? String(req.query.league) : null,
      q: req.query.q ? String(req.query.q) : null,
      limit: asInt(req.query.limit, 500, 2000),
      offset: asInt(req.query.offset, 0, 100000),
    });
    const items = req.query.odds === '0' ? rows.map((r) => r) : await withOdds(rows);
    const counts = await getCounts();
    res.json({ counts, items });
  } catch (e) {
    next(e);
  }
});

app.get('/api/matches/:id', async (req, res, next) => {
  try {
    const row = await getMatchById(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'match not found' });
    boostMatch(row.match_id); // opened matches always get their full market list
    pusher?.subscribeFull(row.match_id); // request full lines now, not next subscription tick
    const [match] = await withOdds([row]);
    res.json(match);
  } catch (e) {
    return next(e);
  }
});

app.get('/api/odds/:matchId/history', async (req, res, next) => {
  try {
    const matchId = Number(req.params.matchId);
    const limit = asInt(req.query.limit, 200, 1000);
    // prices live in memory by default, so the history covers this process lifetime only
    const items =
      config.oddsStore === 'db' ? await getOddsHistory(matchId, limit) : oddsStore.getHistory(matchId, limit);
    res.json({ items, store: config.oddsStore });
  } catch (e) {
    next(e);
  }
});

/* The provider's locks and our reversible risk locks travel separately.
 * Recompute against server prices whenever a score/clock or odds frame changes. */
const publishedRiskLocks = new Map();

async function broadcastLiveRiskLocks(matchId, matchRow) {
  if (!io || !matchRow) return;
  const id = String(matchId);
  const previous = publishedRiskLocks.get(id) ?? new Set();
  const next = new Set();
  const minute = riskMinute(matchRow);
  const policy = liveRiskSettings();
  const firstRuleMinute = Math.min(
    ...policy.leaderRules.map(rule => rule.minute),
    ...policy.lowOddsRules.map(rule => rule.minute),
    ...(policy.marketClosureRules ?? []).map(rule => rule.minute),
  );
  if (config.liveRiskEnabled && policy.enabled &&
      String(matchRow.service).toUpperCase() === 'LIVE' &&
      minute !== null && minute >= firstRuleMinute) {
    const odds = config.oddsStore === 'db'
      ? await getDbOddsForMatches([Number(matchId)])
      : oddsStore.getOddsForMatches([Number(matchId)]);
    for (const item of odds) {
      const forced = overrides.outcomeOverride(matchId, item.market_key, item.line, item.outcome_key);
      const price = forced?.price ?? item.price;
      if (liveRiskReason(matchRow, {
        marketName: item.market_name,
        marketKey: item.market_key,
        outcomeName: item.outcome_name,
        outcomeKey: item.outcome_key,
        price,
      })) {
        next.add(id + '|' + item.market_key + '|' + (item.line ?? '') + '|' + item.outcome_key);
      }
    }
  }

  const locks = {};
  for (const key of previous) if (!next.has(key)) locks[key] = false;
  for (const key of next) if (!previous.has(key)) locks[key] = true;
  if (next.size) publishedRiskLocks.set(id, next);
  else publishedRiskLocks.delete(id);
  if (Object.keys(locks).length) io.emit('risk:locks', { matchId: id, locks });
}

// Admin edits (and changes made on another instance) immediately re-evaluate
// already visible odds, including reversibly unlocking old risk-only locks.
subscribeLiveRiskSettings(() => {
  void (async () => {
    if (!io) return;
    const rows = await getMatches({ service: 'LIVE', limit: 2000 });
    for (const row of rows) await broadcastLiveRiskLocks(row.match_id ?? row.id, row);
  })().catch(e => console.error('[live risk] lock refresh failed:',e.message));
});

/* ------------------------------------------------------------ odds ingestion */

async function broadcastOdds(changed) {
  if (!io || !changed.length) return;
  const byMatch = groupByMatch(changed);
  for (const [matchId, list] of byMatch) {
    // If the feed reports no open odds for this match, skip broadcasting — the board
    // already hides it via serializeMatch, and pushing placeholder prices (41.00 / 1.29)
    // would only confuse the frontend.
    const row = await getMatchById(Number(matchId));
    if (row && row.has_open_odds === false) continue;
    // Include live minute so the frontend can advance the clock even when
    // match-info-snapshot frames are rare
    const now = Date.now();
    const clock = row.service === 'LIVE' ? liveClock(row.start_at, now) : { minute: null, phase: 'pre' };
    const feedMinute = Number.isFinite(row.match_time_ms)
      ? Math.floor(Number(row.match_time_ms) / 60000) +
        (row.clock_at ? Math.max(0, Math.floor((now - new Date(row.clock_at).getTime()) / 60000)) : 0)
      : null;
    const minute = feedMinute ?? clock.minute;
    io.emit('odds:update', {
      matchId,
      at: new Date().toISOString(),
      minute: Number.isFinite(minute) ? minute : undefined,
      phase: row.phase ?? clock.phase ?? null,
      markets: buildMarkets(toDbOddsShape(list)),
    });
    await broadcastLiveRiskLocks(matchId, row);
  }
}

/** applies a decoded match-info (score / clock / stats) and broadcasts it */
async function applyInfoFromFeed(info) {
  // match-info names the book the site itself sells this match from: prefer its prices over
  // whatever priced the selection first, so our odds match the source site's
  if (info.providerId !== null && info.providerId !== undefined && Number.isFinite(Number(info.providerId))) {
    oddsStore.setProvider(info.matchId, info.providerId);
  }

  // if scoreBoard carried per-team goals, keep them as the match score even
  // when later frames only report corners/cards
  let enriched = info;
  if (info.stats && info.homeScore === null) {
    const row = await getMatchById(info.matchId);
    const hId = row?.raw?.homeTeam?.id != null ? String(row.raw.homeTeam.id) : null;
    const aId = row?.raw?.awayTeam?.id != null ? String(row.raw.awayTeam.id) : null;
    const goalsOf = (s) => {
      if (!s) return null;
      const hit = Object.entries(s).find(([k]) => k.startsWith('goals:'));
      return hit ? hit[1] : null;
    };
    const hg = hId ? goalsOf(info.stats[hId]) : null;
    const ag = aId ? goalsOf(info.stats[aId]) : null;
    if (hg !== null && ag !== null) enriched = { ...info, homeScore: hg, awayScore: ag };
  }

  const updated = await applyMatchInfo(enriched);
  if (updated) {
    // Save a *feed-confirmed* FT result at the moment it arrives. Without this
    // write, the next deploy/idle expiry can erase the only stored score and
    // leave ticket lines PENDING indefinitely.
    if (ledgerReady && !archivedTerminalMatches.has(String(updated.match_id)) && isFinished(updated)) {
      try {
        await archiveFinishedMatch(updated);
        archivedTerminalMatches.add(String(updated.match_id));
        void runSettlement('provider final score');
      } catch (e) {
        // A later FT frame or the 30s periodic pass will retry.
        console.error('[settle] failed to preserve provider FT match', updated.match_id, e.message);
      }
    }
    io?.emit('match:info', { ...enriched, ...updated, stats: statsFromRow(updated) });
    await broadcastLiveRiskLocks(info.matchId, updated);
  }
  return updated;
}

/**
 * The feed sends the clock and the score only in `match-info-snapshot` frames; the
 * periodic `match-info` deltas that follow carry neither. Coalescing a burst by
 * replacing the whole object therefore threw the snapshot away, which is what froze
 * scores and minutes for ~60% of live matches. Merge field by field instead, so a
 * stats-only delta can never erase a clock or a score.
 */
function mergeInfo(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  return {
    ...next,
    matchTimeMs: Number.isFinite(next.matchTimeMs) ? next.matchTimeMs : prev.matchTimeMs,
    homeScore: Number.isFinite(next.homeScore) ? next.homeScore : prev.homeScore,
    awayScore: Number.isFinite(next.awayScore) ? next.awayScore : prev.awayScore,
    periodsScore: next.periodsScore?.length ? next.periodsScore : prev.periodsScore,
    stats: next.stats ? { ...(prev.stats ?? {}), ...next.stats } : prev.stats,
    feedStatus: next.feedStatus ?? prev.feedStatus,
    hasOpenOdds: next.hasOpenOdds ?? prev.hasOpenOdds,
    broadcastUrl: next.broadcastUrl ?? prev.broadcastUrl,
    enabledOddsCount: next.enabledOddsCount ?? prev.enabledOddsCount,
  };
}

/* ---- coalescer for the server-side subscription (frames arrive in bursts) ---- */
const oddsBuffer = [];
const infoBuffer = new Map();
let flushing = false;

async function flushFeedBuffer() {
  if (flushing || (!oddsBuffer.length && !infoBuffer.size)) return;
  flushing = true;
  try {
    if (oddsBuffer.length) {
      const rows = oddsBuffer.splice(0, oddsBuffer.length);
      broadcastOdds(await applyOddsRows(rows)).catch((e) => console.warn('[feed] broadcast error:', e.message));
    }
    if (infoBuffer.size) {
      const infos = [...infoBuffer.values()];
      infoBuffer.clear();
      for (const info of infos) await applyInfoFromFeed(info);
    }
  } catch (e) {
    console.error('[feed] flush failed:', e.message);
  } finally {
    flushing = false;
  }
}
setInterval(flushFeedBuffer, 1000);

app.post('/ingest/odds', requireToken, async (req, res, next) => {
  try {
    const rows = normalizeOddsPayload(req.body, {
      matchId: req.query.matchId ? Number(req.query.matchId) : undefined,
      marketKey: req.query.marketKey ? String(req.query.marketKey) : undefined,
    });
    if (!rows.length) {
      return res.status(422).json({
        error: 'no usable odds in payload',
        hint: 'see README -> "Odds ingest format"',
      });
    }
    const changed = await applyOddsRows(rows);
    broadcastOdds(changed).catch((e) => console.warn('[odds] broadcast error:', e.message));
    return res.json({
      accepted: rows.length,
      changed: changed.length,
      matches: [...new Set(rows.map((r) => r.matchId))],
    });
  } catch (e) {
    return next(e);
  }
});

app.get('/api/raw-frames', requireToken, async (req, res, next) => {
  try {
    res.json({ items: await recentRawFrames(asInt(req.query.limit, 20, 200)) });
  } catch (e) {
    next(e);
  }
});

/**
 * Native frames from the platform's push channel (push-server-v2), forwarded by
 * the browser relay (docs/frames-relay.user.js) or pasted by hand.
 *
 * Accepts: { text: '42["u",{...},"id"]' } | { frames: ['42[...]', ...] }
 *          | { payload: {...} } | { messages: [{messageType,data}, ...] }
 */
app.post('/ingest/frames', requireToken, async (req, res, next) => {
  try {
    const body = req.body ?? {};

    // outgoing (client -> server) frames are only archived: they reveal the
    // subscribe protocol needed for the server-side socket path.
    if (req.query.direction === 'out') {
      const list = body.frames ?? (body.text ? [body.text] : []);
      for (const f of list.slice(0, 50)) await logRawFrame('client-out', { text: String(f).slice(0, 2000) });
      return res.json({ stored: Math.min(list.length, 50) });
    }

    const input = body.frames ?? body.messages ?? (body.text ? [body.text] : (body.payload ?? body));

    const { infos, odds, unknown, frames } = decodePushBatch(input);

    // only keep odds for matches this board actually tracks (football), unless ?storeUnknown=1
    const trackOnly = req.query.storeUnknown !== '1';
    const known = trackOnly
      ? await knownMatchIds([...new Set(odds.map((o) => o.matchId).filter(Number.isFinite))])
      : null;
    let skippedUnknown = 0;

    let oddsRows = 0;
    const changed = [];
    for (const decoded of odds) {
      if (trackOnly && !known.has(decoded.matchId)) {
        skippedUnknown += decoded.rows.length;
        continue;
      }
      const rows = decoded.rows;
      oddsRows += rows.length;
      changed.push(...(await applyOddsRows(rows)));
    }
    if (changed.length) broadcastOdds(changed).catch((e) => console.warn('[frames] broadcast error:', e.message));

    let matchInfoApplied = 0;
    for (const info of infos) {
      if (await applyInfoFromFeed(info)) matchInfoApplied++;
    }

    if (unknown.length) {
      for (const u of unknown.slice(0, 20)) await logRawFrame('ingest-frames', u);
    }

    return res.json({
      frames: frames || 1,
      matchInfo: infos.length,
      matchInfoApplied,
      oddsMessages: odds.length,
      oddsRows,
      skippedNotTracked: skippedUnknown,
      changed: changed.length,
      unknown: unknown.length,
      matchIds: [...new Set([...odds.map((o) => o.matchId), ...infos.map((i) => i.matchId)])],
    });
  } catch (e) {
    return next(e);
  }
});

/* --------------------------------------- React app (betting / admin panels) */

// Detail-page GETs need complete markets immediately, including distant prematch
// fixtures which otherwise stay on the hourly base-only subscription tier.
app.use('/app/api/matches/:id', (req, _res, next) => {
  if (req.method === 'GET') pusher?.subscribeFull(req.params.id);
  next();
});

app.use('/app/api', adminRouter);
app.use('/app/api', ledgerRouter);
// Isolated demo for Novomatic client: no real-wallet writes or ledger access.
app.use('/app/api/casino/sizzling', sizzlingDemoRouter);

const webDist = fileURLToPath(new URL('../web/dist/', import.meta.url));
if (existsSync(webDist)) {
  app.use('/app', express.static(webDist));
  // deep links (/app/login, /app/admin, ...) fall through to the SPA shell
  app.get(/^\/app(?!\/api)(\/.*)?$/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  console.log(`[app] serving the React app from ${webDist}`);
} else {
  app.get('/app', (_req, res) =>
    res.status(503).json({ error: 'app not built yet', hint: 'run npm run build:web' }),
  );
}

/* ---------------------------------------------------------------- delivery */

const docsDir = fileURLToPath(new URL('../docs/', import.meta.url));
app.use(express.static(docsDir));

app.use((err, _req, res, _next) => {
  console.error('[http]', dbErrorHint(err.message));
  res.status(500).json({ error: err.message });
});

const server = app.listen(config.port, () => {
  console.log(`[http] listening on :${config.port} (frontend: ${docsDir})`);
});

const io = new SocketServer(server, {
  cors: { origin: corsOrigin },
  path: '/socket.io',
});

io.on('connection', async (socket) => {
  // a visitor: the feed must be live while this socket is open (idle mode wakes it here)
  idle.clientOpen();
  socket.on('disconnect', () => idle.clientClose());

  // `mode` lets the board say "odds are being refreshed" instead of showing an empty list
  // while the first feed cycle is in flight
  socket.emit('hello', { at: new Date().toISOString(), pollMs: config.pollIntervalMs, mode: getFeedMode() });
  try {
    const counts = await getCounts();
    socket.emit('meta', { ...counts, mode: getFeedMode() });
    // while waking, the collector's own broadcast carries the first board (it emits to every
    // socket), so this must not send an empty list first
    if (getFeedMode() !== 'live') return;
    const rows = await getMatches({ service: 'LIVE', limit: 500 });
    socket.emit('matches:live', {
      at: new Date().toISOString(),
      counts,
      mode: getFeedMode(),
      matches: await withOdds(rows),
    });
  } catch (e) {
    socket.emit('server:error', { message: e.message });
  }
});

/* ------------------------------------------------------- push subscription plan */

/** PREMATCH_REFRESH_MS=0 turns the tiers off: prematch follows the live cadence again */
const tieredPrematch = () => config.prematchRefreshMs > 0;

/** how far ahead a kickoff counts as "soon" (0 = nothing is soon, everything is "later") */
const soonWindowMs = () => (tieredPrematch() ? Math.max(0, config.prematchSoonMin * 60 * 1000) : 0);

/**
 * What the push channel should be subscribed to right now: the store's ids split by tier, plus
 * the prematch fixtures the feed has not priced yet.
 *
 * The unpriced set is recomputed on every pass, so a fixture that appears without prices is
 * asked for within a minute instead of waiting for the next scheduled refresh - without it the
 * "hide matches without prices" rule would keep a new fixture invisible for up to an hour.
 */
async function subscriptionPlan() {
  const ids = await getSubscriptionIds({
    liveLimit: Number(process.env.SUBSCRIBE_LIVE_LIMIT ?? 250),
    prematchLimit: Number(process.env.SUBSCRIBE_PREMATCH_LIMIT ?? 150),
    soonMs: soonWindowMs(),
  });
  const prematch = ids.prematch ?? [];
  return {
    ...ids,
    // ODDS_STORE=db keeps prices in Postgres, where there is no cheap "has a price?" check
    unpriced: config.oddsStore === 'db' ? [] : oddsStore.missingPrices(prematch),
  };
}

async function boot() {
  const target = dbTarget();
  console.log(`[db] target ${dbTargetLabel(target)}`);
  if (target.ipv6OnlyDirectHost) {
    console.warn(
      '[db] DATABASE_URL uses the IPv6-only direct host db.<ref>.supabase.co - use the pooler host (aws-<n>-<region>.pooler.supabase.com) unless this host has IPv6',
    );
  }

  await ensureLedgerSchema(); // the board does not need the ledger, so a failure here is not fatal
  // DB remains authoritative when multiple instances serve the sportsbook.
  // For betting, the policy is reread under the singleton row lock regardless.
  const riskRefreshTimer = setInterval(() => {
    if (ledgerReady) refreshLiveRiskSettings().catch(e =>
      console.warn('[live risk] refresh failed:',e.message));
  }, 10000);
  riskRefreshTimer.unref?.();

  // The ledger-ready transition starts settlement, including when Postgres
  // first becomes available after boot. Do not schedule duplicate timers.
  armSettlement();
  if (!ledgerReady) console.warn('[settle] waiting for ledger; will start automatically after DB recovery');

  collector = startCollector({ io });

  if (process.env.ODDS_SOCKET === 'true') {
    const resubscribeMs = Number(process.env.RESUBSCRIBE_MS ?? 20000);
    pusher = startPusher({
      getIds: () => subscriptionPlan(),
      fullMarkets: process.env.SUBSCRIBE_FULL_MARKETS !== 'false',
      fullMarketsLiveLimit: Number(process.env.SUBSCRIBE_FULL_LIMIT ?? 60),
      // 'recent' (default) spends the full-market quota on the matches that just kicked off
      fullMarketsOrder: process.env.SUBSCRIBE_FULL_ORDER ?? 'recent',
      // re-subscribing is what makes the feed resend the clock+score snapshot
      resubscribeMs,
      // prematch tiers: near-kickoff fixtures are refreshed often, the rest hourly. With
      // PREMATCH_REFRESH_MS=0 (kill switch) every group follows the live cadence again.
      prematchSoonMs: tieredPrematch() ? config.prematchSoonRefreshMs : resubscribeMs,
      prematchLaterMs: tieredPrematch() ? config.prematchRefreshMs : resubscribeMs,
      prematchUnpricedMs: tieredPrematch() ? config.prematchUnpricedRefreshMs : resubscribeMs,
      onOdds: (rows) => oddsBuffer.push(...rows),
      onInfo: (info) => infoBuffer.set(info.matchId, mergeInfo(infoBuffer.get(info.matchId), info)),
      onStatus: (s) => {
        oddsStatus = { ...oddsStatus, ...s };
        io.emit('odds:socket', oddsStatus);
      },
    });
    console.log(
      `[pusher] server-side odds subscription enabled (prematch tiers: ` +
        (tieredPrematch()
          ? `soon<=${config.prematchSoonMin}min every ${Math.round(config.prematchSoonRefreshMs / 1000)}s, ` +
            `later every ${Math.round(config.prematchRefreshMs / 60000)}min`
          : 'off, live cadence for everything') +
        `)`,
    );
  } else {
    console.log('[odds] server-side subscription off (set ODDS_SOCKET=true); the browser relay still feeds /ingest/frames');
  }

  // idle mode: with nobody on the board the feed is paused so the instance can sleep
  idle.start();
  console.log(
    `[idle] ${config.idleFeed ? 'enabled' : 'disabled'}: pause after ${Math.round(config.idleAfterMs / 1000)}s ` +
      `without a visitor (${Math.round(config.idleColdBootMs / 1000)}s when nobody has ever visited), ` +
      `db probe ${config.idleStopDbProbe ? 'stopped' : 'kept'}`,
  );
}

boot();

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    console.log(`[app] ${sig} received, shutting down`);
    idle.stop();
    collector?.stop();
    pusher?.close();
    stopProbe();
    clearInterval(settleTimer);
    io.close();
    server.close();
    await closePool();
    process.exit(0);
  });
}
