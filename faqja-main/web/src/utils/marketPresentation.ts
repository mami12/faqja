import type { Market, Outcome } from '../types';
export type MarketCategory = 'all' | 'popular' | 'goals' | 'corners' | 'cards' | 'other';
export const marketCategories: MarketCategory[] = ['all', 'popular', 'goals', 'corners', 'cards', 'other'];
type Translate = (key: string) => string;
export function cleanMarketName(name = '') {
  const s = name.trim();
  if (/^cols-?\d+$/i.test(s)) return 'Match Market';
  if (/^total-2$/i.test(s)) return 'Total Goals';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
}
export function baseMarketName(m: Market) {
  const name = cleanMarketName(m.name);
  // Strip only a confirmed trailing line, never team/period numbers or 1X2.
  const line = String(m.line ?? '').trim();
  if (!line || !/^[+-]?\d+(?:[.,]\d+)?$/.test(line)) return name;
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp('\\s+\\(?' + escaped + '\\)?$'), '').trim();
}
export function marketGroupKey(m: Market) {
  return `${m.marketType}|${m.period ?? 0}|${baseMarketName(m).toLowerCase()}`;
}
export function categoryOf(m: Market): MarketCategory {
  const n = cleanMarketName(m.name).toLowerCase();
  const type = String(m.marketType).toUpperCase();
  if (/corner|korne|kënd/.test(n) || type === 'CORNERS') return 'corners';
  if (/card|booking|karton/.test(n) || type === 'CARDS') return 'cards';
  if (/goal|both.*scor|btts|total|over\s*\/\s*under|gola|shëno/.test(n) || ['OVER_UNDER', 'BTTS'].includes(type)) return 'goals';
  return 'other';
}
export function matchesCategory(m: Market, category: MarketCategory) {
  if (category === 'all') return true;
  if (category !== 'popular') return categoryOf(m) === category;
  const n = cleanMarketName(m.name);
  if ((m.period ?? 0) !== 0 || /half|pjes|corner|card|korne|karton/.test(n.toLowerCase())) return false;
  return ['1X2', 'BTTS', 'DOUBLE_CHANCE', 'OVER_UNDER'].includes(m.marketType) || /^(1x2|match result|full time result|match winner|double chance|both teams? to score|total goals)(?:\s|$)/i.test(n);
}
export function marketLabel(t: Translate, name = ''): string {
  const clean = cleanMarketName(name);
  const key = `markets.${clean}`;
  const translated = t(key);
  if (translated !== key) return translated;
  const suffix = clean.match(/^(.*?)\s+(\(?[+-]?\d+(?:[.,]\d+)?\)?)$/);
  if (suffix) {
    const base = t(`markets.${suffix[1]}`);
    if (base !== `markets.${suffix[1]}`) return `${base} ${suffix[2]}`;
  }
  return clean; // Unknown provider labels stay intact rather than changing their meaning.
}
export function outcomeLabel(t: Translate, name = '') {
  const clean = name.trim().replace(/^#(\d+)$/, '$1');
  const aliases: Record<string, string> = { home: 'home', away: 'away', draw: 'draw', tie: 'draw', yes: 'yes', no: 'no', gg: 'yes', ng: 'no', over: 'over', under: 'under', odd: 'odd', even: 'even' };
  const key = aliases[clean.toLowerCase()];
  if (key) return t(`outcomes.${key}`);
  const line = clean.match(/^(over|under)\s+(.+)$/i);
  if (line) return `${t(`outcomes.${line[1].toLowerCase()}`)} ${line[2]}`;
  return clean;
}
export function dedupeOutcomes(outcomes: Outcome[] = []) {
  const seen = new Set<string>();
  return outcomes.filter(o => {
    const key = o.name.trim().toLowerCase().replace(/\s*:\s*/g, ':') || o.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
