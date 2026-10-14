/**
 * The public match feed does NOT expose a live clock, so the minute is derived
 * from kickoff time: 1H 0-45, half time 45-60, 2H 46-90, then FT.
 * Clearly an approximation — swap it for real clock data once the push channel
 * is decoded (see server/odds.mjs).
 */
export function liveClock(startAt, now = Date.now()) {
  const start = startAt instanceof Date ? startAt.getTime() : new Date(startAt).getTime();
  if (!Number.isFinite(start)) return { minute: null, phase: null, status: 'scheduled' };

  const elapsed = Math.floor((now - start) / 60000);
  if (elapsed < 0) return { minute: null, phase: 'pre', status: 'scheduled' };
  if (elapsed <= 45) return { minute: Math.max(1, elapsed), phase: '1H', status: 'live' };
  if (elapsed <= 60) return { minute: 45, phase: 'HT', status: 'live' };
  if (elapsed <= 105) return { minute: Math.min(90, elapsed - 15), phase: '2H', status: 'live' };
  return { minute: 90, phase: 'FT', status: 'ended' };
}

export function minuteLabel(row) {
  if (row.status !== 'live') return null;
  if (row.phase === 'HT') return 'HT';
  return row.live_minute ? `${row.live_minute}'` : null;
}
