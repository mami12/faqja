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
    <div className="border-t border-tertiary/60 bg-primary/30 px-4 py-3 space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-secondary">
        {match.status === 'LIVE' && (
          <span className="font-bold text-accent-red">
            {match.currentMinute || 0}:{String(match.currentSecond ?? 0).padStart(2, '0')}'{match.period ? ` · ${match.period}` : ''}
          </span>
        )}
        {match.corners && (
          <span>
            {t('markets.corners')}:{' '}
            <span className="font-semibold text-text-primary">
              {match.corners.home} - {match.corners.away}
            </span>
          </span>
        )}
        {match.cards && (
          <span>
            {t('markets.cards')}:{' '}
            <span className="font-semibold text-text-primary">
              {match.cards.home} - {match.cards.away}
            </span>
          </span>
        )}
        <span className="ml-auto">
          {totalMarkets} {t('markets.market')}
        </span>
      </div>

      {COLUMN_ORDER.filter(column => grouped.has(column)).map(column => (
        <section key={column} className="space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-accent-green/90">
            {t(COLUMN_TITLE[column])}
          </div>
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
            {(grouped.get(column) ?? []).map(market => (
              <div key={market.id} className="bg-secondary rounded-lg border border-tertiary overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-text-secondary flex items-center justify-between gap-2">
                  <span className="truncate">
                    {marketLabel(t, market.name) || t('markets.market')}
                    {market.line ? ` ${market.line}` : ''}
                  </span>
                  {market.status === 'SUSPENDED' && <span className="text-accent-red">🔒</span>}
                </div>
                <div className={`p-2 grid gap-1.5 ${(market.outcomes?.length ?? 0) > 2 ? 'grid-cols-3' : 'grid-cols-2'} sm:gap-1.5`}>
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
