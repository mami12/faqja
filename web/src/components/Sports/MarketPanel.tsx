import { useMemo } from 'react';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import { useLanguage } from '../../context/LanguageContext';
import { useLiveFeed } from '../../api/liveFeed';
import {
  isMarketVisible,
  isOutcomeAvailable,
  filterDecidedOutcomes,
} from '../../utils/marketExpiry';

const COLUMN_ORDER = ['result', 'total', 'corners', 'cards', 'other'] as const;
type Column = (typeof COLUMN_ORDER)[number];

const COLUMN_TITLE: Record<Column, string> = {
  result: 'markets.result',
  total: 'markets.totals',
  corners: 'markets.corners',
  cards: 'markets.cards',
  other: 'markets.other',
};

/* ------------------------------------------------------------------ */
/* Zbulimi i kolonës                                                   */
/* ------------------------------------------------------------------ */

export function columnOf(market: Market): Column {
  const type = String(market.marketType ?? '').toUpperCase();
  if (type === '1X2') return 'result';
  if (type === 'OVER_UNDER') return 'total';
  if (type === 'CORNERS') return 'corners';
  if (type === 'CARDS') return 'cards';

  const s = `${market.name ?? ''} ${(market as any).extId ?? ''}`.toLowerCase();
  if (/corner/.test(s)) return 'corners';
  if (/\bcards?\b|booking|yellow|\bred\b/.test(s)) return 'cards';
  if (/1x2|full time result|match result|winner|double chance/.test(s)) return 'result';
  if (/handicap|fora|asian/.test(s)) return 'other';
  if (/total|over\/?under|\bgoals?\b/.test(s)) return 'total';
  return 'other';
}

/* ------------------------------------------------------------------ */
/* Pastrimi i emrave                                                   */
/* ------------------------------------------------------------------ */

const cleanMarketName = (name?: string) => {
  if (!name) return '';
  const s = String(name).trim();
  if (/^cols-?\d+$/i.test(s)) return 'Match Market';
  if (/^total-2$/i.test(s)) return 'Total Goals';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
};

const marketLabel = (t: (key: string) => string, name?: string) => {
  if (!name) return '';
  const clean = cleanMarketName(name);
  const key = `markets.${clean}`;
  const translated = t(key);
  return translated === key ? clean : translated;
};

/** Formaton linjën: "(2.5)" ose bosh */
const formatLine = (line?: string) => {
  if (!line) return '';
  const s = String(line).trim();
  if (!s || /^#\d+$/.test(s)) return '';
  return s;
};

/* ------------------------------------------------------------------ */
/* Grupimi i market-eve sipas bazë-emrit                               */
/* ------------------------------------------------------------------ */

/** Emri bazë pa linjë: "Total Goals" për "Total 2.5", "Total 3.5", etj. */
const baseMarketName = (market: Market): string => {
  const raw = String(market.name ?? '').trim();
  // Hiq linjën nëse është brenda emrit (p.sh. "Total 2.5" → "Total")
  const stripped = raw.replace(/\s+\d+(?:[.,]\d+)?$/, '').trim();
  return cleanMarketName(stripped) || cleanMarketName(raw);
};

/** Çelësi i grupit: bazë + marketType. */
const groupKeyOf = (market: Market): string => {
  const base = baseMarketName(market);
  const type = String(market.marketType ?? '').toUpperCase();
  const period = Number(market.period ?? 0);
  return `${type}::${period}::${base}`;
};

interface MarketGroup {
  base: string;
  markets: Market[];
}

/** Grupon market-et e një liste sipas bazë-emrit, duke ruajtur rendin. */
const groupByBaseName = (markets: Market[]): MarketGroup[] => {
  const groups = new Map<string, MarketGroup>();
  for (const mk of markets) {
    const key = groupKeyOf(mk);
    const existing = groups.get(key);
    if (existing) {
      existing.markets.push(mk);
    } else {
      groups.set(key, { base: baseMarketName(mk), markets: [mk] });
    }
  }
  // Rendit market-et brenda grupit sipas linjës (2.5, 3.5, 4.5...)
  for (const g of groups.values()) {
    g.markets.sort((a, b) => {
      const la = parseFloat(String(a.line ?? '0')) || 0;
      const lb = parseFloat(String(b.line ?? '0')) || 0;
      return la - lb;
    });
  }
  return Array.from(groups.values());
};

/* ------------------------------------------------------------------ */
/* Dedupe i outcomes                                                   */
/* ------------------------------------------------------------------ */

const dedupeOutcomes = (outcomes: any[] = [], marketName: string = '') => {
  const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s*:\s*/g, ':');
  const mName = norm(marketName);
  const is1X2 = /1x2|full time result|match result|winner/i.test(mName) && !/half|score|rezultat|both|corner|card|handicap|chance/i.test(mName);
  const isBTTS = /both teams? to score|both score/i.test(mName) && !/half|halves|result/i.test(mName);

  const seen = new Set<string>();
  const res: any[] = [];
  for (const o of outcomes) {
    const k = norm(o.name || o.key || '');
    if (is1X2 && !['1', 'x', '2', 'home', 'draw', 'away'].includes(k)) continue;
    if (isBTTS && !['yes', 'no', 'gg', 'ng'].includes(k)) continue;
    if (!seen.has(k)) {
      seen.add(k);
      res.push(o);
    }
  }
  return res;
};

/* ------------------------------------------------------------------ */
/* MarketPanel                                                         */
/* ------------------------------------------------------------------ */

export default function MarketPanel({ match }: { match: Match }) {
  const { t } = useLanguage();
  const { lockedMarkets } = useLiveFeed();

  const grouped = useMemo(() => {
    const groups = new Map<Column, Market[]>();
    for (const market of match.markets ?? []) {
      if (!isMarketVisible(match, market, lockedMarkets)) continue;
      const available = (market.outcomes ?? []).filter(isOutcomeAvailable);
      if (!filterDecidedOutcomes(available, market, match).length) continue;
      const column = columnOf(market);
      const list = groups.get(column) ?? [];
      list.push(market);
      groups.set(column, list);
    }
    for (const list of groups.values()) {
      list.sort(
        (a, b) =>
          Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
          String(a.name).localeCompare(String(b.name)) ||
          String(a.line ?? '').localeCompare(String(b.line ?? '')),
      );
    }
    return groups;
  }, [match, lockedMarkets]);

  const totalMarkets = Array.from(grouped.values()).reduce((count, markets) => count + markets.length, 0);

  if (!grouped.size) {
    return (
      <div className="border-t border-tertiary/60 px-4 py-3 text-xs text-text-secondary">
        {t('common.no_results')}
      </div>
    );
  }

  return (
    <div className="border-t border-tertiary/70 bg-primary/50 px-3.5 sm:px-5 py-4 space-y-5">
      {/* Strip statistikash live */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary bg-secondary/80 p-2.5 rounded-xl border border-tertiary/60">
        {match.status === 'LIVE' && (
          <span className="font-bold text-accent-red flex items-center gap-1.5 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-ping"></span>
            {match.currentMinute || 0}:{String((match as any).currentSecond ?? 0).padStart(2, '0')}'{match.period ? ` · ${match.period}` : ''}
          </span>
        )}
        {match.corners && (
          <span className="bg-primary/60 px-2.5 py-0.5 rounded-md border border-tertiary/50">
            {t('markets.corners')}:{' '}
            <span className="font-bold text-white tabular-nums">
              {match.corners.home} - {match.corners.away}
            </span>
          </span>
        )}
        {match.cards && (
          <span className="bg-primary/60 px-2.5 py-0.5 rounded-md border border-tertiary/50">
            {t('markets.cards')}:{' '}
            <span className="font-bold text-white tabular-nums">
              {match.cards.home} - {match.cards.away}
            </span>
          </span>
        )}
        <span className="ml-auto text-[11px] font-bold text-text-secondary">
          {totalMarkets} {t('markets.market')}
        </span>
      </div>

      {COLUMN_ORDER.filter(column => grouped.has(column)).map(column => {
        const marketsInColumn = grouped.get(column) ?? [];
        const marketGroups = groupByBaseName(marketsInColumn);

        return (
          <section key={column} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-accent-green"></span>
              <div className="text-sm font-black uppercase tracking-wider text-white">
                {t(COLUMN_TITLE[column])}
              </div>
              <span className="text-[10px] font-bold text-text-secondary bg-secondary px-2 py-0.5 rounded-full border border-tertiary/60">
                {marketGroups.length}
              </span>
            </div>

            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              {marketGroups.map(group => {
                // Grup me një market të vetëm → kartë normale
                if (group.markets.length === 1) {
                  const market = group.markets[0];
                  const cleanOutcomes = dedupeOutcomes(market.outcomes ?? [], market.name);
                  const liveOutcomes = filterDecidedOutcomes(cleanOutcomes, market, match);
                  if (!liveOutcomes.length) return null;

                  const title = marketLabel(t, market.name) || t('markets.market');
                  const line = formatLine(market.line);

                  return (
                    <div
                      key={market.id}
                      className="bg-secondary/90 rounded-xl border border-tertiary/80 overflow-hidden shadow-sm"
                    >
                      <div className="px-3 py-2 text-[11px] font-bold text-text-secondary bg-primary/40 border-b border-tertiary/50 flex items-center justify-between gap-2">
                        <span className="truncate text-slate-200" title={title}>
                          {title}
                          {line && <span className="text-accent-green ml-1">({line})</span>}
                        </span>
                      </div>
                      <div className={`p-2.5 grid gap-1.5 ${liveOutcomes.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        {liveOutcomes.map(outcome => (
                          <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                        ))}
                      </div>
                    </div>
                  );
                }

                // Grup me disa market-e → një kuti e vetme, linjat njëra poshtë tjetrës
                const baseTitle = marketLabel(t, group.base) || group.base;

                return (
                  <div
                    key={groupKeyOf(group.markets[0])}
                    className="bg-secondary/90 rounded-xl border border-tertiary/80 overflow-hidden shadow-sm md:col-span-2"
                  >
                    <div className="px-3 py-2 text-[11px] font-bold text-text-secondary bg-primary/40 border-b border-tertiary/50 flex items-center justify-between gap-2">
                      <span className="truncate text-slate-200" title={baseTitle}>
                        {baseTitle}
                      </span>
                      <span className="text-[10px] font-bold text-text-secondary/70">
                        {group.markets.length} {t('markets.lines') || 'lines'}
                      </span>
                    </div>

                    <div className="divide-y divide-tertiary/40">
                      {group.markets.map(market => {
                        const cleanOutcomes = dedupeOutcomes(market.outcomes ?? [], market.name);
                        const liveOutcomes = filterDecidedOutcomes(cleanOutcomes, market, match);
                        if (!liveOutcomes.length) return null;

                        const line = formatLine(market.line);

                        return (
                          <div
                            key={market.id}
                            className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2"
                          >
                            {/* Linja (2.5, 3.5, ...) */}
                            {line && (
                              <div className="shrink-0 sm:w-14 flex items-center">
                                <span className="text-xs font-black text-accent-green tabular-nums bg-accent-green/10 px-2 py-0.5 rounded-md border border-accent-green/20">
                                  {line}
                                </span>
                              </div>
                            )}

                            {/* Kuotat */}
                            <div className={`flex-1 grid gap-1.5 ${liveOutcomes.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                              {liveOutcomes.map(outcome => (
                                <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
