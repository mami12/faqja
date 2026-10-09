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

const formatLine = (line?: string) => (line && !/^#\d+$/.test(String(line).trim()) ? ` (${line})` : '');

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

export default function MarketPanel({ match }: { match: Match }) {
  const { t } = useLanguage();
  const { lockedMarkets } = useLiveFeed();

  const grouped = useMemo(() => {
    const groups = new Map<Column, Market[]>();
    for (const market of match.markets ?? []) {
      if (!isMarketVisible(match, market, lockedMarkets)) continue;

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
            {(grouped.get(column) ?? []).map(market => {
              const available = (market.outcomes ?? []).filter(isOutcomeAvailable);
              const cleanOutcomes = dedupeOutcomes(available, market.name);
              const liveOutcomes = filterDecidedOutcomes(cleanOutcomes, market, match);
              if (!liveOutcomes.length) return null;
              const title = marketLabel(t, market.name) || t('markets.market');
              return (
                <div key={market.id} className="bg-secondary/90 rounded-xl border border-tertiary/80 overflow-hidden shadow-sm">
                  <div className="px-3 py-2 text-[11px] font-bold text-text-secondary bg-primary/40 border-b border-tertiary/50 flex items-center justify-between gap-2">
                    <span className="truncate text-slate-200" title={title}>
                      {title}
                      {formatLine(market.line)}
                    </span>
                  </div>
                  <div className={`p-2.5 grid gap-1.5 ${liveOutcomes.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {liveOutcomes.map(outcome => (
                      <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}