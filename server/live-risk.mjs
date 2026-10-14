/**
 * Server-owned, display-only and placement-time suspension policy.
 * This is a rule-based risk guard, NOT a calibrated win-probability estimator.
 *
 * All the thresholds can be tuned via Railway environment variables.
 * Never use browser odds, browser score or client-provided IDs as authority.
 */
import { config } from './config.mjs';

const num = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function riskMinute(match, now = Date.now()) {
  const explicit = num(match?.minute ?? match?.currentMinute);
  const fallback = num(match?.live_minute);
  const rawClock = num(match?.match_time_ms);
  const clockAt = match?.clock_at ? new Date(match.clock_at).getTime() : null;
  const anchored = rawClock !== null && clockAt !== null && Number.isFinite(clockAt)
    ? Math.floor(rawClock / 60000) + Math.max(0, Math.floor((now - clockAt) / 60000))
    : rawClock !== null ? Math.floor(rawClock / 60000) : null;
  const options = [explicit, fallback, anchored].filter((v) => v !== null && v >= 0);
  return options.length ? Math.max(...options) : null;
}

export function isFullTimeWinnerMarket(marketName, marketKey) {
  const name = String(marketName ?? '').toLowerCase().trim();
  const key = String(marketKey ?? '').toLowerCase().trim();
  // A generic feed "result" column also includes corners, next goal, HT/FT, etc.
  const excluded = /\b(?:corners?|cards?|bookings?|goal(?:s|scorer)?|correct|score|half|period|quarter|next|handicap|both|btts|minute|double chance|asian|penalty|to qualify|race to)\b/i;
  if (excluded.test(name)) return false;
  const recognized = /^(?:full\s*time\s*result|fulltime\s*result|match\s*result|match\s*winner|full\s*time\s*winner|1\s*x\s*2|moneyline|match\s*odds|three\s*way|result(?:\s*of\s*match)?)$/i;
  return recognized.test(name) ||
    (!name || /^(?:market|unknown|cols-?\d+)$/i.test(name)) &&
    /^(?:1x2|ft[.-]?1x2|match[-_]?result|result|moneyline)$/i.test(key);
}

export function isLeaderWinChoice(outcomeKey, outcomeName, leader) {
  if (!leader) return false;
  const code = String(outcomeKey ?? '').toLowerCase().trim();
  const label = String(outcomeName ?? '').toLowerCase().trim();
  const candidates = leader === 'home'
    ? new Set(['1', 'home', 'home team', 'home win', 'w1', 'h', 'vendas'])
    : new Set(['2', 'away', 'away team', 'away win', 'w2', 'a', 'udhetues']);
  return candidates.has(code) || candidates.has(label);
}

const setting = (key, defaultValue) => {
  const value = num(config[key]);
  return value !== null && value >= 0 ? value : defaultValue;
};

/**
 * Returns a reason string or null. One canonical decision for REST, websocket
 * locks, real bet placement and booking. The score must come from the live feed.
 *
 * - Any market at minute 85+ priced <=1.05: block ultra-short prices.
 * - Full-time leader at minute 75+, ahead by 2+ and priced <=1.50: block.
 * - Full-time leader at minute 85+, ahead by 1+ and priced <=1.10: block.
 */
export function liveRiskReason(match, selection, now = Date.now()) {
  if (config.liveRiskEnabled === false) return null;
  const service = String(match?.service ?? '').toUpperCase();
  const live = service === 'LIVE' || match?.live === true || match?.status === 'LIVE';
  if (!live) return null;
  const price = num(selection?.price ?? selection?.odds);
  if (price === null || price <= 1) return null;

  const minute = riskMinute(match, now);
  if (minute === null) return null;
  const lateMinute = setting('liveRiskLateMinute', 85);
  const ultraOdds = setting('liveRiskUltraOdds', 1.05);
  if (minute >= lateMinute && price <= ultraOdds) return 'ultra_low_late_price';

  if (!isFullTimeWinnerMarket(selection?.marketName ?? selection?.market_name,
      selection?.marketKey ?? selection?.market_key)) return null;

  const scoreAt = match?.score_at ?? match?.scoreAt ?? null;
  // A display fallback of 0-0 without an actual score frame must never decide a bet.
  if (!scoreAt) return null;
  const home = num(match?.home_score ?? match?.homeScore ?? match?.score?.home);
  const away = num(match?.away_score ?? match?.awayScore ?? match?.score?.away);
  if (home === null || away === null || home < 0 || away < 0 || home === away) return null;
  const lead = Math.abs(home - away);
  const leader = home > away ? 'home' : 'away';
  if (!isLeaderWinChoice(selection?.outcomeKey ?? selection?.outcome_key,
    selection?.outcomeName ?? selection?.outcome_name, leader)) return null;

  if (minute >= setting('liveRiskLeadMinute', 75) &&
      lead >= setting('liveRiskLeadGoals', 2) &&
      price <= setting('liveRiskLeadOdds', 1.50)) return 'large_lead_low_price';
  if (minute >= lateMinute && lead >= 1 &&
      price <= setting('liveRiskLateOdds', 1.10)) return 'late_leader_low_price';
  return null;
}
