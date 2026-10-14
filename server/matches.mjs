/**
 * Match store facade.
 *
 * MATCH_STORE=memory (default) keeps the match list in RAM (server/match-store.mjs) so the
 * whole board keeps working when the database is unreachable. MATCH_STORE=db routes the same
 * calls to the Postgres driver again (previous behaviour, kept for rollback and comparison).
 *
 * Callers import from here instead of ./db.mjs, so switching is a single env var.
 */
import { config } from './config.mjs';
import * as memory from './match-store.mjs';
import * as db from './db.mjs';

const inMemory = () => config.matchStore !== 'db';

export async function upsertMatches(rows, chunkSize = 150) {
  return inMemory() ? memory.upsert(rows) : db.upsertMatches(rows, chunkSize);
}

export async function expireStaleMatches(graceSeconds = 150) {
  return inMemory() ? memory.expireStale(graceSeconds) : db.expireStaleMatches(graceSeconds);
}

export async function getMatches(opts = {}) {
  return inMemory() ? memory.getMatches(opts) : db.getMatches(opts);
}

export async function getMatchById(matchId) {
  return inMemory() ? memory.getById(matchId) : db.getMatchById(matchId);
}

export async function getLeagues() {
  return inMemory() ? memory.getLeagues() : db.getLeagues();
}

export async function getCounts() {
  return inMemory() ? memory.getCounts() : db.getCounts();
}

export async function getSubscriptionIds(opts = {}) {
  return inMemory() ? memory.getSubscriptionIds(opts) : db.getSubscriptionIds(opts);
}

export async function knownMatchIds(ids = []) {
  return inMemory() ? memory.knownIds(ids) : db.knownMatchIds(ids);
}

export async function applyMatchInfo(info) {
  return inMemory() ? memory.applyInfo(info) : db.applyMatchInfo(info);
}

export async function getFeedFreshness(olderThanSeconds = 90) {
  return inMemory() ? memory.getFeedFreshness(olderThanSeconds) : db.getFeedFreshness(olderThanSeconds);
}

/** stats for /health (the DB driver has no in-process view, hence the shape difference) */
export function matchStats() {
  return inMemory() ? { ...memory.stats(), mode: config.matchStore } : { mode: config.matchStore };
}

/**
 * Asks the push subscription to include this match in the full-market slice for a while
 * (corners, cards, every total). Memory store only: the DB driver keeps no subscription state.
 */
export function boostMatch(matchId, ttlMs) {
  return inMemory() ? memory.boost(matchId, ttlMs) : false;
}
