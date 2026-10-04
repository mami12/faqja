/**
 * Server-side subscription to the push channel (the one the browser uses).
 *
 * Verified protocol:
 *   <- 0{"sid":…}                         engine.io open
 *   -> 40                                 open the namespace
 *   <- 40{"sid":…,"pid":…}
 *   -> 42["subscribe",{"messageType":"subscribe-match-odds","data":{"matchIds":[ids…],"isBaseOddsGroups":true|false}}]
 *   -> 42["subscribe",{"messageType":"subscribe-match-info","data":{"matchIds":[ids…]}}]
 *   <- 42["u",{"messageType":"match-odds-snapshot"|"match-odds"|"match-info-snapshot"|"match-info",…},id]
 *   <- 2 / -> 3                           heartbeat every ~25s
 *
 * Subscriptions must be repeated every ~20s; ids are chunked by 50.
 *
 * The repeat cadence is no longer uniform (see subscribe-plan.mjs): live matches keep the
 * ~20s cadence because a re-subscribe is what makes the feed resend their clock and score,
 * prematch follows two tiers (kickoff within 30 min = "soon", everything else = "later") and
 * a fixture the feed has not priced yet is asked for every minute until it gets a price -
 * without that last group it would stay hidden by the "hide matches without prices" rule.
 * One cadence for everything is what made 150 fixtures kicking off hours from now cost as
 * much (on Railway: as much CPU) as the live board.
 *
 * pause()/resume() exist for idle mode (server/idle-mode.mjs): with no visitor the socket is
 * closed and nothing is subscribed, so no packet leaves the instance at all - which is what
 * lets the platform put it to sleep.
 */
import WebSocket from 'ws';
import { config, dbErrorHint } from './config.mjs';
import { decodePushBatch } from './push-decode.mjs';
import {
  SUBSCRIBE_GROUPS,
  DEFAULT_SOON_REFRESH_MS,
  DEFAULT_REFRESH_MS,
  DEFAULT_UNPRICED_MS,
  dueGroups,
  retryIntervals,
  withoutDuplicates,
} from './subscribe-plan.mjs';

const CHUNK = 50;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const HEADERS = {
  'user-agent': UA,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://bitgames6205.com',
  referer: 'https://bitgames6205.com/',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export function startPusher({
  getIds,
  onOdds,
  onInfo,
  onStatus,
  fullMarkets = false,
  fullMarketsLiveLimit = 60,
  fullMarketsOrder = 'recent',
  resubscribeMs = 20000,
  prematchSoonMs = DEFAULT_SOON_REFRESH_MS,
  prematchLaterMs = DEFAULT_REFRESH_MS,
  prematchUnpricedMs = DEFAULT_UNPRICED_MS,
  tickMs = 5000,
  verbose = true,
} = {}) {
  const url = `wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=${encodeURIComponent(
    config.lang,
  )}&externalPartnerId=${encodeURIComponent(config.partnerId)}&EIO=4&transport=websocket`;

  let ws = null;
  let closed = false;
  let ready = false; // the namespace is open: subscriptions may be sent
  let sending = false; // one subscribe pass at a time (the passes are async)
  let attempt = 0;
  let timer = null;
  const counts = {
    connect: 0, frames: 0, oddsMessages: 0, infoMessages: 0, subscribedIds: 0,
    // only snapshot frames carry the clock (matchTime) and the score (matchScore);
    // these counters are what make a silent score/minute freeze visible in /health
    snapshots: 0, clockFrames: 0, scoreFrames: 0, subscribeCalls: 0, lastSnapshotAt: null,
    // what each subscription tier actually costs is the point of the tiers, so /health shows
    // how often each group was sent and how many ids it carried
    subscribeCallsByGroup: { live: 0, soon: 0, later: 0, unpriced: 0 },
    groupIds: { live: 0, soon: 0, later: 0, unpriced: 0 },
    lastSubscribeAt: null, pauses: 0, resumes: 0, paused: false,
  };
  /** how often each group is sent; a non-positive value means "every cycle" (kill switch) */
  const intervals = {
    live: Number(resubscribeMs) || 0,
    soon: Number(prematchSoonMs) || 0,
    later: Number(prematchLaterMs) || 0,
    unpriced: Number(prematchUnpricedMs) || 0,
  };
  const lastSent = {};

  /**
   * Sends the given groups. Every group goes out when the namespace opens; afterwards only the
   * groups the scheduler says are due (see subscribe-plan.mjs and pump()).
   */
  const subscribeGroups = async (groups = SUBSCRIBE_GROUPS, why = 'tick') => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    let ids;
    try {
      ids = (await getIds?.()) ?? {};
    } catch (e) {
      console.error('[pusher] subscription ids failed:', dbErrorHint(e.message));
      return;
    }

    const live = (ids.live ?? []).map(Number);
    const soon = (ids.prematchSoon ?? ids.prematch ?? []).map(Number);
    const later = (ids.prematchLater ?? []).map(Number);
    // unpriced fixtures are a subset of soon+later by definition: subscribing the same ids
    // twice in one cycle only makes the feed repeat frames we already have
    const unpriced = withoutDuplicates(ids.unpriced ?? [], [...live, ...soon, ...later]).map(Number);

    const send = (messageType, list, isBaseOddsGroups) => {
      for (const part of chunk(list, CHUNK)) {
        const data = { matchIds: part };
        if (messageType === 'subscribe-match-odds') data.isBaseOddsGroups = isBaseOddsGroups;
        ws.send(`42["subscribe",${JSON.stringify({ messageType, data })}]`);
      }
    };

    const at = Date.now();
    const sizeOf = { live: live.length, soon: soon.length, later: later.length, unpriced: unpriced.length };

    for (const group of groups) {
      counts.subscribeCalls++;
      counts.subscribeCallsByGroup[group] = (counts.subscribeCallsByGroup[group] ?? 0) + 1;
      counts.groupIds[group] = sizeOf[group] ?? 0;
      lastSent[group] = at;

      if (group === 'live') {
        // full market list (corners, cards, every total) for a slice of the live list, base
        // markets (1X2 / handicap / total) for the rest. `live` is ordered oldest kickoff
        // first, so taking the tail puts the quota on the matches that just started - the ones
        // a user is most likely to open. Matches the app has opened are always included (`full`).
        const ordered = fullMarketsOrder === 'oldest' ? live : [...live].reverse();
        const boostedLive = new Set((ids.full ?? []).map(Number).filter((id) => live.includes(id)));
        const fullLive = fullMarkets
          ? [...new Set([...ordered.slice(0, fullMarketsLiveLimit), ...boostedLive])]
          : [];
        const fullSet = new Set(fullLive);
        const baseLive = fullMarkets ? live.filter((id) => !fullSet.has(id)) : live;

        send('subscribe-match-odds', fullLive, false);
        send('subscribe-match-odds', baseLive, true);
        send('subscribe-match-info', live);
        counts.fullMarketsIds = fullLive.length;
        counts.boostedIds = boostedLive.size;
      } else if (group === 'soon') {
        // kicks off within PREMATCH_SOON_MIN: base markets (what a bet is placed on) plus its
        // clock/score snapshot, so the minute is right the moment the match goes live
        send('subscribe-match-odds', soon, true);
        send('subscribe-match-info', soon.slice(0, 25));
      } else if (group === 'later') {
        // hours away: one snapshot per hour keeps it on the board and bettable, and the store
        // holds prices for 6h (odds-store.mjs)
        send('subscribe-match-odds', later, true);
      } else {
        // no price yet -> the board hides it, so ask again every minute until one arrives
        send('subscribe-match-odds', unpriced, true);
      }
    }

    for (const frame of config.subscribeFrames) ws.send(frame);

    counts.subscribedIds = live.length + soon.length + later.length;
    counts.lastSubscribeAt = new Date(at).toISOString();
    if (verbose) {
      console.log(
        `[pusher] subscribe(${why}) ${groups.join('+')} live=${live.length}` +
          `${groups.includes('soon') ? ` soon=${soon.length}` : ''}` +
          `${groups.includes('later') ? ` later=${later.length}` : ''}` +
          `${groups.includes('unpriced') ? ` unpriced=${unpriced.length}` : ''}`,
      );
    }
  };

  /** sends whatever the cadences in `intervals` say is due right now */
  const pump = async () => {
    if (closed || counts.paused || sending || !ready) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // a group that went out empty was not subscribed at all (a cold start connects before the
    // first poll has filled the store): it retries on the live cadence instead of waiting an
    // hour. A retry with nothing in it sends no frames.
    const empty = SUBSCRIBE_GROUPS.filter((group) => (counts.groupIds[group] ?? 0) === 0);
    const due = dueGroups({ lastSent, intervals: retryIntervals(intervals, empty) });
    if (!due.length) return;
    sending = true;
    try {
      await subscribeGroups(due, 'tick');
    } catch (e) {
      console.error('[pusher] subscribe failed:', dbErrorHint(e.message));
    } finally {
      sending = false;
    }
  };

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(url, { headers: HEADERS, handshakeTimeout: 20000 });

    ws.on('open', () => {
      attempt = 0;
      counts.connect++;
      onStatus?.({ connected: true });
      console.log('[pusher] socket open');
    });

    ws.on('message', (data) => {
      const text = data.toString();

      if (text === '2') {
        ws.send('3');
        return;
      }
      if (text.startsWith('0')) {
        ws.send('40');
        return;
      }
      if (text.startsWith('40')) {
        // the namespace is open: send every group once, then let the cadences take over
        ready = true;
        subscribeGroups(SUBSCRIBE_GROUPS, 'open');
        clearInterval(timer);
        timer = setInterval(pump, Math.max(1000, Number(tickMs) || 5000));
        return;
      }
      if (!text.startsWith('42')) return;

      counts.frames++;
      const { infos, odds } = decodePushBatch([text]);
      for (const o of odds) {
        counts.oddsMessages++;
        onOdds?.(o.rows);
      }
      for (const i of infos) {
        counts.infoMessages++;
        if (Number.isFinite(i.matchTimeMs)) counts.clockFrames++;
        if (Number.isFinite(i.homeScore)) counts.scoreFrames++;
        if (Number.isFinite(i.matchTimeMs) || Number.isFinite(i.homeScore)) {
          counts.snapshots++;
          counts.lastSnapshotAt = new Date().toISOString();
        }
        onInfo?.(i);
      }
    });

    ws.on('error', (e) => onStatus?.({ connected: false, error: e.message }));
    ws.on('close', () => {
      ready = false;
      clearInterval(timer);
      timer = null;
      onStatus?.({ connected: false });
      // a paused pusher is supposed to be closed: reconnecting here would defeat idle mode,
      // because the socket's heartbeats are outbound traffic that keeps the instance awake
      if (closed || counts.paused) return;
      const delay = Math.min(30000, 3000 * 2 ** attempt++);
      console.log(`[pusher] closed, reconnecting in ${Math.round(delay / 1000)}s`);
      setTimeout(connect, delay);
    });
  };

  connect();

  return {
    stats: () => ({ ...counts, intervals, lastSent }),
    /** idle mode: close the socket so not a single packet leaves the instance */
    pause() {
      if (counts.paused) return false;
      counts.paused = true;
      counts.pauses++;
      ready = false;
      clearInterval(timer);
      timer = null;
      const socket = ws;
      ws = null;
      try {
        // the listeners go first: ws.on('close') would otherwise schedule a reconnect
        socket?.removeAllListeners();
        socket?.close();
      } catch {
        /* ignore */
      }
      onStatus?.({ connected: false, paused: true });
      console.log('[pusher] paused (idle mode)');
      return true;
    },
    /** idle mode: a visitor is back - reconcile and subscribe again */
    resume() {
      if (!counts.paused) return false;
      counts.paused = false;
      counts.resumes++;
      attempt = 0;
      console.log('[pusher] resuming (a visitor is back)');
      connect();
      return true;
    },
    close() {
      closed = true;
      clearInterval(timer);
      timer = null;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
