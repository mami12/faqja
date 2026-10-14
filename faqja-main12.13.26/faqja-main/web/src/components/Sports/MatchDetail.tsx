import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Trophy, ChevronDown } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch } from '../../api/liveFeed';
import { isHandicapMarket } from '../../utils/sportsbookFilters';
import { translateMarketName } from '../../utils/sportsbookLabels';
import {
  isMarketVisible,
  isOutcomeAvailable,
  filterDecidedOutcomes,
} from '../../utils/marketExpiry';

const cleanMarketName = (name?: string) => {
  if (!name) return '';
  const s = String(name).trim();
  if (/^cols-?\d+$/i.test(s)) return 'Match Market';
  if (/^total-2$/i.test(s)) return 'Total Goals';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
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

interface GroupedMarket {
  baseName: string;
  title: string;
  category: string;
  markets: Market[];
}

const groupMarkets = (markets: Market[], t: any): GroupedMarket[] => {
  const map = new Map<string, Market[]>();

  for (const m of markets.filter((market) => !isHandicapMarket(market))) {
    const rawClean = cleanMarketName(m.name);
    const baseKey = rawClean.replace(/[\d\.]+/g, '').trim();

    if (!map.has(baseKey)) {
      map.set(baseKey, []);
    }
    map.get(baseKey)!.push(m);
  }

  const result: GroupedMarket[] = [];
  map.forEach((marketList, baseKey) => {
    marketList.sort((a, b) => parseFloat(a.line || '0') - parseFloat(b.line || '0'));

    result.push({
      baseName: baseKey,
      title: translateMarketName(marketList[0].name, t),
      category: 'Other',
      markets: marketList
    });
  });

  return result;
};

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const patch = useLivePatch(id);

  useEffect(() => {
    if (id) {
      apiClient.get(`/matches/${id}`).then(res => {
        setMatch(res.data);
        if (res.data?.markets) {
          setMarkets(res.data.markets);
        }
      }).catch(console.error);
    }
  }, [id]);

  if (!match) {
    return <div className="flex items-center justify-center min-h-[50vh] text-text-secondary text-sm font-medium">{t('common.loading')}</div>;
  }

  const live = { ...match, ...(patch ?? {}) };
  const categories = [
    { id: 'all', label: t('sports.all') },
    { id: 'Popular', label: t('sports.popular') },
    { id: 'Goals', label: t('sports.goals') },
    { id: 'Corners', label: t('sports.corners') }
  ];

  const groupedMarkets = groupMarkets(markets, t).filter(group =>
    activeTab === 'all' || group.category === activeTab
  );

  const formattedDate = new Date(live.startTime);
  const isLive = live.status === 'LIVE';

  const toggleGroup = (baseName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(baseName)) next.delete(baseName);
      else next.add(baseName);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-secondary px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-emerald-500/40 hover:bg-card-hover hover:text-white"
        >
          <ArrowLeft size={14} />
          {t('common.back')}
        </button>

        <div className="rounded-full border border-white/10 bg-secondary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
          {live.tournament?.name || live.tournament?.category?.name || t('common.match')}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-secondary p-4 shadow-2xl shadow-black/20 sm:p-5">
        {isLive && (
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          {isLive ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              {t('common.live')} {live.currentMinute || 0}'
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
              {formattedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {formattedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
            <Trophy size={12} />
            {live.tournament?.name || t('common.match')}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center sm:gap-5">
          <div className="text-right">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary/80">{t('sports.home')}</div>
            <h1 className="text-base font-bold tracking-tight text-white sm:text-xl">{live.homeTeam}</h1>
          </div>

          <div className="min-w-[92px] rounded-xl border border-white/5 bg-primary px-3 py-2 shadow-inner sm:min-w-[110px]">
            <span className="font-mono text-xl font-black tracking-[0.12em] text-emerald-400 sm:text-2xl">
              {isLive ? `${live.homeScore ?? 0} - ${live.awayScore ?? 0}` : t('common.vs')}
            </span>
          </div>

          <div className="text-left">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary/80">{t('sports.away')}</div>
            <h1 className="text-base font-bold tracking-tight text-white sm:text-xl">{live.awayTeam}</h1>
          </div>
        </div>
      </div>

      {isLive && <PitchTracker matchId={live.id} homeTeam={live.homeTeam} awayTeam={live.awayTeam} />}

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-primary/80 p-1.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === cat.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'border border-transparent bg-transparent text-text-secondary hover:border-white/10 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {groupedMarkets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-secondary p-6 text-center text-sm text-text-secondary">
            {t('common.no_results')}
          </div>
        ) : (
          groupedMarkets.map((group, idx) => {
            const mode = getMarketRenderMode(group.markets[0]);
            const isExpanded = expandedGroups.has(group.baseName);

            // Collect all outcomes for this group
            const allOutcomes = group.markets.flatMap(m => 
              filterDecidedOutcomes(dedupeOutcomes(m.outcomes ?? [], m.name), m, match)
            );

            if (!allOutcomes.length) return null;

            // HEADER - Dense accordion bar (h-8)
            const Header = (
              <button
                onClick={() => toggleGroup(group.baseName)}
                className="flex items-center justify-between w-full h-8 px-3 bg-[#1c2830] border-b border-white/5 text-left"
              >
                <span className="text-xs font-semibold text-white truncate pr-2 flex-1">
                  {translateMarketName(group.title, t)}
                </span>
                <ChevronDown 
                  size={14} 
                  className={`text-text-secondary transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>
            );

            // RENDER MODE: matrix-3 (1X2, Double Chance) - 3 columns, gap-[2px]
            if (mode === 'matrix-3') {
              return (
                <div key={`${group.baseName}-${idx}`} className="bg-[#141d24] rounded-md overflow-hidden mb-1.5">
                  {Header}
                  <div className="grid grid-cols-3 gap-[2px] bg-[#10171d] p-[2px]">
                    {allOutcomes.map(outcome => (
                      <OddsButton key={outcome.id} match={match} market={group.markets[0]} outcome={outcome} />
                    ))}
                  </div>
                </div>
              );
            }

            // RENDER MODE: matrix-2 (O/U, GG/NG, Team to Win) - 2 columns, gap-[2px]
            if (mode === 'matrix-2') {
              return (
                <div key={`${group.baseName}-${idx}`} className="bg-[#141d24] rounded-md overflow-hidden mb-1.5">
                  {Header}
                  <div className="grid grid-cols-2 gap-[2px] bg-[#10171d] p-[2px]">
                    {allOutcomes.map(outcome => (
                      <OddsButton key={outcome.id} match={match} market={group.markets[0]} outcome={outcome} />
                    ))}
                  </div>
                </div>
              );
            }

            // RENDER MODE: vertical-list (Player Props, Correct Score, etc.) - collapsible
            return (
              <details key={`${group.baseName}-${idx}`} className="bg-[#141d24] rounded-md overflow-hidden mb-1.5" defaultOpen={isExpanded}>
                <summary className="list-none">
                  {Header}
                </summary>
                <div className="divide-y divide-white/5 bg-[#141d24]">
                  {allOutcomes.slice(0, 12).map(outcome => (
                    <div key={outcome.id} className="flex items-center justify-between py-1.5 px-3">
                      <span className="text-xs font-medium text-white truncate max-w-[65%]">
                        {getShortOutcomeName(outcome.name, group.markets[0].name)}
                      </span>
                      <OddsButton match={match} market={group.markets[0]} outcome={outcome} />
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
          })
        )}
      </div>
    </div>
  );
}