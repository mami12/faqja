import type { Market } from '../types';

/**
 * Provider market names and outcome labels are presentation source of truth.
 * This file only decides grouping / visibility. Never translate, rename or
 * change market IDs, lines, prices, selections or saved ticket contents.
 */
export type MarketCategory = 'main' | 'goals' | 'mixed' | 'corners' | 'cards' | 'htft' | 'players' | 'other';
export type MarketLanguage = 'al' | 'en' | 'de' | 'fr';

const normalized = (value: unknown): string =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** All handicap variants are excluded from the current sportsbook offer.
 * "Asian Total" is not necessarily a handicap, so do not discard it simply
 * because its name includes "Asian".
 */
export function isHandicapMarket(market: Pick<Market, 'name' | 'marketType'>): boolean {
  const name = normalized(market.name);
  const type = normalized(market.marketType);
  return type === 'handicap'
    || /\b(handicap|handicaps|fora|spread|spreads)\b/i.test(name)
    || /^asian (?:corners?|cards?)\b/.test(name)
    || /^(?:corners?|cards?)\.\s*asian\b/.test(name);
}

/** Hide unnamed/generated placeholders, not real short provider names.
 * "Total", "Result", "Corners", "Cards", etc. ARE original provider names.
 */
export function isIdentifiedMarket(market: Market): boolean {
  const name = String(market.name ?? '').trim();
  if (!name) return false;
  return !/^(?:market|unknown|unverified market(?:\b.*)?|cols-?\d+|total-2|fora-2|match market)$/i.test(name);
}

export function marketBaseName(market: Market): string {
  const raw = String(market.name ?? '').trim();
  const explicit = String(market.line ?? '').trim().replace(',', '.');
  const suffix = raw.match(/\s+(-?\d+(?:[.,]\d+)?)$/);
  if (!suffix) return raw;
  const embedded = suffix[1].replace(',', '.');
  if (explicit && explicit === embedded) return raw.slice(0, suffix.index ?? raw.length).trim();
  if (!explicit && /[.,]\d+$/.test(suffix[1]) &&
      /\b(?:total|over\s*\/?\s*under|goals?|corners?|cards?|handicap)\b/i.test(raw)) {
    return raw.slice(0, suffix.index ?? raw.length).trim();
  }
  return raw;
}

export function marketLineValue(market: Market): string {
  const given = String(market.line ?? '').trim();
  if (given && !/^#\d+$/.test(given)) return given;
  const raw = String(market.name ?? '').trim();
  if (marketBaseName(market) !== raw) {
    return raw.match(/\s+(-?\d+(?:[.,]\d+)?)$/)?.[1] ?? '';
  }
  return '';
}

/** Never join unrelated line-less markets; merge only real numeric lines
 * in the same provider family and period.
 */
export function marketGroupKey(market: Market): string {
  const identity = String(market.extId ?? '').trim() || normalized(marketBaseName(market));
  const family = [normalized(market.marketType), market.period ?? 0, identity, normalized(marketBaseName(market))].join('::');
  return marketLineValue(market) ? family : family + '::' + String(market.id);
}

/** Subjects come before bet types: "Corners. Result" belongs to Corners,
 * not Main/Result. Period labels are a secondary distinction.
 */
export function marketCategoryOf(market: Market): MarketCategory {
  const name = normalized(market.name);
  const type = normalized(market.marketType);
  if (type === 'corners' || /\bcorners?\b|\bcorner kicks?\b/.test(name)) return 'corners';
  if (type === 'cards' || /\bcards?\b|\bbookings?\b|yellow card|red card|disciplin/.test(name)) return 'cards';
  if (/\bplayers?\b|goalscorer|scorer|to be booked|player shots?/.test(name)) return 'players';
  if (/\b(?:result|winner|1x2)\b.*\b(?:total|goals|btts|both teams)\b|\b(?:total|goals|btts)\b.*\b(?:both teams|btts)\b/.test(name)) return 'mixed';
  if (/halftime\s*\/?\s*fulltime|half\s*time\s*\/\s*full\s*time|ht\s*\/\s*ft|\b(?:1st|2nd|first|second)\s+half\b|\bperiod\b/.test(name) ||
      Number(market.period ?? 0) === 1 || Number(market.period ?? 0) === 2) return 'htft';
  if (/\b(?:1x2|match result|full time result|winner|double chance|draw no bet|moneyline|qualify|result)\b/.test(name) || type === '1x2') return 'main';
  if (type === 'over_under' || /\bgoals?\b|\btotal\b|over\s*\/?\s*under|both teams|btts|correct score|odd\s*\/\s*even/.test(name)) return 'goals';
  return 'other';
}

/** The heading is exactly the provider's original name. A separately
 * supplied line is appended, but never substituted into the provider name.
 * Group headings drop only a repeated numerical line to share one heading.
 */
export function marketDisplayTitle(market: Market, _lang: MarketLanguage, withLine = false): string {
  const raw = String(market.name ?? '').trim();
  if (!withLine) return marketBaseName(market);
  const line = marketLineValue(market);
  const suffix = raw.match(/(?:^|[\s(])(-?\d+(?:[.,]\d+)?)\)?$/);
  if (!line || (suffix && suffix[1].replace(',', '.') === line.replace(',', '.'))) return raw;
  return raw + ' (' + line + ')';
}

/** The provider's original outcome text, with no local translation. */
export function marketSelectionLabel(raw: string, _lang: MarketLanguage): string {
  return String(raw ?? '').trim();
}

const EN_CATEGORY_LABELS: Record<MarketCategory, string> = {
  main: 'Main', goals: 'Goals', mixed: 'Combos', corners: 'Corners',
  cards: 'Cards', htft: 'Halves / Periods', players: 'Players', other: 'Other',
};
const AL_CATEGORY_LABELS: Record<MarketCategory, string> = {
  main: 'Kryesore', goals: 'Golat', mixed: 'Të kombinuara', corners: 'Kornet',
  cards: 'Kartonët', htft: 'Pjesët / Periudhat', players: 'Lojtarët', other: 'Të tjera',
};
export function marketCategoryLabel(category: MarketCategory, lang: MarketLanguage): string {
  return (lang === 'al' ? AL_CATEGORY_LABELS : EN_CATEGORY_LABELS)[category];
}
