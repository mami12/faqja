/**
 * Conservative LIVE contract-expiry guard, shared by synthetic Bet Builders
 * and ordinary ticket validation. This is intentionally narrower than the
 * frontend's visual expiry rules: never guess a market's outcome from a
 * current leader, a missing score, or an uncertain period.
 *
 * Score/phase facts must be real (not odds, labels or browser input).
 */
import { isImpossibleLiveCombination } from './combo-feasibility.mjs';
const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const safeNumber = value => {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function currentScore(match) {
  const service = String(match?.service ?? match?.status ?? '').toUpperCase();
  if (service !== 'LIVE' && match?.live !== true) return null;
  // Raw match rows carry score_at. A missing timestamp means a default
  // 0-0 placeholder, not confirmed feed evidence.
  if (('score_at' in (match ?? {}) && !match.score_at) ||
      ('scoreAt' in (match ?? {}) && !match.scoreAt)) return null;
  const h = safeNumber(match?.home_score ?? match?.homeScore ?? match?.score?.home);
  const a = safeNumber(match?.away_score ?? match?.awayScore ?? match?.score?.away);
  return h === null || a === null ? null : { home: h, away: a };
}

const firstHalfContract = market =>
  Number(market?.period ?? 0) === 1 ||
  /\b(?:first|1st)\s*half\b|\b(?:half time|halftime)\b(?!\s*\/?\s*(?:fulltime|ft))/.test(norm(market?.name));

function firstHalfElapsed(match) {
  const phase = norm(match?.period ?? match?.phase ?? match?.feed_status);
  return /^(?:2h|ht|ft|2nd half|second half|break time|half time|halftime|ended|finished)\b/.test(phase)
    || (safeNumber(match?.currentMinute ?? match?.live_minute) ?? 0) > 45;
}

/** True only once a confirmed LIVE fact irreversibly decides the contract. */
export function isDecidedLiveMarket(match, market) {
  const score = currentScore(match);
  if (!score) return false;
  const name = norm(market?.name ?? market?.market_name);
  if (firstHalfContract(market) && firstHalfElapsed(match)) return true;
  // No guessing about half-specific or combined propositions.
  if (/\b(?:first|1st|second|2nd)\s*half\b|\b(?:ht|ft)\s*\/|halftime\s*\/?\s*fulltime|\b(?:players?|corners?|cards?|bookings?|next|last|first goal|race|handicap|asian|team total)\b|[&+]/.test(name) ||
      Number(market?.period ?? 0) !== 0) return false;

  if (/^(?:both teams to score|both teams score|both score|btts)(?:\s*[-(].*)?$/.test(name)) {
    return score.home > 0 && score.away > 0;
  }

  if (!/^(?:total(?:\s+goals?)?|goals?\s+total|over\s*\/?\s*under|under\s*\/?\s*over|goal line)(?:\s|$)/.test(name)) return false;
  const rawLine = market?.line ?? market?.specifier;
  const suffix = name.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\)?$/);
  const line = safeNumber(rawLine !== '' && rawLine != null ? rawLine : suffix?.[1]);
  // In a whole-goal line, exactly 2 goals at 2.0 is not necessarily final.
  return line !== null && score.home + score.away > line;
}

/**
 * A mixed price is not sellable as soon as ANY non-reversible constituent
 * (the total threshold or the both-teams-score condition) is completed.
 * Do not settle the 1X2/DC winner before full time, and do not infer unknown
 * provider contracts. This protects placement even from stale browser tabs.
 */
export function isDecidedLiveOutcome(match, market) {
  if (isImpossibleLiveCombination(match,market)) return true;
  const score = currentScore(match);
  if (!score) return false;
  if (isDecidedLiveMarket(match, market)) return true;
  const name = norm(market?.name ?? market?.market_name);
  if (Number(market?.period ?? 0) === 2 ||
      /\b(?:second|2nd)\s*half\b|\b(?:ht|ft)\s*\/|halftime\s*\/?\s*fulltime/.test(name)) return false;
  if (firstHalfContract(market) && firstHalfElapsed(match)) return false;

  const rawName = String(market?.outcomeName ?? market?.outcome_name ?? '').trim();
  const rawCode = String(market?.outcomeCode ?? market?.outcome_key ?? '').trim();
  const labels = [rawName, rawCode].filter(Boolean);
  const all = labels.join(' | ').toLowerCase();
  const namedCombo = /^bet builder\s*:/.test(name) ||
    /\b(?:result|1\s*x\s*2|double chance|total|goals|btts|both teams)\b.*\b(?:and|with)\b.*\b(?:result|total|goals|both teams|btts|score)\b/.test(name) ||
    /\b(?:result|1x2|double chance|total|btts)\s*[&+]\s*(?:total|btts|goals|result|1x2|both)/.test(name);
  const explicitLegs = /\b(?:1x2|dc|btts|total)\s+\S+\s+\+\s+(?:1x2|dc|btts|total)\b/i.test(rawName) ||
    /\b(?:g\/g|n\/g)\s*[&+]\s*(?:p_|l_|[+-]?\d)/i.test(rawName) ||
    /\b(?:1\/x|x\/2|1\/2|[12x])\s*&\s*(?:g\/g|n\/g|p_|l_)/i.test(rawName);
  if (!namedCombo && !explicitLegs) return false;

  const totals = [];
  for (const label of labels) {
    for (const m of label.matchAll(/\b(?:over|under)\s*(\d+(?:[.,]\d+)?)\b/gi)) {
      const threshold = safeNumber(m[1]);
      if (threshold !== null) totals.push(threshold);
    }
    if (explicitLegs) {
      for (const m of label.matchAll(/(?:[&+]\s*)(?:p_|l_|\+|-)?\s*(\d+[.,]\d+)\b/gi)) {
        const threshold = safeNumber(m[1]);
        if (threshold !== null) totals.push(threshold);
      }
    }
  }
  if (!totals.length && /\b(?:total|goals)\b/.test(name) &&
      /\b(?:over|under)\b/i.test(all)) {
    const threshold = safeNumber(market?.line ?? market?.specifier);
    if (threshold !== null) totals.push(threshold);
  }
  if (totals.some(threshold => score.home + score.away > threshold)) return true;

  const bttsLeg = /\bbtts\s+(?:yes|no)\b|\b(?:g\/g|n\/g)\b/i.test(all) ||
    /\b(?:both (?:teams? )?(?:not )?to score|both (?:teams? )?to score|to nil)\b/i.test(all) ||
    (/\b(?:btts|both teams(?: to)? score)\b/.test(name) &&
     /\b(?:yes|no|gg|ng)\b/i.test(all));
  return bttsLeg && score.home > 0 && score.away > 0;
}
