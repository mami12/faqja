/**
 * Full-time goal/result feasibility against a confirmed live score.
 * No future score may have fewer goals than the current score.
 * Do not apply to half-time/team-total/corner/card contracts.
 */
export function minimumTotalForResult(home, away, result) {
  if (![home, away].every(n => Number.isInteger(n) && n >= 0)) return null;
  if (result === '1') return Math.max(home, away + 1) + away;
  if (result === '2') return home + Math.max(away, home + 1);
  if (result === 'X') return 2 * Math.max(home, away);
  return null;
}

export function isPossibleResultUnder(home, away, result, line) {
  const minimum = minimumTotalForResult(home, away, result);
  const bound = Number(line);
  return minimum === null || !Number.isFinite(bound) || minimum < bound;
}

const wins = (leg, home, away) => {
  const result = home > away ? '1' : home < away ? '2' : 'X';
  if (leg.market === '1X2') return leg.outcome === result;
  if (leg.market === 'DC') return leg.outcome.includes(result);
  if (leg.market === 'BTTS') return (leg.outcome === 'Yes') === (home > 0 && away > 0);
  if (leg.market === 'TOTAL') return leg.outcome === 'Over'
    ? home + away > Number(leg.line) : home + away < Number(leg.line);
  return false;
};

/**
 * True unless confirmed LIVE match facts prove the joint contract impossible.
 * Score evidence is never taken from client-submitted bet parameters.
 */
export function isPossibleLiveCombo(legs, match) {
  const isLive = String(match?.status ?? match?.service ?? '').toUpperCase() === 'LIVE' || match?.live === true;
  if (!isLive) return true;
  if (('scoreAt' in (match ?? {}) && !match.scoreAt) ||
      ('score_at' in (match ?? {}) && !match.score_at)) return true;
  const home = Number(match?.homeScore ?? match?.home_score);
  const away = Number(match?.awayScore ?? match?.away_score);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return true;
  if (!Array.isArray(legs) || legs.length !== 2) return false;
  if (!legs.every(leg => ['1X2', 'DC', 'BTTS', 'TOTAL'].includes(leg.market))) return false;

  const bound = Math.max(12, home + 3, away + 3,
    ...legs.filter(leg => leg.market === 'TOTAL').map(leg => Math.ceil(Number(leg.line)) + 2));
  // Unrealistic or malformed observations are not a safe basis for accepting new wagers.
  if (!Number.isFinite(bound) || bound > 40) return false;
  for (let h = home; h <= bound; h++) for (let a = away; a <= bound; a++) {
    if (legs.every(leg => wins(leg, h, a))) return true;
  }
  return false;
}
