import { useMemo } from 'react';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import { useLanguage } from '../../context/LanguageContext';
import { useLiveFeed } from '../../api/liveFeed';
import { ChevronDown } from 'lucide-react';
import {
  isMarketVisible,
  isOutcomeAvailable,
  filterDecidedOutcomes,
} from '../../utils/marketExpiry';
import { isHandicapMarket } from '../../utils/sportsbookFilters';
import { translateMarketName } from '../../utils/sportsbookLabels';

function getShortOutcomeName(outcomeName: string, marketName: string): string {
  const raw = String(outcomeName ?? '').trim();
  const mName = String(marketName ?? '').toLowerCase();

  if (
    mName.includes('first goal') ||
    mName.includes('last goal') ||
    mName.includes('anytime') ||
    mName.includes('scorer') ||
    mName.includes('to score')
  ) {
    return raw
      .replace(/^.*?(?:to score|scorer|will score)\s+/i, '')
      .replace(/\s*(1st|2nd|first|second)\s*half.*$/i, '')
      .replace(/\s*\(.*?\)\s*$/i, '')
      .trim();
  }
  if (mName.includes('correct score')) return raw;
  return raw;
}

type RenderMode = 'matrix-3' | 'matrix-2' | 'vertical-list';

function getMarketRenderMode(market: Market): RenderMode {
  const name = market.name?.toLowerCase() ?? '';
  const outcomes = market.outcomes?.length ?? 0;
  const type = market.marketType?.toUpperCase() ?? '';

  if (type === '1X2' || /double chance/i.test(name)) return 'matrix-3';
  if (type === 'OVER_UNDER' || /both teams|btts|gg\/ng|team to win/i.test(name)) return 'matrix-2';
  if (outcomes > 3) return 'vertical-list';
  return 'matrix-2';
}

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

export default function MarketPanel({ match }: { match: Match }) {
  const { t } = useLanguage();
  const { lockedMarkets } = useLiveFeed();

  const grouped = useMemo(() => {
    const groups = new Map<string, Market[]>();
    for (const market of match.markets ?? []) {
      if (isHandicapMarket(market)) continue;
      if (!isMarketVisible(match, market, lockedMarkets)) continue;
      const available = (market.outcomes ?? []).filter(isOutcomeAvailable);
      if (!filterDecidedOutcomes(available, market, match).length) continue;
      const base = baseMarketName(market);
      const list = groups.get(base) ?? [];
      list.push(market);
      groups.set(base, list);
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

  if (!match.markets?.length) {
    return (
      <div className="border-t border-tertiary/60 px-4 py-3 text-xs text-text-secondary">
        {t('common.no_results')}
      </div>
    );
  }

  return (
    <div className="border-t border-tertiary/70 bg-primary/50 px-3.5 sm:px-5 py-4 space-y-4">
      {/* Live Stats Bar - Sticky, compact */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary bg-secondary/80 p-2 rounded-lg border border-tertiary/60 sticky top-0 z-10 mb-3">
        {match.status === 'LIVE' && (
          <span className="font-bold text-accent-red flex items-center gap-1.5 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-ping"></span>
            {match.currentMinute || 0}:{String((match as any).currentSecond ?? 0).padStart(2, '0')}'{match.period ? ` · ${match.period}` : ''}
          </span>
        )}
        {match.corners && (
          <span className="bg-primary/60 px-2.5 py-0.5 rounded border border-tertiary/50 shrink-0">
            {t('markets.corners')}: <span className="font-bold text-white tabular-nums">{match.corners.home} - {match.corners.away}</span>
          </span>
        )}
        {match.cards && (
          <span className="bg-primary/60 px-2.5 py-0.5 rounded border border-tertiary/50 shrink-0">
            {t('markets.cards')}: <span className="font-bold text-white tabular-nums">{match.cards.home} - {match.cards.away}</span>
          </span>
        )}
        <span className="ml-auto text-[11px] font-bold text-text-secondary shrink-0">
          {totalMarkets} {t('markets.market')}
        </span>
      </div>

      {Array.from(grouped.entries()).map(([base, marketsInGroup]) => {
        const market = marketsInGroup[0];
        const mode = getMarketRenderMode(market);
        const allOutcomes = marketsInGroup.flatMap(m => 
          filterDecidedOutcomes(dedupeOutcomes(m.outcomes ?? [], m.name), m, match)
        );
        if (!allOutcomes.length) return null;

        const title = translateMarketName(market.name, t) || t('markets.market');
        const line = formatLine(market.line);

        // HEADER - Dense accordion bar
        const Header = (
          <div className="flex items-center justify-between h-8 px-3 bg-[#1c2830] border-b border-white/5">
            <span className="text-xs font-semibold text-white truncate pr-2 flex-1">
              {title}{line && <span className="text-accent-green ml-1 text-[10px]">({line})</span>}
            </span>
            <span className="text-[10px] font-bold text-text-secondary/70 flex-shrink-0 ml-2">
              {marketsInGroup.length > 1 ? `${marketsInGroup.length} lines` : allOutcomes.length} outcomes
            </span>
          </div>
        );

        // RENDER MODE: matrix-3 (1X2, Double Chance)
        if (mode === 'matrix-3') {
          return (
            <div key={base} className="bg-[#141d24] rounded-md overflow-hidden mb-1.5">
              {Header}
              <div className="grid grid-cols-3 gap-[2px] bg-[#10171d] p-[2px]">
                {allOutcomes.map(outcome => (
                  <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                ))}
              </div>
            </div>
          );
        }

        // RENDER MODE: matrix-2 (O/U, GG/NG)
        if (mode === 'matrix-2') {
          return (
            <div key={base} className="bg-[#141d24] rounded-md overflow-hidden mb-1.5">
              {Header}
              <div className="grid grid-cols-2 gap-[2px] bg-[#10171d] p-[2px]">
                {allOutcomes.map(outcome => (
                  <OddsButton key={outcome.id} match={match} market={market} outcome={outcome} />
                ))}
              </div>
            </div>
          );
        }

        // RENDER MODE: vertical-list (Player Props, Correct Score) - collapsible
        return (
          <details key={base} className="bg-[#141d24] rounded-md overflow-hidden mb-1.5">
            <summary className="list-none cursor-pointer">
              {Header}
            </summary>
            <div className="divide-y divide-white/5 bg-[#141d24]">
              {allOutcomes.slice(0, 12).map(outcome => (
                <div key={outcome.id} className="flex items-center justify-between py-1.5 px-3">
                  <span className="text-xs font-medium text-white truncate max-w-[65%]">
                    {getShortOutcomeName(outcome.name, market.name)}
                  </span>
                  <OddsButton match={match} market={market} outcome={outcome} />
                </div>
              ))}
              {allOutcomes.length > 12 && (
                <div className="px-3 py-1.5 text-center text-xs text-accent-blue border-t border-white/5">
                  + {allOutcomes.length - 12} më shumë
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}