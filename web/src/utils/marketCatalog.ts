import type { Market } from '../types';

/**
 * Display-only registry. Provider names/codes are never rewritten in the odds
 * store, tickets or settlement. Translate only entries reviewed as whole
 * markets; unknown/provider-specific markets keep their original English name.
 */
export type MarketCategory = 'main' | 'goals' | 'mixed' | 'corners' | 'cards' | 'htft' | 'handicap' | 'players' | 'other';
export type MarketLanguage = 'al' | 'en' | 'de' | 'fr';

const VERIFIED_AL: Record<string, string> = {
  'full time result': 'Rezultati i ndeshjes (1X2)',
  'match result': 'Rezultati i ndeshjes (1X2)',
  '1x2': 'Rezultati i ndeshjes (1X2)',
  'half time result': 'Rezultati i pjesës së parë (1X2)',
  '1st half result': 'Rezultati i pjesës së parë (1X2)',
  '1st half. result': 'Rezultati i pjesës së parë (1X2)',
  '2nd half result': 'Rezultati i pjesës së dytë (1X2)',
  '2nd half. result': 'Rezultati i pjesës së dytë (1X2)',
  'half time / full time': 'Pjesa e parë / Ndeshja',
  'halftime/fulltime': 'Pjesa e parë / Ndeshja',
  'double chance': 'Shansi i dyfishtë (1X / 12 / X2)',
  'draw no bet': 'Fituesi, pa barazim',
  'both teams to score': 'Të dyja ekipet shënojnë (GG/NG)',
  'total': 'Totali i golave (Mbi/Nën)',
  'total goals': 'Totali i golave (Mbi/Nën)',
  'over/under': 'Mbi / Nën',
  'correct score': 'Rezultati i saktë',
  'asian handicap': 'Handikap aziatik',
  'handicap': 'Handikap',
  'result and total': 'Rezultati & Totali i golave',
  'total and both teams to score': 'Totali i golave & GG/NG',
  'result and both teams to score': 'Rezultati & GG/NG',
  'corners. result': 'Kornet: Rezultati (1X2)',
  'corners. double chance': 'Kornet: Shansi i dyfishtë (1X / 12 / X2)',
  'corners. total': 'Kornet: Totali (Mbi/Nën)',
  'total corners': 'Kornet: Totali (Mbi/Nën)',
  'corners. odd/even': 'Kornet: Tek / Çift',
  'corners. handicap': 'Kornet: Handikap',
  'asian corners': 'Kornet: Handikap aziatik',
  'yellow cards. result': 'Kartonët e verdhë: Rezultati (1X2)',
  'yellow cards. total': 'Kartonët e verdhë: Totali (Mbi/Nën)',
  'yellow cards. double chance': 'Kartonët e verdhë: Shansi i dyfishtë',
  'yellow cards': 'Kartonët e verdhë',
  'red cards': 'Kartonët e kuq',
  'total cards': 'Kartonët: Totali (Mbi/Nën)',
  'cards. total': 'Kartonët: Totali (Mbi/Nën)',
  'cards. result': 'Kartonët: Rezultati (1X2)',
  'cards. double chance': 'Kartonët: Shansi i dyfishtë',
};

const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Strip only a line whose number is explicit, or a decimal total embedded in the name. */
export function marketBaseName(market: Market): string {
  const raw = String(market.name ?? '').trim() || 'Unverified market';
  const providedLine = String(market.line ?? '').trim().replace(',', '.');
  const suffix = raw.match(/\s+(-?\d+(?:[.,]\d+)?)$/);
  if (!suffix) return raw;
  const embedded = suffix[1].replace(',', '.');
  if (providedLine && providedLine === embedded) return raw.slice(0, suffix.index).trim();
  if (!providedLine && /[.,]\d+$/.test(suffix[1]) && /\b(?:total|over\s*\/?\s*under|goals?|corners?|cards?|handicap)\b/i.test(raw)) {
    return raw.slice(0, suffix.index).trim();
  }
  return raw;
}

export function marketLineValue(market: Market): string {
  const provided = String(market.line ?? '').trim();
  if (provided && !/^#\d+$/.test(provided)) return provided;
  const raw = String(market.name ?? '');
  if (marketBaseName(market) !== raw.trim()) return raw.match(/\s+(-?\d+(?:[.,]\d+)?)$/)?.[1] ?? '';
  return '';
}

export function marketGroupKey(market: Market): string {
  return [String(market.marketType ?? '').toUpperCase(), String(market.period ?? 0), normalized(marketBaseName(market))].join('::');
}

export function marketCategoryOf(market: Market): MarketCategory {
  const name = normalized(String(market.name ?? ''));
  const type = String(market.marketType ?? '').toUpperCase();
  if (/^unverified market\b|^(?:market|unknown|cols-?\d+|total-2|fora-2)$/.test(name)) return 'other';
  // First classify by subject. "Corners. Result" is NOT the result of the football match.
  if (type === 'CORNERS' || /\bcorners?\b|\bcorner kicks?\b|\bkornet\b/.test(name)) return 'corners';
  if (type === 'CARDS' || /\bcards?\b|\bbookings?\b|yellow|\bred card\b/.test(name)) return 'cards';
  if (/\bplayers?\b|goalscorer|scorer|to be booked|player shots?/.test(name)) return 'players';
  if (/\bhandicap\b|\basian\b|\bfora\b/.test(name)) return 'handicap';
  if (/\b(?:result|winner|1x2)\b.*\b(?:total|goals|btts|both teams)\b|\b(?:total|goals|btts)\b.*\b(?:both teams|btts)\b/i.test(name)) return 'mixed';
  if (/halftime\s*\/?\s*fulltime|half\s*time\s*\/\s*full\s*time|ht\s*\/\s*ft|\b(?:1st|2nd|first|second)\s+half\b|\bperiod\b/.test(name) || market.period === 1 || market.period === 2) return 'htft';
  if (/\b(?:1x2|match result|full time result|winner|double chance|draw no bet|moneyline|qualify)\b/.test(name) || type === '1X2') return 'main';
  if (type === 'OVER_UNDER' || /\bgoals?\b|\btotal\b|over\s*\/?\s*under|both teams|btts|correct score|odd\s*\/\s*even/.test(name)) return 'goals';
  return 'other';
}

export function marketDisplayTitle(market: Market, lang: MarketLanguage, withLine = false): string {
  const base = marketBaseName(market);
  const display = lang === 'al' ? VERIFIED_AL[normalized(base)] ?? base : base;
  // The period is already explicit in some provider labels. Do not add an invented period.
  const rawHasPeriod = /\b(?:1st|2nd|first|second)\s+half\b|half\s*time|halftime|\bperiod\b/i.test(base);
  const period = !rawHasPeriod && (market.period === 1 || market.period === 2)
    ? (lang === 'al' ? (market.period === 1 ? 'Pjesa e parë · ' : 'Pjesa e dytë · ') : (market.period === 1 ? '1st Half · ' : '2nd Half · '))
    : '';
  const line = withLine ? marketLineValue(market) : '';
  return period + display + (line ? ' (' + line + ')' : '');
}

/** Intentionally narrow: only uncomplicated provider selections are translated. */
export function marketSelectionLabel(raw: string, lang: MarketLanguage): string {
  const value = String(raw ?? '').trim();
  if (lang !== 'al') return value;
  const simple: Record<string, string> = {
    over: 'Mbi', under: 'Nën', yes: 'Po', no: 'Jo',
    odd: 'Tek', even: 'Çift', draw: 'Barazim',
    home: '1', away: '2',
  };
  const exact = simple[value.toLowerCase()];
  if (exact) return exact;
  const withLine = value.match(/^(over|under)\s+(-?\d+(?:[.,]\d+)?)$/i);
  if (withLine) return (withLine[1].toLowerCase() === 'over' ? 'Mbi ' : 'Nën ') + withLine[2];
  return value;
}
