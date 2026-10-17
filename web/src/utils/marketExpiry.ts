/**
 * Live market visibility policy. A market disappears only when its contract is
 * irreversible from the *available* live facts. In particular a current 1X2
 * leader, correct-score hit, or an unknown provider market is NOT final.
 *
 * Presentation-only: placement/settlement continue to rely on server rules.
 */

type Score = { home: number; away: number };
type MarketLike = {
  name?: string; line?: string; specifier?: string; marketType?: string;
  period?: number; status?: string; suspended?: boolean;
  outcomes?: OutcomeLike[];
  /** Actual underlying prices in a synthetic Bet Builder. */
  builderLegs?: { marketId: string; outcomeId: string }[];
};
type OutcomeLike = {
  id?: string; name?: string; code?: string; odds?: number;
  status?: string; suspended?: boolean; feedSuspended?: boolean;
};
type MatchLike = {
  status?: string; period?: string | null; currentMinute?: number;
  homeScore?: number; awayScore?: number;
  corners?: Score | null; cards?: Score | null;
};

const norm = (s: unknown) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
const number = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const scoreOf = (home: unknown, away: unknown): Score | null => {
  const h = number(home), a = number(away);
  return h !== null && a !== null ? { home: h, away: a } : null;
};
const isLive = (m: MatchLike) => norm(m.status) === 'live';

export const isFirstHalfMarket = (name: string): boolean =>
  /\b(?:1st|first)\s*half\b|half\s*1\b|\b1h\b|pjes(?:a|ë)\s*e\s*par[eë]/i.test(name);

export const isSecondHalfMarket = (name: string): boolean =>
  /\b(?:2nd|second)\s*half\b|half\s*2\b|\b2h\b|pjes(?:a|ë)\s*e\s*dyte/i.test(name);

export const isHTFTMarket = (name: string): boolean =>
  /halftime\s*\/?\s*fulltime|ht\s*\/?\s*ft|half.?time\s*\/\s*full.?time/i.test(name);

export const isFirstHalfResultMarket = (name: string): boolean =>
  /1st half.*result|first half.*result|half.?time\s*(result|winner|score)|ht\s*(result|winner|score)/i.test(name);

export const isFirstEventMarket = (name: string): boolean =>
  /\b(?:first|1st)\b.*\b(?:goal|corner|card|booking|point|scorer)\b/i.test(name);

const isMatchFinished = (m: MatchLike): boolean =>
  /^(?:ended|finished|ft|cancelled)$/.test(norm(m.status)) ||
  /^(?:ft|ended|finished)$/.test(norm(m.period));

const isSecondHalfOrLater = (m: MatchLike): boolean => {
  const phase = norm(m.period);
  return /^(?:2h|ht|ft|2nd half|second half|break time|half time|halftime|ended|finished)\b/.test(phase) ||
    (number(m.currentMinute) ?? 0) > 45;
};

const isFirstHalf = (market: MarketLike): boolean => {
  const name = norm(market.name);
  return Number(market.period ?? 0) === 1 ||
    isFirstHalfMarket(name) || isFirstHalfResultMarket(name) ||
    /\b(?:half time|halftime|ht)\b(?!\s*\/?\s*(?:fulltime|ft))/.test(name);
};
const isSecondHalf = (market: MarketLike): boolean =>
  Number(market.period ?? 0) === 2 || isSecondHalfMarket(norm(market.name));

const counter = (m: MatchLike, family: 'goals' | 'corners' | 'cards'): Score | null => {
  if (family === 'goals') return scoreOf(m.homeScore, m.awayScore);
  const stats = m[family];
  return stats ? scoreOf(stats.home, stats.away) : null;
};

const familyOf = (market: MarketLike): 'goals' | 'corners' | 'cards' => {
  const name = norm(market.name);
  const type = norm(market.marketType);
  if (/corner|korners?|kënd/.test(name) || type === 'corners') return 'corners';
  if (/\bcards?\b|booking|yellow|red card/.test(name) || type === 'cards') return 'cards';
  return 'goals';
};

/** A period-specific market must never use full-time aggregate stats from an
 * already-started second half. First-half counts are valid during 1H only.
 */
const observedCounter = (m: MatchLike, market: MarketLike): Score | null => {
  if (!isLive(m)) return null;
  if (isSecondHalf(market)) return null; // no separate 2H score/corners/cards
  if (isFirstHalf(market) && isSecondHalfOrLater(m)) return null;
  return counter(m, familyOf(market));
};

const fullTimeCounter = (m: MatchLike, family: 'goals' | 'corners' | 'cards'): Score | null =>
  isLive(m) ? counter(m, family) : null;

const isStandaloneBtts = (market: MarketLike): boolean => {
  const n = norm(market.name);
  // Mixed result/BTTS and half-by-half contracts remain independent.
  if (/&|\+|and (?:total|result|score)|either half|each half|both halves/.test(n)) return false;
  return /^(?:both teams to score|btts|both teams score|both score)(?:\s*[-(].*)?$/.test(n) ||
    /^(?:1st|first|2nd|second) half[.: -]+(?:both teams to score|btts)$/.test(n);
};

const totalLine = (market: MarketLike): number | null => {
  for (const candidate of [market.line, market.specifier]) {
    const value = number(candidate);
    if (value !== null) return value;
  }
  // The provider sometimes carries "2.5" in the name, with no line field.
  const n = norm(market.name);
  const last = n.match(/(?:^|[\s(])(\d+(?:[.,]\d+)?)\)?$/);
  return last ? number(last[1]) : null;
};

const isSimpleTotal = (market: MarketLike): boolean => {
  const name = norm(market.name);
  if (/bet builder|both teams|btts|correct|exact|result|winner|1x2|odd.?even|handicap|asian|next|last|race|score in|goal in|time of|&|\+|\b(?:first|1st)\s+(?:goal|corner|card|scorer)\b/.test(name)) return false;
  const o = market.outcomes ?? [];
  const hasOverUnder = o.some(item =>
    /^(?:over|under|o|u)(?:\b|$)/i.test(String(item.code ?? item.name ?? '').trim()));
  const type = norm(market.marketType);
  return hasOverUnder && (
    /\b(?:total|goals?|corners?|cards?|over\s*\/?\s*under|under\s*\/?\s*over|goal line)\b/.test(name) ||
    ['over_under', 'totals', 'corners', 'cards'].includes(type)
  );
};

const teamSide = (name: string): 'home' | 'away' | null => {
  const n = norm(name);
  const home = /\b(?:home(?: team)?|team 1|1st team)\b/.test(n);
  const away = /\b(?:away(?: team)?|team 2|2nd team)\b/.test(n);
  return home !== away ? (home ? 'home' : 'away') : null;
};

const observedTotal = (m: MatchLike, market: MarketLike): number | null => {
  const counts = observedCounter(m, market);
  if (!counts) return null;
  const side = teamSide(String(market.name ?? ''));
  return side ? counts[side] : counts.home + counts.away;
};

/** Examples: "Race to 3 Goals" and "First Corner". Do not infer from a
 * whole-match total for a second-half first-event contract.
 */
const completedEvent = (m: MatchLike, market: MarketLike): boolean => {
  const name = norm(market.name);
  if (isSecondHalf(market)) return false;
  const first = /\b(?:first|1st)\s+(?:team\s+to\s+score|goal|corner|card|booking|goalscorer|scorer)\b/.test(name) ||
    /\b(?:time of|minute of)\s+(?:the\s+)?first\s+goal\b/.test(name) ||
    /\b(?:first|1st)\s+(?:goal|corner|card)\s+(?:time|minute)\b/.test(name);
  const ordinal = name.match(/\b(?:2nd|second|3rd|third|4th|fourth|5th|fifth)\s+(goal|corner|card)\b/);
  const race = name.match(/\brace\s+to\s+(\d+)\s+(goals?|corners?|cards?)\b/);
  if (!first && !ordinal && !race) return false;
  const counts = observedCounter(m, market);
  if (!counts) return false;
  const total = counts.home + counts.away;
  if (first) return total >= 1;
  if (race) return Math.max(counts.home, counts.away) >= Number(race[1]);
  const required = ordinal ? ({ '2nd': 2, second: 2, '3rd': 3, third: 3, '4th': 4, fourth: 4, '5th': 5, fifth: 5 } as Record<string, number>)[ordinal[0].split(/\s+/)[0]] : null;
  return required !== null && total >= required;
};

/** "Goal before 20 minutes" expires after that clock window. */
const elapsedWindow = (m: MatchLike, market: MarketLike): boolean => {
  if (isSecondHalf(market)) return false;
  const name = norm(market.name);
  if (!/\b(?:goal|score|corner|card)\b/.test(name)) return false;
  const limit = name.match(/\b(?:before|within|by)\s+(\d{1,3})\s*(?:min(?:ute)?s?)\b/);
  const minute = number(m.currentMinute);
  return !!limit && minute !== null && minute > Number(limit[1]);
};

/**
 * The synthetic offer has no direct goal line: read its verified leg labels.
 * Once any leg has irreversibly completed (e.g. Total 2.5 at three goals,
 * BTTS after both teams score), the whole builder offer closes.
 */
const builderCompleted = (m: MatchLike, market: MarketLike): boolean => {
  if (!isLive(m) || !/^bet builder:/i.test(String(market.name ?? ''))) return false;
  const legs = market.outcomes ?? [];
  if (legs.length !== 1 || !String(legs[0].id ?? '').startsWith('BB|')) return false;
  const score = scoreOf(m.homeScore, m.awayScore);
  if (!score) return false;
  const parts = String(legs[0].name ?? '').split(/\s+\+\s+/);
  return parts.some(part => {
    const total = part.match(/^TOTAL\s+(?:Over|Under)\s+(\d+(?:[.,]\d+)?)$/i);
    if (total) {
      const line = number(total[1]);
      return line !== null && score.home + score.away > line;
    }
    return /^BTTS\s+(?:Yes|No)$/i.test(part) && score.home > 0 && score.away > 0;
  });
};

export function isMarketExpired(m: MatchLike, market: MarketLike): boolean {
  if (!market) return false;
  if (isMatchFinished(m)) return true;
  if (!isLive(m)) return false;
  if (builderCompleted(m, market)) return true;
  if ((isFirstHalf(market) || isHTFTMarket(String(market.name ?? ''))) && isSecondHalfOrLater(m)) return true;

  if (completedEvent(m, market) || elapsedWindow(m, market)) return true;

  if (isStandaloneBtts(market)) {
    const counts = observedCounter(m, market);
    return !!counts && counts.home >= 1 && counts.away >= 1;
  }
  const name = norm(market.name);
  // Outcome "Yes/No" on a standalone team's scoring-one-goal market is
  // already settled as soon as that side scores.
  if (/^(?:(?:home(?: team)?|away(?: team)?|team [12])\s+(?:to score|scores?(?: a goal)?)|(?:to score|scores?)\s+(?:home|away)(?: team)?)$/.test(name)) {
    const counts = observedCounter(m, market);
    const side = teamSide(name);
    if (counts && side && counts[side] > 0) return true;
  }

  if (isSimpleTotal(market)) {
    const line = totalLine(market);
    const value = observedTotal(m, market);
    // Strict '>' handles quarter/whole lines safely: at exactly 2.0,
    // another event can still change push into win, so keep the market.
    if (line !== null && value !== null && value > line) return true;
  }
  return false;
}

export const isOutcomeAvailable = (o: OutcomeLike): boolean =>
  !!o && typeof o.odds === 'number' && Number.isFinite(o.odds) && o.odds > 0 &&
  o.suspended !== true && o.feedSuspended !== true &&
  !['SUSPENDED', 'SETTLED', 'VOID'].includes(String(o.status ?? '').toUpperCase());

export const isMarketSuspended = (
  market: MarketLike,
  lockedMarkets?: Record<string, boolean>,
  lockedOutcomes?: Record<string, boolean>,
  riskLockedOutcomes?: Record<string, boolean>,
): boolean =>
  !!market && (market.suspended === true ||
    String(market.status ?? '').toUpperCase() === 'SUSPENDED' ||
    lockedMarkets?.[String((market as MarketLike & { id?: string }).id ?? '')] === true ||
    (market.builderLegs ?? []).some(part =>
      lockedMarkets?.[part.marketId] === true ||
      lockedOutcomes?.[part.outcomeId] === true ||
      riskLockedOutcomes?.[part.outcomeId] === true));

const exactScore = (label: string): Score | null => {
  const match = label.trim().match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
};

/** Remove only individually impossible outcomes of exact-score / exact-total
 * markets. The *market* stays while some outcomes remain possible.
 */
export function filterDecidedOutcomes<T extends OutcomeLike>(
  outcomes: T[] = [], market: MarketLike = {}, match: MatchLike = {},
): T[] {
  if (!outcomes.length) return outcomes;
  if (isMarketExpired(match, market)) return [];
  if (!isLive(match)) return outcomes;

  const name = norm(market.name);
  const counts = observedCounter(match, market);
  if (!counts) return outcomes;

  // Some provider markets put multiple goal/corner/card lines inside one
  // market instead of exposing each line in market.line. Prune the outcomes
  // whose explicit "Over 0.5" / "Under 0.5" threshold is already passed.
  if (isSimpleTotal(market) && totalLine(market) === null) {
    const value = observedTotal(match, market);
    if (value === null) return outcomes;
    return outcomes.filter(o => {
      const label = String(o.name ?? o.code ?? '');
      const embedded = label.match(/\b(?:over|under)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*\)?/i);
      const threshold = embedded ? number(embedded[1]) : null;
      return threshold === null || value <= threshold;
    });
  }

  if (/\bcorrect score\b|\bexact score\b|\bscore exact\b/.test(name)) {
    return outcomes.filter(o => {
      const target = exactScore(String(o.name ?? o.code ?? ''));
      return !target || (counts.home <= target.home && counts.away <= target.away);
    });
  }
  if (/\b(?:exact(?:ly)?\s+(?:total\s+)?(?:number of )?(?:goals|corners|cards)|number of (?:goals|corners|cards))\b/.test(name)) {
    const total = counts.home + counts.away;
    return outcomes.filter(o => {
      const target = number(String(o.code ?? o.name ?? ''));
      return target === null || total <= target;
    });
  }
  // For complex or provider-specific markets, lack of a proven outcome
  // contract means we keep them rather than hide valid bets by guesswork.
  return outcomes;
}

export function isMarketVisible(
  match: MatchLike, market: MarketLike,
  lockedMarkets?: Record<string, boolean>,
  lockedOutcomes?: Record<string, boolean>,
  riskLockedOutcomes?: Record<string, boolean>,
): boolean {
  if (!market || !market.outcomes?.length) return false;
  if (isMarketExpired(match, market) ||
      isMarketSuspended(market, lockedMarkets, lockedOutcomes, riskLockedOutcomes)) return false;
  return filterDecidedOutcomes(market.outcomes.filter(isOutcomeAvailable), market, match).length > 0;
}
