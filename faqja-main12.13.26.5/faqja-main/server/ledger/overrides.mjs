/**
 * Admin overrides (suspend a match/market/outcome, pin a price).
 *
 * The board is fed continuously, so a plain "edit the price" would be overwritten by the
 * next frame. Overrides are stored separately in app_feed_override and applied when the app
 * view is built and when a bet is validated - which is also what lets the admin panel
 * suspend something and have it actually stick.
 *
 * Reads come from a short-lived in-memory snapshot so the view can stay synchronous.
 */
import { query } from '../db.mjs';

const TTL_MS = 4000;
let cache = { at: 0, match: new Map(), market: new Map(), outcome: new Map() };

/** the view is built synchronously, so staleness triggers a background reload instead of a wait */
let reloading = false;
function ensureFresh() {
  if (reloading || Date.now() - cache.at < TTL_MS) return;
  reloading = true;
  refresh()
    .catch(() => {})
    .finally(() => {
      reloading = false;
    });
}

const refOfMarket = (matchId, marketKey, line) => `${matchId}|${marketKey}|${line ?? ''}`;
const refOfOutcome = (matchId, marketKey, line, outcomeKey) => `${refOfMarket(matchId, marketKey, line)}|${outcomeKey}`;

/** reloads the snapshot (throttled unless `force`) */
export async function refresh(force = false) {
  if (!force && Date.now() - cache.at < TTL_MS) return cache;
  try {
    const res = await query('select kind, ref, suspended, price from app_feed_override');
    const match = new Map();
    const market = new Map();
    const outcome = new Map();
    for (const row of res.rows) {
      const entry = { suspended: row.suspended === true, price: row.price === null ? null : Number(row.price) };
      if (row.kind === 'match') match.set(row.ref, entry);
      else if (row.kind === 'market') market.set(row.ref, entry);
      else if (row.kind === 'outcome') outcome.set(row.ref, entry);
    }
    cache = { at: Date.now(), match, market, outcome };
  } catch {
    /* database down: keep the previous snapshot, the board must not care */
  }
  return cache;
}

export const snapshot = () => cache;
export const matchOverride = (matchId) => {
  ensureFresh();
  return cache.match.get(String(matchId)) ?? null;
};
export const marketOverride = (matchId, marketKey, line) => {
  ensureFresh();
  return cache.market.get(refOfMarket(matchId, marketKey, line)) ?? null;
};
export const outcomeOverride = (matchId, marketKey, line, outcomeKey) => {
  ensureFresh();
  return cache.outcome.get(refOfOutcome(matchId, marketKey, line, outcomeKey)) ?? null;
};

const KINDS = new Set(['match', 'market', 'outcome']);

export async function upsert(kind, ref, { suspended = null, price = null } = {}) {
  if (!KINDS.has(kind)) throw Object.assign(new Error('kind must be match, market or outcome'), { status: 400 });
  if (!ref) throw Object.assign(new Error('ref is required'), { status: 400 });

  await query(
    `insert into app_feed_override (kind, ref, suspended, price)
     values ($1, $2, $3, $4)
     on conflict (kind, ref) do update set
       suspended  = coalesce(excluded.suspended, app_feed_override.suspended),
       price      = coalesce(excluded.price, app_feed_override.price),
       updated_at = now()`,
    [kind, String(ref), suspended, price],
  );
  await refresh(true);
  return list();
}

export async function clear(kind, ref) {
  await query('delete from app_feed_override where kind = $1 and ref = $2', [kind, String(ref)]);
  await refresh(true);
  return list();
}

export async function list() {
  const res = await query('select kind, ref, suspended, price, updated_at from app_feed_override order by updated_at desc');
  return res.rows.map((r) => ({
    kind: r.kind,
    ref: r.ref,
    suspended: r.suspended,
    price: r.price === null ? null : Number(r.price),
    updatedAt: r.updated_at,
  }));
}