import { useMemo } from 'react';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Every market of one match, grouped the way the board reads them: result, totals, corners,
 * cards, then the rest. This is what the "+" button on a match card opens - it used to only
 * navigate away, so corners, cards and the live minute were never visible in the list.
 */

const COLUMN_ORDER = ['result', 'total', 'corners', 'cards', 'other'] as const;
type Column = (typeof COLUMN_ORDER)[number];

const COLUMN_TITLE: Record<Column, string> = {
  result: 'markets.result',
  total: 'markets.totals',
  corners: 'markets.corners',
  cards: 'markets.cards',
  other: 'markets.other',
};

/** the feed names markets inconsistently, so fall back to its own type/name signals */
export function columnOf(market: Market): Column {
  const type = String(market.marketType ?? '').toUpperCase();
  if (type === '1X2') return 'result';
  if (type === 'OVER_UNDER') return 'total';
  if (type === 'CORNERS') return 'corners';
  if (type === 'CARDS') return 'cards';

  const s = `${market.name ?? ''} ${(market as any).extId ?? ''}`.toLowerCase();
  if (/corner/.test(s)) return 'corners';
  // word boundaries matter: "scored" must not look like a red card
  if (/\bcards?\b|booking|yellow|\bred\b/.test(s)) return 'cards';
  if (/1x2|full time result|match result|winner|double chance/.test(s)) return 'result';
  if (/handicap|fora|asian/.test(s)) return 'other';
  if (/total|over\/?under|\bgoals?\b/.test(s)) return 'total';
  return 'other';
}

/** feed market names are already readable; translate the ones we know and keep the rest */
const marketLabel = (t: (key: string) => string, name?: string) => {
  if (!name) return '';
  const key = `markets.${name}`;
  const translated = t(key);
  return translated === key ? name : translated;
};

export default function MarketPanel({ match }: { match: Match }) {
  const { t } = useLanguage();

  const grouped = useMemo(() => {
    const groups = new Map<Column, Market[]>();
    for (const market of match.markets ?? []) {
      if (!market.outcomes?.length) continue;
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
  }, [match]);

  const totalMarkets = match.markets?.length ?? 0;

  if (!grouped.size) {
    return (
      <div className="border-t border-tertiary/60 px-4 py-3 text-xs text-text-secondary">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="border-t border-tertiary/70 bg-primary/50 px-3.5 sm:px-5 py-4 space-y-4">
      {/* Live match stats strip */}
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

      {COLUMN_ORDER.filter(column => grouped.has(column)).map(column => (
        <section key={column} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-1 h-3.5 rounded-full bg-accent-green"></span>
            <div className="text-xs font-black uppercase tracking-wider text-white">
              {t(COLUMN_TITLE[column])}
            </div>
          </div>
          <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
            {(grouped.get(column) ?? []).map(market => (
              <div key={market.id} className="bg-secondary/90 rounded-xl border border-tertiary/80 overflow-hidden shadow-sm">
                <div className="px-3 py-2 text-[11px] font-bold text-text-secondary bg-primary/40 border-b border-tertiary/50 flex items-center justify-between gap-2">
                  <span className="truncate text-slate-200" title={marketLabel(t, market.name) || t('markets.market')}>
                    {marketLabel(t, market.name) || t('markets.market')}
                    {market.line ? ` (${market.line})` : ''}
                  </span>
                  {market.status === 'SUSPENDED' && <span className="text-accent-red text-xs">🔒 Locked</span>}
                </div>
                <div className={`p-2.5 grid gap-1.5 ${(market.outcomes?.length ?? 0) > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {(market.outcomes ?? []).map(outcome => (
                    <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
