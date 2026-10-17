import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Trophy, Sparkles, Flame, Clock, Flag, 
  ShieldAlert, ChevronDown, ChevronUp, Star, Bell, BellRing, 
  Search, X, Layers, Layers2
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch, useLiveFeed } from '../../api/liveFeed';
import { filterDecidedOutcomes, isMarketVisible, isOutcomeDisplayable } from '../../utils/marketExpiry';
import { formatMarketLine } from '../../utils/sportsbookLabels';
import { betBuilderGroup, marketCategoryOf, isHandicapMarket, isIdentifiedMarket, marketCategoryLabel, marketDisplayTitle, marketGroupKey, marketLineValue } from '../../utils/marketCatalog';
import type { MarketCategory, MarketLanguage } from '../../utils/marketCatalog';
import { useFavorites } from '../../context/FavoritesContext';

// MatchDetail keeps its original tab IDs, but uses the same canonical
// classification and localized labels as MarketPanel.
const CATEGORY_KEY: Record<string, MarketCategory> = {
  Popular: 'main', Goals: 'goals', Mixed: 'mixed', Halves: 'htft',
  Corners: 'corners', Cards: 'cards',
  Players: 'players', Other: 'other',
};
const getGroupCategory = (market: Market): string => {
  const category = marketCategoryOf(market);
  return Object.keys(CATEGORY_KEY).find((key) => CATEGORY_KEY[key] === category) ?? 'Other';
};
const categoryLabel = (category: string, lang: MarketLanguage): string =>
  marketCategoryLabel(CATEGORY_KEY[category] ?? 'other', lang);
const CATEGORY_ORDER = ['Popular', 'Goals', 'Mixed', 'Halves', 'Corners', 'Cards', 'Players', 'Other'];

const getCategoryIcon = (catId: string) => {
  switch (catId) {
    case 'Popular': return <Trophy size={13} className="text-amber-400" />;
    case 'Goals': return <Flame size={13} className="text-orange-400" />;
    case 'Mixed': return <Layers size={13} className="text-amber-300" />;
    case 'Halves': return <Clock size={13} className="text-purple-400" />;
    case 'Corners': return <Flag size={13} className="text-blue-400" />;
    case 'Cards': return <ShieldAlert size={13} className="text-rose-400" />;
    default: return <Sparkles size={13} className="text-accent-green" />;
  }
};

const getMarketIcon = (category: string, title: string) => {
  const t = title.toLowerCase();
  if (category === 'Mixed') return <Layers size={14} className="text-amber-300 shrink-0" />;
  if (category === 'Cards' || /card|karton/i.test(t)) return <ShieldAlert size={14} className="text-rose-400 shrink-0" />;
  if (category === 'Corners' || /corner|kënd/i.test(t)) return <Flag size={14} className="text-blue-400 shrink-0" />;
  if (category === 'Halves' || /half|pjes/i.test(t)) return <Clock size={14} className="text-purple-400 shrink-0" />;
  if (category === 'Goals' || /goal|score|gola/i.test(t)) return <Flame size={14} className="text-orange-400 shrink-0" />;
  return <Trophy size={14} className="text-accent-yellow shrink-0" />;
};

// Do not deduplicate by the label: different selections can legitimately have
// the same provider text while carrying distinct outcome ids.
const dedupeOutcomes = (outcomes: any[] = []) => {
  const seen = new Set<string>();
  return outcomes.filter((outcome) => {
    const id = String(outcome.id ?? '');
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

interface GroupedMarket {
  baseName: string;
  title: string;
  category: string;
  markets: Market[];
}

const groupMarkets = (markets: Market[], lang: MarketLanguage): GroupedMarket[] => {
  const groups = new Map<string, Market[]>();
  for (const market of markets) {
    if (!isIdentifiedMarket(market) || isHandicapMarket(market)) continue;
    const key = marketGroupKey(market);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(market);
  }
  const rankedLine = (market: Market): number => {
    const raw = marketLineValue(market);
    if (!raw) return Number.POSITIVE_INFINITY;
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const result: GroupedMarket[] = [];
  for (const [key, entries] of groups) {
    entries.sort((a, b) => rankedLine(a) - rankedLine(b));
    result.push({
      baseName: key,
      title: marketDisplayTitle(entries[0], lang),
      category: getGroupCategory(entries[0]),
      markets: entries,
    });
  }
  return result.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
};

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [marketSearch, setMarketSearch] = useState<string>('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { isFavorite, toggleFavorite, isAlertEnabled, toggleAlert } = useFavorites();
  const patch = useLivePatch(id);
  const { lockedMarkets, lockedOutcomes, riskLockedOutcomes } = useLiveFeed();
  // The live clock pushes seconds every tick. Only facts relevant to market
  // expiry should rebuild all market groups, not an unrelated second counter.
  const liveMarketMatch = useMemo(
    () => match ? { ...match, ...(patch ?? {}) } : null,
    [match, patch?.status, patch?.period, patch?.currentMinute,
      patch?.homeScore, patch?.awayScore, patch?.corners?.home, patch?.corners?.away,
      patch?.cards?.home, patch?.cards?.away, patch?.isSuspended],
  );

  useEffect(() => {
    if (!id) return;
    let active = true;
    const refresh = () => {
      apiClient.get(`/matches/${id}`).then(res => {
        if (!active) return;
        setMatch(res.data);
        setMarkets(res.data?.markets ?? []);
      }).catch(console.error);
    };
    refresh();
    // Opening a fixture boosts its upstream subscription to FULL markets.
    // The first REST response can predate that push snapshot: re-fetch while open
    // so extra lines and markets become visible without a manual browser refresh.
    const timer = window.setInterval(refresh, 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);

  // One visibility rule for the full market page, search, category counts and rows.
  // Apply pushed scores immediately instead of waiting for the 20s REST refresh.
  const filteredMarkets = useMemo(() => {
    if (!liveMarketMatch) return [];
    return markets.flatMap(market => {
      if (!isMarketVisible(liveMarketMatch, market, lockedMarkets, lockedOutcomes, riskLockedOutcomes)) return [];
      const outcomes = filterDecidedOutcomes(
        (market.outcomes ?? []).filter(isOutcomeDisplayable), market, liveMarketMatch,
      );
      return outcomes.length ? [{ ...market, outcomes }] : [];
    });
  }, [markets, liveMarketMatch, lockedMarkets, lockedOutcomes, riskLockedOutcomes]);

  const allGrouped = useMemo(() => groupMarkets(filteredMarkets, lang), [filteredMarkets, lang]);

  // Available categories with count
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allGrouped.length };
    allGrouped.forEach(g => {
      counts[g.category] = (counts[g.category] || 0) + 1;
    });
    return counts;
  }, [allGrouped]);

  const groupedMarkets = useMemo(() => {
    return allGrouped.filter(group => {
      if (activeTab !== 'all' && group.category !== activeTab) return false;
      if (marketSearch.trim()) {
        const q = marketSearch.toLowerCase().trim();
        const titleMatches = group.title.toLowerCase().includes(q);
        const subMarketMatches = group.markets.some(m => 
          (m.name?.toLowerCase().includes(q)) || 
          (String(m.line ?? '').toLowerCase().includes(q)) ||
          ((m as any).outcomes?.some((o: any) => o.name?.toLowerCase().includes(q)))
        );
        return titleMatches || subMarketMatches;
      }
      return true;
    });
  }, [allGrouped, activeTab, marketSearch]);

  const visibleLines = groupedMarkets.reduce((sum, group) => sum + group.markets.length, 0);

  const toggleGroupCollapse = (baseName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [baseName]: !prev[baseName]
    }));
  };

  const toggleAllCollapse = () => {
    const allCollapsed = Object.values(collapsedGroups).length > 0 && Object.values(collapsedGroups).every(v => v);
    const nextState: Record<string, boolean> = {};
    allGrouped.forEach(g => {
      nextState[g.baseName] = !allCollapsed;
    });
    setCollapsedGroups(nextState);
  };

  if (!match) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary text-sm font-medium gap-2">
        <span className="w-3 h-3 rounded-full bg-accent-green animate-ping"></span>
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  const live = liveMarketMatch!;
  const matchIdStr = String(live.id);
  const isFav = isFavorite(matchIdStr);
  const isAlert = isAlertEnabled(matchIdStr);

  const categories = [
    { id: 'all', label: 'All Markets' },
    ...CATEGORY_ORDER.map(id => ({ id, label: categoryLabel(id, 'en') })),
  ];

  const filteredCategories = categories.filter(c => c.id === 'all' || (categoryCounts[c.id] && categoryCounts[c.id] > 0));

  const formattedDate = new Date(live.startTime);
  const isLive = live.status === 'LIVE';

  return (
    <div className="mx-auto max-w-6xl px-1.5 py-2 sm:px-3 space-y-2">
      {/* A photographic, dynamic scoreboard: the image is only a background.
          Scores and statistics always come from the live feed, never from the photo.
          Photo: Peter Glaser, CC0 (Wikimedia Commons, 2017). */}
      <section className="overflow-hidden rounded-sm border border-[#303d4b]" aria-label="Rezultati dhe statistikat e ndeshjes">
        <div className="flex min-h-[36px] items-center justify-between gap-2 bg-[#414b5b] px-2.5 text-[#eaf0f9]">
          <button type="button" onClick={() => navigate(-1)}
            className="inline-flex min-w-0 items-center gap-2 py-2 text-left text-xs hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            aria-label="Kthehu te lista e ndeshjeve">
            <ArrowLeft size={15} className="shrink-0" />
            <span className="truncate">
              {[live.tournament?.category?.name, live.tournament?.name].filter(Boolean).join(' / ') || t('common.match')}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => toggleFavorite(matchIdStr)}
              aria-label={isFav ? 'Hiq nga të preferuarat' : 'Shto te të preferuarat'}
              aria-pressed={isFav} title={isFav ? 'Hiq nga të preferuarat' : 'Shto te të preferuarat'}
              className="rounded-sm p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white">
              <Star size={15} className={isFav ? 'fill-amber-400 text-amber-400' : ''}/>
            </button>
            <button type="button" onClick={() => toggleAlert(matchIdStr)}
              aria-label={isAlert ? 'Çaktivizo njoftimet LIVE' : 'Aktivizo njoftimet LIVE'}
              aria-pressed={isAlert} title={isAlert ? 'Çaktivizo njoftimet LIVE' : 'Aktivizo njoftimet LIVE'}
              className="rounded-sm p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white">
              {isAlert ? <BellRing size={15} className="text-emerald-300" /> : <Bell size={15}/>}
            </button>
            <button type="button" onClick={() => navigate('/')} title="Mbyll ndeshjen"
              aria-label="Mbyll ndeshjen dhe kthehu te ndeshjet"
              className="rounded-sm p-1 text-slate-200 transition-colors hover:bg-white/10 hover:text-white">
              <X size={17} strokeWidth={3}/>
            </button>
          </div>
        </div>
        <div className="relative isolate flex min-h-[151px] items-center overflow-hidden bg-[#336528] px-2 py-3 sm:min-h-[166px] sm:px-4">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -scale-x-100 bg-cover bg-center"
            style={{
              backgroundImage: 'url("https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7f/Adidas_soccer_ball_on_a_grass_pitch_%28Unsplash%29.jpg/960px-Adidas_soccer_ball_on_a_grass_pitch_%28Unsplash%29.jpg")',
              backgroundPosition: 'center 62%',
              filter: 'saturate(1.35) brightness(1.08)',
            }}/>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#10371d]/40 via-[#092a1a]/15 to-[#0f281d]/10" />
          <div className="relative z-10 mx-auto w-full max-w-[570px] sm:ml-[13%] sm:mr-auto">
            <div className="overflow-hidden rounded-[3px] border-[3px] border-[#a0a9a0]/75 bg-[#274431]/90 shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
              <div className="grid grid-cols-[minmax(0,1fr)_42px_42px_42px] items-center bg-[#234a48] px-2 py-1 text-center text-[12px] text-white sm:grid-cols-[minmax(0,1fr)_55px_50px_50px]">
                <strong className="min-w-0 truncate text-left text-[11px] sm:text-[13px]">
                  {isLive
                    ? ('LIVE' + (live.currentMinute != null ? ' ' + live.currentMinute + "'" : '') +
                      (live.period ? ' ' + live.period : ''))
                    : formattedDate.toLocaleDateString([], {day:'numeric', month:'short'}) + ' ' +
                      formattedDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </strong>
                <span title="Gola" aria-label="Gola" role="img">⚽</span>
                <span title="Kartonë gjithsej" aria-label="Kartonë gjithsej" role="img">🟨</span>
                <span title="Kornera" aria-label="Kornera" role="img">🚩</span>
              </div>
              <div className="divide-y divide-white/10 text-xs sm:text-sm">
                <div className="grid min-h-[27px] grid-cols-[minmax(0,1fr)_42px_42px_42px] items-center px-2 text-center sm:grid-cols-[minmax(0,1fr)_55px_50px_50px]">
                  <strong className="min-w-0 truncate text-left text-white" title={live.homeTeam}>{live.homeTeam}</strong>
                  <strong className="font-mono text-amber-300">{isLive || live.status === 'ENDED' ? (live.homeScore ?? '—') : '—'}</strong>
                  <span className="font-mono text-white">{live.cards?.home ?? '—'}</span>
                  <span className="font-mono text-white">{live.corners?.home ?? '—'}</span>
                </div>
                <div className="grid min-h-[27px] grid-cols-[minmax(0,1fr)_42px_42px_42px] items-center px-2 text-center sm:grid-cols-[minmax(0,1fr)_55px_50px_50px]">
                  <strong className="min-w-0 truncate text-left text-white" title={live.awayTeam}>{live.awayTeam}</strong>
                  <strong className="font-mono text-amber-300">{isLive || live.status === 'ENDED' ? (live.awayScore ?? '—') : '—'}</strong>
                  <span className="font-mono text-white">{live.cards?.away ?? '—'}</span>
                  <span className="font-mono text-white">{live.corners?.away ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Keep the expandable real event timeline; corners/cards now live in the photo scoreboard. */}
      {isLive && <PitchTracker matchId={live.id} homeTeam={live.homeTeam} awayTeam={live.awayTeam} eventsOnly />}

      {/* Filter & Search Bar */}
      <div className="space-y-2">
        {/* Search input for instant market find */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={marketSearch}
            onChange={(e) => setMarketSearch(e.target.value)}
            placeholder="Search markets, lines, selections (e.g. 3.5, corners, cards...)"
            className="w-full bg-secondary border border-tertiary rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-white placeholder-text-secondary focus:outline-none focus:border-accent-green shadow-inner"
          />
          {marketSearch && (
            <button
              onClick={() => setMarketSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category Filter Pills with Icons */}
        <div className="rounded-sm border border-tertiary bg-primary/90 p-0.5">
          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-0.5">
            {filteredCategories.map((cat) => {
              const count = categoryCounts[cat.id] || 0;
              const isActive = activeTab === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-accent-green text-primary font-bold'
                      : 'border border-transparent bg-transparent text-text-secondary hover:bg-tertiary/60 hover:text-white'
                  }`}
                >
                  {getCategoryIcon(cat.id)}
                  <span>{cat.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-primary/30 text-primary' : 'bg-white/5 text-text-secondary'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Header controls: market counter and collapse toggle */}
      <div className="flex items-center justify-between text-xs px-1 text-text-secondary">
        <span className="font-semibold">
          Showing <strong className="text-white">{groupedMarkets.length}</strong> markets / <strong className="text-white">{visibleLines}</strong> lines
        </span>
        <button
          onClick={toggleAllCollapse}
          className="text-text-secondary hover:text-white font-bold inline-flex items-center gap-1 hover:underline active:scale-95 transition"
        >
          <Layers size={13} />
          <span>Palos / Hapi të Gjitha</span>
        </button>
      </div>

      {/* Markets List - Dense, Elegant & Organized */}
      <div className="space-y-2">
        {groupedMarkets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-secondary p-8 text-center text-sm text-text-secondary space-y-2">
            <Search size={28} className="mx-auto opacity-30 text-white" />
            <div className="font-bold text-white">Nuk u gjet asnjë treg</div>
            <p className="text-xs">Provoni të ndryshoni kategorinë ose fjalën e kërkimit.</p>
          </div>
        ) : (
          groupedMarkets.map((group, idx) => {
            const isCollapsed = collapsedGroups[group.baseName] ?? false;
            const sectionStart = idx === 0 || groupedMarkets[idx - 1].category !== group.category;

            return (
              <div key={group.baseName} className="space-y-1.5">
                {sectionStart && (
                  <div className="flex items-center gap-2 px-1 pt-2 text-xs font-bold uppercase tracking-wide text-white">
                    {getCategoryIcon(group.category)}
                    <span>{categoryLabel(group.category, 'en')}</span>
                    <span className="rounded bg-tertiary/70 px-2 py-0.5 text-[10px] text-text-secondary">
                      {groupedMarkets.filter(g => g.category === group.category).length}
                    </span>
                  </div>
                )}
              <section className="overflow-hidden border border-tertiary/80 bg-secondary">
                <button type="button" onClick={() => toggleGroupCollapse(group.baseName)}
                  className="w-full flex items-center justify-between gap-2 bg-[#424d60] hover:bg-[#526176] px-2.5 py-1.5 text-left border-b border-tertiary">
                  <span className="min-w-0 flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Star size={12} className="shrink-0 text-text-secondary" />
                    <span className="break-words">{group.title}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-text-secondary flex items-center gap-1">
                    {group.markets.length} {group.markets.length === 1 ? 'linjë' : 'linja'}
                    {isCollapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-tertiary/70">
                    {group.markets.map(market => {
                      const cleanOutcomes = dedupeOutcomes((market as any).outcomes ?? []);
                      if (!cleanOutcomes.length) return null;
                      const builder = betBuilderGroup(market);
                      const line = marketLineValue(market);
                      const showLine = !builder && (group.markets.length > 1 || !!line);
                      if (builder) {
                        // A real builder template, not an invented market. Keep
                        // its original admin name and exact bettable outcome.
                        return (
                          <div key={market.id} className="flex min-h-[42px] items-stretch gap-px bg-tertiary/80">
                            <div className="flex min-w-0 flex-1 items-center bg-[#414b5b] px-2 py-1.5">
                              <span className="break-words text-[11px] font-semibold text-slate-100">
                                {market.name.replace(/^Bet Builder:\s*/i, '')}
                              </span>
                            </div>
                            <div className="flex min-w-0 flex-[1.4] flex-col bg-[#252e3b] [&_button]:min-h-[42px] [&_button]:w-full [&_button]:flex-1 [&_button]:rounded-none">
                              {cleanOutcomes.map((outcome: any) => (
                                <OddsButton key={outcome.id} match={live} market={market} outcome={outcome} isWide showRawLabel />
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={market.id} className="flex items-stretch min-h-[40px] bg-[#252e3b]">
                          {showLine && (
                            <div className="w-[48px] sm:w-[76px] shrink-0 flex items-center justify-center bg-[#424d60] border-r border-tertiary/80 px-1 text-xs font-bold text-slate-200">
                              {formatMarketLine(market.name, line) || market.name}
                            </div>
                          )}
                          <div className="flex-1 min-w-0 grid gap-px bg-tertiary/80"
                            style={{gridTemplateColumns: `repeat(${Math.min(cleanOutcomes.length, 3)}, minmax(0, 1fr))`}}>
                            {cleanOutcomes.map((outcome: any) => (
                              <div key={outcome.id} className="min-w-0 bg-[#252e3b] [&_button]:w-full [&_button]:h-full [&_button]:min-h-[40px] [&_button]:rounded-none [&_button]:bg-transparent [&_button]:px-2 [&_button]:text-xs">
                                <OddsButton match={live} market={market} outcome={outcome} isWide showRawLabel />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
