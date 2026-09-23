import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.mjs';
import {
  initSchema, dbHealth, getMatches, getMatchById, getLeagues, getCounts,
  getOddsForMatches, getOddsHistory, recentRawFrames, closePool, applyMatchInfo, logRawFrame, knownMatchIds,
  getSubscriptionIds,
} from './db.mjs';
import { normalizeOddsPayload, applyOddsRows, groupByMatch } from './odds.mjs';
import { decodePushBatch } from './push-decode.mjs';
import { startPusher } from './pusher.mjs';
import { startCollector, withOdds, buildMarkets, toDbOddsShape, statsFromRow } from './collector.mjs';

const app = express();
const corsOrigin = config.allowedOrigins.includes('*') ? true : config.allowedOrigins;

let collector = null;
let pusher = null;
let oddsStatus = { connected: false };

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

app.get('/health', async (_req, res) => {
  let db = { ok: false };
  try {
    db = await dbHealth();
  } catch (e) {
    db = { ok: false, error: e.message };
  }
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    db,
    collector: collector?.state ?? null,
    oddsSocket: oddsStatus,
    pusher: pusher?.stats() ?? null,
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
    const [match] = await withOdds([row]);
    res.json(match);
  } catch (e) {
    return next(e);
  }
});

app.get('/api/odds/:matchId/history', async (req, res, next) => {
  try {
    res.json({ items: await getOddsHistory(Number(req.params.matchId), asInt(req.query.limit, 200, 1000)) });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------ odds ingestion */

function broadcastOdds(changed) {
  if (!io || !changed.length) return;
  const byMatch = groupByMatch(changed);
  for (const [matchId, list] of byMatch) {
    io.emit('odds:update', {
      matchId,
      at: new Date().toISOString(),
      markets: buildMarkets(toDbOddsShape(list)),
    });
  }
}

/** applies a decoded match-info (score / clock / stats) and broadcasts it */
async function applyInfoFromFeed(info) {
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
  if (updated) io?.emit('match:info', { ...enriched, ...updated, stats: statsFromRow(updated) });
  return updated;
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
      broadcastOdds(await applyOddsRows(rows));
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
    broadcastOdds(changed);
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
    if (changed.length) broadcastOdds(changed);

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

/* ---------------------------------------------------------------- delivery */

const docsDir = fileURLToPath(new URL('../docs/', import.meta.url));
app.use(express.static(docsDir));

app.use((err, _req, res, _next) => {
  console.error('[http]', err.message);
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
  socket.emit('hello', { at: new Date().toISOString(), pollMs: config.pollIntervalMs });
  try {
    const counts = await getCounts();
    socket.emit('meta', counts);
    const rows = await getMatches({ service: 'LIVE', limit: 500 });
    socket.emit('matches:live', { at: new Date().toISOString(), counts, matches: await withOdds(rows) });
  } catch (e) {
    socket.emit('server:error', { message: e.message });
  }
});

async function boot() {
  try {
    await initSchema();
    console.log('[db] schema ready');
  } catch (e) {
    console.error('[db] schema init failed:', e.message);
  }

  collector = startCollector({ io });

  if (process.env.ODDS_SOCKET === 'true') {
    pusher = startPusher({
      getIds: () =>
        getSubscriptionIds({
          liveLimit: Number(process.env.SUBSCRIBE_LIVE_LIMIT ?? 250),
          prematchLimit: Number(process.env.SUBSCRIBE_PREMATCH_LIMIT ?? 150),
        }),
      fullMarkets: process.env.SUBSCRIBE_FULL_MARKETS !== 'false',
      fullMarketsLiveLimit: Number(process.env.SUBSCRIBE_FULL_LIMIT ?? 60),
      onOdds: (rows) => oddsBuffer.push(...rows),
      onInfo: (info) => infoBuffer.set(info.matchId, info),
      onStatus: (s) => {
        oddsStatus = { ...oddsStatus, ...s };
        io.emit('odds:socket', oddsStatus);
      },
    });
    console.log('[pusher] server-side odds subscription enabled');
  } else {
    console.log('[odds] server-side subscription off (set ODDS_SOCKET=true); the browser relay still feeds /ingest/frames');
  }
}

boot();

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    console.log(`[app] ${sig} received, shutting down`);
    collector?.stop();
    pusher?.close();
    io.close();
    server.close();
    await closePool();
    process.exit(0);
  });
}
