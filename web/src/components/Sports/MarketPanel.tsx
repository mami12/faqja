import { useMemo, useState } from 'react';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import { useLanguage } from '../../context/LanguageContext';
import { useLiveFeed } from '../../api/liveFeed';
import {
  isMarketVisible,
  isOutcomeAvailable,
  filterDecidedOutcomes,
} from '../../utils/marketExpiry';
import { isHandicapMarket } from '../../utils/sportsbookFilters';
import { translateMarketName } from '../../utils/sportsbookLabels';

/* ------------------------------------------------------------------ */
/* Kategoritë                                                          */
/* ------------------------------------------------------------------ */

type Category = 'main' | 'goals' | 'corners' | 'cards' | 'htft' | 'other';

interface CategoryDef {
  key: Category;
  label: string;
  icon: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'main',    label: 'Kryesore',   icon: '⭐' },
  { key: 'goals',   label: 'Golat',      icon: '⚽' },
  { key: 'corners', label: 'Këndet',     icon: '🚩' },
  { key: 'cards',   label: 'Kartonat',   icon: '🟨' },
  { key: 'htft',    label: 'Pjesa/Ndeshja', icon: '⏱️' },
  { key: 'other',   label: 'Të Tjera',   icon: '📊' },
];

/** Kthen kategorinë e një market-i */
const categoryOf = (market: Market): Category => {
  const name = String(market.name ?? '').toLowerCase();
  const type = String(market.marketType ?? '').toUpperCase();

  if (type === 'CORNERS' || /corner/i.test(name)) return 'corners';
  if (type === 'CARDS' || /\bcards?\b|booking|yellow|\bred\b/i.test(name)) return 'cards';
  if (/halftime\/?fulltime|ht\/?ft|half.?time\s*\/\s*full.?time/i.test(name)) return 'htft';
  if (
    type === '1X2' ||
    /1x2|match result|full time result|winner|double chance|draw no bet|moneyline/i.test(name)
  ) return 'main';
  if (
    type === 'OVER_UNDER' ||
    /total|over\/?under|both teams|btts|next goal|correct score|exact|goals/i.test(name)
  ) return 'goals';
  return 'other';
};

/* ------------------------------------------------------------------ */
/* Ndihmës                                                            */
/* ------------------------------------------------------------------ */

const cleanMarketName = (name?: string) => {
  if (!name) return '';
  const s = String(name).trim();
  if (/^cols-?\d+$/i.test(s)) return 'Match Market';
  if (/^total-2$/i.test(s)) return 'Total Goals';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
};

const formatLine = (line?: string) => {
  if (!line) return '';
  const s = String(line).trim();
  if (!s || /^#\d+$/.test(s)) return '';
  return s;
};

const baseMarketName = (market: Market): string => {
  const raw = String(market.name ?? '').trim();
  const stripped = raw.replace(/\s+\d+(?:[.,]\d+)?$/, '').trim();
  return cleanMarketName(stripped) || cleanMarketName(raw);
};

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
  for (const g of groups.values()) {
    g.markets.sort((a, b) => {
      const la = parseFloat(String(a.line ?? '0')) || 0;
      const lb = parseFloat(String(b.line ?? '0')) || 0;
      return la - lb;
    });
  }
  return Array.from(groups.values());
};

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
/* MarketCard — karta e një market-i                                   */
/* ------------------------------------------------------------------ */

interface MarketCardProps {
  market: Market;
  match: Match;
  title: string;
}

function MarketCard({ market, match, title }: MarketCardProps) {
  const cleanOutcomes = dedupeOutcomes(market.outcomes ?? [], market.name);
  const liveOutcomes = filterDecidedOutcomes(cleanOutcomes, market, match);
  if (!liveOutcomes.length) return null;

  const line = formatLine(market.line);
  const isSuspended = market.status === 'SUSPENDED';
  const cols = liveOutcomes.length > 3 ? 3 : liveOutcomes.length;

  return (
    <div className="bg-secondary/90 rounded-md border border-tertiary/80 overflow-hidden">
      {/* Emri i market-it — më kompakt në mobile */}
      <div className="px-2 py-1 sm:px-3 sm:py-2 bg-primary/70 border-b border-tertiary/50 flex items-center justify-between gap-2">
        <span className="text-[11px] sm:text-xs font-bold text-slate-200 break-words min-w-0" title={title}>
          {title}
          {line && <span className="text-accent-green ml-1">({line})</span>}
        </span>
        {isSuspended && (
          <span className="shrink-0 text-[10px] font-bold text-accent-red">🔒</span>
        )}
      </div>

      {/* Outcomes horizontalisht — më kompakt në mobile */}
      <div
        className="p-2 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {liveOutcomes.map(outcome => (
          <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GroupCard — karta e një grupi me disa linja                         */
/* ------------------------------------------------------------------ */

interface GroupCardProps {
  group: MarketGroup;
  match: Match;
  title: string;
}

function GroupCard({ group, match, title }: GroupCardProps) {
  return (
    <div className="bg-secondary/90 rounded-md border border-tertiary/80 overflow-hidden md:col-span-2">
      <div className="px-2 py-1 sm:px-3 sm:py-2 bg-primary/70 border-b border-tertiary/50 flex items-center justify-between gap-2">
        <span className="text-[11px] sm:text-xs font-bold text-slate-200 break-words min-w-0" title={title}>
          {title}
        </span>
        <span className="text-[9px] sm:text-[10px] font-bold text-text-secondary/70">
          {group.markets.length} linja
        </span>
      </div>

      <div className="divide-y divide-tertiary/40">
        {group.markets.map(market => {
          const cleanOutcomes = dedupeOutcomes(market.outcomes ?? [], market.name);
          const liveOutcomes = filterDecidedOutcomes(cleanOutcomes, market, match);
          if (!liveOutcomes.length) return null;

          const line = formatLine(market.line);
          const cols = liveOutcomes.length > 3 ? 3 : liveOutcomes.length;

          return (
            <div
              key={market.id}
              className="px-1.5 py-1 sm:px-3 sm:py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2"
            >
              {line && (
                <div className="shrink-0 sm:w-14 flex items-center">
                  <span className="text-[10px] sm:text-xs font-black text-accent-green tabular-nums bg-accent-green/10 px-1.5 py-0.5 rounded sm:px-2 rounded-md border border-accent-green/20">
                    {line}
                  </span>
                </div>
              )}
              <div
                className="min-w-0 flex-1 grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
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
}

/* ------------------------------------------------------------------ */
/* MarketPanel                                                         */
/* ------------------------------------------------------------------ */

export default function MarketPanel({ match }: { match: Match }) {
  const { t } = useLanguage();
  const { lockedMarkets } = useLiveFeed();
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');

  const { categorized, counts } = useMemo(() => {
    const result: Record<Category, Market[]> = {
      main: [], goals: [], corners: [], cards: [], htft: [], other: [],
    };
    const c: Record<Category, number> = {
      main: 0, goals: 0, corners: 0, cards: 0, htft: 0, other: 0,
    };

    for (const market of match.markets ?? []) {
      if (isHandicapMarket(market)) continue;
      if (!isMarketVisible(match, market, lockedMarkets)) continue;
      const available = (market.outcomes ?? []).filter(isOutcomeAvailable);
      if (!filterDecidedOutcomes(available, market, match).length) continue;

      const cat = categoryOf(market);
      result[cat].push(market);
      c[cat]++;
    }

    for (const key of Object.keys(result) as Category[]) {
      result[key].sort(
        (a, b) =>
          Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
          String(a.name).localeCompare(String(b.name)) ||
          String(a.line ?? '').localeCompare(String(b.line ?? '')),
      );
    }

    return { categorized: result, counts: c };
  }, [match, lockedMarkets]);

  const totalMarkets = Object.values(counts).reduce((sum, n) => sum + n, 0);

  if (totalMarkets === 0) {
    return (
      <div className="border-t border-tertiary/60 px-4 py-3 text-xs text-text-secondary">
        {t('common.no_results')}
      </div>
    );
  }

  const categoriesToShow = activeCategory === 'all'
    ? CATEGORIES
    : CATEGORIES.filter(c => c.key === activeCategory);

  return (
    <div className="border-t border-tertiary/70 bg-primary/50 px-2 py-3 sm:px-4 sm:py-4 space-y-3">

      {/* Strip statistikash live — më kompakt në mobile */}
      <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-text-secondary bg-secondary/80 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-tertiary/60">
        {match.status === 'LIVE' && (
          <span className="font-bold text-accent-red flex items-center gap-1 sm:gap-1.5 bg-rose-500/10 px-1.5 sm:px-2 py-0.5 rounded sm:rounded-md border border-rose-500/20">
            <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-accent-red animate-ping"></span>
            {match.currentMinute || 0}:{String((match as any).currentSecond ?? 0).padStart(2, '0')}'{match.period ? ` · ${match.period}` : ''}
          </span>
        )}
        {match.corners && (
          <span className="bg-primary/60 px-1.5 sm:px-2.5 py-0.5 rounded sm:rounded-md border border-tertiary/50">
            🚩 <span className="font-bold text-white tabular-nums">
              {match.corners.home} - {match.corners.away}
            </span>
          </span>
        )}
        {match.cards && (
          <span className="bg-primary/60 px-1.5 sm:px-2.5 py-0.5 rounded sm:rounded-md border border-tertiary/50">
            🟨 <span className="font-bold text-white tabular-nums">
              {match.cards.home} - {match.cards.away}
            </span>
          </span>
        )}
        <span className="ml-auto text-[10px] sm:text-[11px] font-bold text-text-secondary">
          {totalMarkets} {t('markets.market')}
        </span>
      </div>

      {/* Filtrat e kategorive — më kompakt në mobile */}
      <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        <button
          onClick={() => setActiveCategory('all')}
          className={`shrink-0 flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded md:rounded-lg text-[10px] sm:text-[11px] font-bold transition ${
            activeCategory === 'all'
              ? 'bg-accent-green text-primary shadow-sm'
              : 'bg-secondary/80 text-text-secondary hover:text-white hover:bg-tertiary border border-tertiary/60'
          }`}
        >
          <span>📋</span>
          <span>Të Gjitha</span>
          <span className={`px-1 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black ${
            activeCategory === 'all' ? 'bg-primary/20 text-primary' : 'bg-primary/60 text-text-secondary'
          }`}>
            {totalMarkets}
          </span>
        </button>

        {CATEGORIES.map(cat => {
          const count = counts[cat.key];
          if (count === 0) return null;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`shrink-0 flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded md:rounded-lg text-[10px] sm:text-[11px] font-bold transition ${
                isActive
                  ? 'bg-accent-green text-primary shadow-sm'
                  : 'bg-secondary/80 text-text-secondary hover:text-white hover:bg-tertiary border border-tertiary/60'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className={`px-1 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black ${
                isActive ? 'bg-primary/20 text-primary' : 'bg-primary/60 text-text-secondary'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Seksionet e kategorive */}
      {categoriesToShow.map(cat => {
        const markets = categorized[cat.key];
        if (!markets.length) return null;
        const marketGroups = groupByBaseName(markets);

        return (
          <section key={cat.key} className="space-y-1.5 sm:space-y-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="w-1 h-3 sm:h-4 rounded-full bg-accent-green"></span>
              <span className="text-xs sm:text-sm">{cat.icon}</span>
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                {cat.label}
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-text-secondary bg-secondary px-1.5 sm:px-2 py-0.5 rounded-full border border-tertiary/60">
                {marketGroups.length}
              </span>
            </div>

            {/* Grid — hapësira më e vogël në mobile */}
            <div className="grid gap-1.5 sm:gap-3 grid-cols-1 xl:grid-cols-2">
              {marketGroups.map(group => {
                if (group.markets.length === 1) {
                  const market = group.markets[0];
                  const title = translateMarketName(market.name, t) || t('markets.market');
                  return (
                    <MarketCard
                      key={market.id}
                      market={market}
                      match={match}
                      title={title}
                    />
                  );
                }

                const baseTitle = translateMarketName(group.base, t) || group.base;
                return (
                  <GroupCard
                    key={groupKeyOf(group.markets[0])}
                    group={group}
                    match={match}
                    title={baseTitle}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
