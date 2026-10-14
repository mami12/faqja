/**
 * Idle mode: stop talking to the outside world when nobody is watching.
 *
 * Railway bills the container per minute (vCPU + RAM) and puts a service to sleep only when
 * it sees no outbound packets for a few minutes (Serverless). Our own loops are exactly what
 * keeps it awake: the collector polls upstream every 10s, the pusher holds a websocket that
 * replies to heartbeats every ~25s, the database probe runs every 15s and settlement every
 * 30s. With no visitor those packets buy nothing - nobody is reading the board.
 *
 * So when the last visitor has been gone for a while the feed is paused (upstream websocket
 * closed, collector stopped, probe and settlement stopped): no outbound traffic at all, and
 * the platform may sleep the instance. The first request wakes it, the process boots, the
 * collector fills the board and the pusher subscribes again - a few seconds, plus whatever
 * Railway needs for the cold start.
 *
 * That window is why the mode is published (`feed:state` over the socket and in /health) and
 * why bets are refused while the feed is not live: a price that has not been refreshed since
 * before the pause must never be sold.
 *
 * No imports on purpose: pure logic, testable without a server.
 */

export const FEED_LIVE = 'live'; // feed running, prices fresh, bets accepted
export const FEED_IDLE = 'idle'; // feed paused on purpose, instance free to sleep
export const FEED_WAKING = 'waking'; // feed starting again: collecting the first cycle

let mode = FEED_LIVE;

export const getFeedMode = () => mode;

export function setFeedMode(next) {
  if (next !== FEED_LIVE && next !== FEED_IDLE && next !== FEED_WAKING) return mode;
  mode = next;
  return mode;
}

/** true while the board cannot be trusted to hold fresh prices (idle or waking) */
export const feedIsRefreshing = () => mode !== FEED_LIVE;

/** true only while the feed is stopped - the state in which nothing may go out on the wire */
export const feedIsStopped = () => mode === FEED_IDLE;

/**
 * Should the feed be paused by now? Pure so the rule can be read and tested on its own.
 *
 * A process nobody has visited yet uses `coldBootIdleMs` instead of `idleAfterMs`: after a
 * wake (or a deploy) the feed is started to fill the board, and if no visitor ever arrives
 * there is no reason to pay for a 15 minute warm-up.
 */
export function shouldSleep({
  mode: current = FEED_LIVE,
  clients = 0,
  visits = 0,
  lastActivityAt = 0,
  now = Date.now(),
  idleAfterMs = 0,
  coldBootIdleMs = 0,
} = {}) {
  if (current !== FEED_LIVE) return false;
  if (clients > 0) return false; // somebody is on the board right now
  const wait = visits > 0 ? Number(idleAfterMs) : Number(coldBootIdleMs);
  if (!Number.isFinite(wait) || wait <= 0) return false; // waiting disabled
  const since = now - (Number(lastActivityAt) || 0);
  return since >= wait;
}


/** waking is triggered by a visitor, never by a timer */
export function shouldWake({ mode: current = FEED_LIVE, clients = 0, requested = false } = {}) {
  if (current !== FEED_IDLE) return false;
  return requested === true || clients > 0;
}

/**
 * The monitor: counts visitors (socket connections and app API calls), pauses the feed when
 * they are gone and wakes it on the next sign of life.
 *
 * `onIdle` / `onWake` / `onMode` are the wiring in index.mjs; nothing here touches the
 * collector, the pusher or socket.io, so this file stays testable on its own.
 */
export function createIdleMonitor({
  enabled = true,
  idleAfterMs = 15 * 60 * 1000,
  coldBootIdleMs = 2 * 60 * 1000,
  tickMs = 5000,
  onIdle,
  onWake,
  onMode,
  log = console,
} = {}) {
  const state = {
    enabled: enabled === true,
    clients: 0,
    visits: 0,
    lastActivityAt: Date.now(),
    idleSince: null,
    sleeps: 0,
    wakes: 0,
  };
  let timer = null;

  const snapshot = () => ({
    enabled: state.enabled,
    mode: getFeedMode(),
    clients: state.clients,
    visits: state.visits,
    idleAfterMs: Number(idleAfterMs) || 0,
    coldBootIdleMs: Number(coldBootIdleMs) || 0,
    lastActivityAt: new Date(state.lastActivityAt).toISOString(),
    idleSince: state.idleSince,
    sleeps: state.sleeps,
    wakes: state.wakes,
  });

  const publish = () => {
    try {
      onMode?.(snapshot());
    } catch (e) {
      log.error?.('[idle] publishing the feed state failed:', e?.message ?? e);
    }
  };

  const goIdle = () => {
    if (getFeedMode() !== FEED_LIVE) return false;
    setFeedMode(FEED_IDLE);
    state.idleSince = new Date().toISOString();
    state.sleeps++;
    log.log(
      `[idle] no visitor for ${Math.round((Number(idleAfterMs) || 0) / 1000)}s - pausing the feed ` +
        '(pusher, collector, db probe and settlement); with no outbound traffic left the instance may sleep',
    );
    try {
      onIdle?.();
    } finally {
      publish();
    }
    return true;
  };

  const wake = (why = 'a request') => {
    if (!shouldWake({ mode: getFeedMode(), clients: state.clients, requested: true })) return false;
    setFeedMode(FEED_WAKING);
    state.wakes++;
    state.idleSince = null;
    log.log(`[idle] ${why} - waking the feed`);
    try {
      onWake?.();
    } finally {
      publish();
    }
    return true;
  };

  const evaluate = () => {
    if (!state.enabled) return false;
    return shouldSleep({
      mode: getFeedMode(),
      clients: state.clients,
      visits: state.visits,
      lastActivityAt: state.lastActivityAt,
      now: Date.now(),
      idleAfterMs,
      coldBootIdleMs,
    })
      ? goIdle()
      : false;
  };

  return {
    state: snapshot,

    /** any sign of life: an app API request, an ingest frame from the browser relay */
    touch() {
      state.lastActivityAt = Date.now();
      return wake('a request');
    },

    /** a board socket opened: that is a visitor, and it must get a live board */
    clientOpen() {
      state.clients++;
      state.visits++;
      state.lastActivityAt = Date.now();
      return wake('a visitor');
    },

    clientClose() {
      state.clients = Math.max(0, state.clients - 1);
      state.lastActivityAt = Date.now();
      return snapshot();
    },

    /** the feed has caught up (first collector cycle done): the board is live again */
    markLive() {
      if (getFeedMode() !== FEED_WAKING) return false;
      setFeedMode(FEED_LIVE);
      state.lastActivityAt = Date.now();
      publish();
      return true;
    },

    evaluate,
    start() {
      if (timer || !state.enabled) return false;
      timer = setInterval(evaluate, Math.max(1000, Number(tickMs) || 5000));
      timer.unref?.();
      return true;
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
