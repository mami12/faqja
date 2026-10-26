/** Always-on server. Visitor counts are metrics, never a reason to stop work. */
export const FEED_LIVE = 'live';
export const FEED_IDLE = 'idle'; // Legacy protocol name; automatic idle is removed.
export const FEED_WAKING = 'waking';
let mode = FEED_LIVE;
export const getFeedMode = () => mode;
export function setFeedMode(next) {
  // A deliberate refresh guard remains available; old flags cannot enable sleep.
  if (next === FEED_LIVE || next === FEED_WAKING) mode = next;
  return mode;
}
export const feedIsRefreshing = () => mode !== FEED_LIVE;
export const feedIsStopped = () => false;
export const shouldSleep = () => false;
export const shouldWake = () => false;

/** Compatibility metrics for health/socket consumers. No sleep timers or callbacks. */
export function createIdleMonitor({ onMode } = {}) {
  let clients = 0, visits = 0, lastActivityAt = Date.now();
  const state = () => ({ enabled: false, mode: getFeedMode(), clients, visits,
    idleAfterMs: 0, coldBootIdleMs: 0, lastActivityAt: new Date(lastActivityAt).toISOString(),
    idleSince: null, sleeps: 0, wakes: 0 });
  return {
    state,
    touch() { lastActivityAt = Date.now(); return false; },
    clientOpen() { clients++; visits++; lastActivityAt = Date.now(); return false; },
    clientClose() { clients = Math.max(0,clients-1); lastActivityAt = Date.now(); return state(); },
    evaluate: () => false,
    start: () => false,
    stop() {},
    markLive() {
      if (getFeedMode() !== FEED_WAKING) return false;
      setFeedMode(FEED_LIVE); onMode?.(state()); return true;
    },
  };
}
