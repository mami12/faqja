/**
 * Conservative LIVE contract-expiry guard, shared by synthetic Bet Builders
 * and ordinary ticket validation. This is intentionally narrower than the
 * frontend's visual expiry rules: never guess a market's outcome from a
 * current leader, a missing score, or an uncertain period.
 *
 * Score/phase facts must be real (not odds, labels or browser input).
 */
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
  if ('score_at' in (match ?? {}) && !match.score_at) return null;
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
  if (/\b(?:first|1st|second|2nd)\s*half\b|\b(?:ht|ft)\s*\/|halftime\s*\/?\s*fulltime|\b(?:player|corner|card|booking|next|last|first goal|race|handicap|asian|team total)\b|[&+]/.test(name) ||
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
