/**
 * When to (re)subscribe to the push channel.
 *
 * A match is only priced while it is subscribed, and the subscription has to be repeated
 * every ~20s (see pusher.mjs) - so the re-subscribe cadence is the knob that decides both
 * how fresh a price is and how much work the process does. One cadence for everything meant
 * paying live prices (and, on Railway, live CPU) for prematch fixtures that kick off hours
 * later, while a fixture that starts in ten minutes needs them: the next goal decides a bet
 * placed on it.
 *
 * Prices stay in the in-memory store for 6h (odds-store.mjs), so a fixture that is hours
 * away is still bettable from a snapshot taken an hour ago. The groups are:
 *
 *   live      every RESUBSCRIBE_MS - this is also what refreshes the clock and the score
 *   soon      kickoff within PREMATCH_SOON_MIN (30 by default) -> every 5 min
 *   later     everything else prematch -> every 60 min
 *   unpriced  a match the feed has not priced yet -> every 60s until a price arrives
 *
 * `unpriced` matters because the board hides matches without prices: without an extra
 * attempt a fixture we just discovered would stay invisible until the next hourly pass.
 *
 * PREMATCH_REFRESH_MS=0 restores the old behaviour (every group follows the live cadence)
 * without a deploy - see index.mjs.
 *
 * No imports on purpose: pure and trivially testable (scripts/test-subscribe-plan.mjs).
 */

/** groups the pusher can send, in the order they are sent */
export const SUBSCRIBE_GROUPS = ['live', 'soon', 'later', 'unpriced'];

export const DEFAULT_SOON_MS = 30 * 60 * 1000;
export const DEFAULT_SOON_REFRESH_MS = 5 * 60 * 1000;
export const DEFAULT_REFRESH_MS = 60 * 60 * 1000;
export const DEFAULT_UNPRICED_MS = 60 * 1000;

/**
 * Which groups are due right now. An unknown, missing or non-positive interval means
 * "every cycle" - that is what the kill switch relies on, and it also keeps a
 * misconfigured env var from silently stopping a group forever.
 */
export function dueGroups({ now = Date.now(), lastSent = {}, intervals = {}, force = false } = {}) {
  const out = [];
  for (const group of SUBSCRIBE_GROUPS) {
    if (force) {
      out.push(group);
      continue;
    }
    const every = Number(intervals[group]);
    if (!Number.isFinite(every) || every <= 0) {
      out.push(group);
      continue;
    }
    const last = Number(lastSent[group] ?? 0);
    if (!Number.isFinite(last) || last <= 0 || now - last >= every) out.push(group);
  }
  return out;
}

/**
 * Splits prematch ids by how close their kickoff is. `kickoffById` maps match id -> ms
 * (a Date or a numeric string are accepted too). An unknown kickoff counts as "later":
 * sending it too rarely is recoverable, sending it too often costs money.
 */
export function splitByKickoff(ids = [], kickoffById = {}, { now = Date.now(), soonMs = DEFAULT_SOON_MS } = {}) {
  const soon = [];
  const later = [];
  const window = Number(soonMs);

  for (const id of ids) {
    const raw = kickoffById?.[id] ?? kickoffById?.[String(id)];
    // `Number(null)` is 0, which would read as "kicked off long ago" and land a fixture with no
    // known kickoff in the expensive tier - an unknown kickoff always counts as "later"
    const known = raw !== null && raw !== undefined && raw !== '';
    const at = raw instanceof Date ? raw.getTime() : Number(raw);
    const close = known && Number.isFinite(at) && Number.isFinite(window) && window > 0 && at - now <= window;
    (close ? soon : later).push(id);
  }

  return { soon, later };
}

/**
 * The ids of one group, minus anything already subscribed in the same cycle: the unpriced
 * fixtures are by definition a subset of soon+later, and re-sending the same ids twice only
 * makes the feed repeat frames we already have.
 */
export function withoutDuplicates(ids = [], alreadySent = []) {
  const seen = new Set(alreadySent.map((id) => String(id)));
  return ids.filter((id) => !seen.has(String(id)));
}

/**
 * The intervals to schedule with, adjusted for groups that carried no ids on their last pass.
 *
 * An empty group was not actually subscribed - on a cold start the pusher opens its socket
 * before the collector's first poll has filled the match store, so `soon` and `later` go out
 * with nothing in them. Taking that as "done for the next hour" would keep every prematch
 * fixture off the board, so those groups retry on the live cadence instead. A retry with no ids
 * sends no frames at all, so the cost is a single in-memory scan per cycle.
 */
export function retryIntervals(intervals = {}, emptyGroups = []) {
  const out = { ...intervals };
  const retry = Number(intervals.live) > 0 ? Number(intervals.live) : 0;
  for (const group of emptyGroups) {
    if (group === 'live') continue;
    out[group] = retry;
  }
  return out;
}
