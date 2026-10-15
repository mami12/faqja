import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, TrendingUp, Trophy, Sparkles, Flame, Clock, Flag, 
  ShieldAlert, Scale, ChevronDown, ChevronUp, Star, Bell, BellRing, 
  Search, X, Layers, Layers2
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch } from '../../api/liveFeed';
import { isHandicapMarket } from '../../utils/sportsbookFilters';
import { translateMarketName, formatMarketLine, isResultBttsMarket, isBttsGoalsComboMarket, isAnyMixedMarket } from '../../utils/sportsbookLabels';
import { useFavorites } from '../../context/FavoritesContext';

const cleanMarketName = (name?: string) => {
  if (!name) return '';
  const s = String(name).trim();
  if (/^cols-?\d+$/i.test(s)) return 'Tregu i ndeshjes';
  if (/^total-2$/i.test(s)) return 'Totali i golave';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
};

const getGroupCategory = (name?: string) => {
  const value = String(name ?? '').toLowerCase();
  if (isAnyMixedMarket(value)) return 'Mixed';
  if (/card|karton|booking|red card|yellow card/i.test(value)) return 'Cards';
  if (/corner|kendo|kënd|corners/i.test(value)) return 'Corners';
  if (/half|halves|pjesa|1st half|2nd half|1\. pjesë|2\. pjesë/i.test(value)) return 'Halves';
  if (/handicap|fora|asian/i.test(value)) return 'Handicap';
  if (/goal|total|over|under|score|btts|gg|ng|gola|both teams to score/i.test(value)) return 'Goals';
  return 'Popular';
};

const getCategoryIcon = (catId: string) => {
  switch (catId) {
    case 'Popular': return <Trophy size={13} className="text-amber-400" />;
    case 'Goals': return <Flame size={13} className="text-orange-400" />;
    case 'Mixed': return <Layers size={13} className="text-amber-300" />;
    case 'Halves': return <Clock size={13} className="text-purple-400" />;
    case 'Corners': return <Flag size={13} className="text-blue-400" />;
    case 'Cards': return <ShieldAlert size={13} className="text-rose-400" />;
    case 'Handicap': return <Scale size={13} className="text-emerald-400" />;
    default: return <Sparkles size={13} className="text-accent-green" />;
  }
};

const getMarketIcon = (category: string, title: string) => {
  const t = title.toLowerCase();
  if (category === 'Mixed') return <Layers size={14} className="text-amber-300 shrink-0" />;
  if (category === 'Cards' || /card|karton/i.test(t)) return <ShieldAlert size={14} className="text-rose-400 shrink-0" />;
  if (category === 'Corners' || /corner|kënd/i.test(t)) return <Flag size={14} className="text-blue-400 shrink-0" />;
  if (category === 'Halves' || /half|pjes/i.test(t)) return <Clock size={14} className="text-purple-400 shrink-0" />;
  if (category === 'Handicap' || /handicap|fora/i.test(t)) return <Scale size={14} className="text-emerald-400 shrink-0" />;
  if (category === 'Goals' || /goal|score|gola/i.test(t)) return <Flame size={14} className="text-orange-400 shrink-0" />;
  return <Trophy size={14} className="text-accent-yellow shrink-0" />;
};

const dedupeOutcomes = (outcomes: any[] = [], marketName: string = '') => {
  const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s*:\s*/g, ':');
  const mName = norm(marketName);
  const is1X2 = !isResultBttsMarket(mName) && /1x2|full time result|match result|winner/i.test(mName) && !/half|score|rezultat|both|corner|card|handicap|chance/i.test(mName);
  const isBTTS = !isAnyMixedMarket(mName) && /both teams? to score|both score/i.test(mName) && !/half|halves|result|1x2/i.test(mName);

  const seen = new Set<string>();
  const res: any[] = [];
  for (const o of outcomes) {
    const k = norm(isAnyMixedMarket(mName) ? (o.code || o.name || '') : (o.name || o.code || ''));
    if (is1X2 && !['1', 'x', '2', 'home', 'draw', 'away'].includes(k)) continue;
    if (isBTTS && !['yes', 'no', 'gg', 'ng'].includes(k)) continue;
    if (!seen.has(k)) {
      seen.add(k);
      res.push(o);
    }
  }
  return res;
};

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
    const explicitLine = String(m.line ?? '').trim();
    // Never merge markets containing a minute in their name when the feed has no separate line.
    const groupingName = explicitLine ? rawClean.replace(/\s+\d+(?:[.,]\d+)?$/, '').trim() : rawClean;
    const baseKey = `${String(m.marketType ?? '')}:${String(m.period ?? 0)}:${groupingName}`;

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
      title: translateMarketName(
        String(marketList[0].line ?? '').trim()
          ? cleanMarketName(marketList[0].name).replace(/\s+\d+(?:[.,]\d+)?$/, '').trim()
          : marketList[0].name, t),
      category: getGroupCategory(baseKey),
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
  const [marketSearch, setMarketSearch] = useState<string>('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { isFavorite, toggleFavorite, isAlertEnabled, toggleAlert } = useFavorites();
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

  const allGrouped = useMemo(() => groupMarkets(markets, t), [markets, t]);

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
          ((m as any).outcomes?.some((o: any) => o.name?.toLowerCase().includes(q)))
        );
        return titleMatches || subMarketMatches;
      }
      return true;
    });
  }, [allGrouped, activeTab, marketSearch]);

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

  const live = { ...match, ...(patch ?? {}) };
  const matchIdStr = String(live.id);
  const isFav = isFavorite(matchIdStr);
  const isAlert = isAlertEnabled(matchIdStr);

  const categories = [
    { id: 'all', label: 'Të Gjitha' },
    { id: 'Popular', label: 'Kryesore' },
    { id: 'Goals', label: 'Golat' },
    { id: 'Mixed', label: 'MIKSE' },
    { id: 'Halves', label: 'Pjesët' },
    { id: 'Corners', label: 'Këndet' },
    { id: 'Cards', label: 'Kartona' },
    { id: 'Handicap', label: 'Handicap' }
  ];

  const filteredCategories = categories.filter(c => c.id === 'all' || (categoryCounts[c.id] && categoryCounts[c.id] > 0));

  const formattedDate = new Date(live.startTime);
  const isLive = live.status === 'LIVE';

  return (
    <div className="mx-auto max-w-6xl px-1.5 py-2 sm:px-3 space-y-2">
      {/* Top Navigation Bar & Action Icons */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-secondary px-3 py-2 text-xs font-bold text-text-secondary transition hover:border-emerald-500/40 hover:bg-card-hover hover:text-white active:scale-95 shadow-sm"
        >
          <ArrowLeft size={15} />
          {t('common.back')}
        </button>

        {/* Favorite & Notification Actions */}
        <div className="flex items-center gap-2">
          {/* Favorite Toggle Button */}
          <button
            onClick={() => toggleFavorite(matchIdStr)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 shadow-sm ${
              isFav 
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-500/10' 
                : 'bg-secondary text-text-secondary border-white/10 hover:text-white hover:bg-tertiary/60'
            }`}
            title={isFav ? "Hiq nga ndeshjet e preferuara" : "Shto në ndeshjet e preferuara"}
          >
            <Star size={14} className={isFav ? "fill-amber-400 text-amber-400" : ""} />
            <span className="hidden sm:inline">{isFav ? 'E Preferuar' : 'Prefero'}</span>
          </button>

          {/* Live Notification Toggle Button */}
          <button
            onClick={() => toggleAlert(matchIdStr)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 shadow-sm ${
              isAlert 
                ? 'bg-accent-green/20 text-accent-green border-accent-green/40 shadow-accent-green/10' 
                : 'bg-secondary text-text-secondary border-white/10 hover:text-white hover:bg-tertiary/60'
            }`}
            title={isAlert ? "Njoftimet live aktive (Gol, Penallti, Kartona)" : "Aktivizo njoftimet live për këtë ndeshje"}
          >
            {isAlert ? <BellRing size={14} className="text-accent-green animate-pulse" /> : <Bell size={14} />}
            <span className="hidden sm:inline">{isAlert ? 'Njoftime ON' : 'Njofto'}</span>
          </button>

          {/* Tournament pill */}
          <div className="rounded-xl border border-white/10 bg-secondary/80 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary truncate max-w-[150px] sm:max-w-[220px]">
            {live.tournament?.name || live.tournament?.category?.name || t('common.match')}
          </div>
        </div>
      </div>

      {/* Hero Match Scoreboard Header */}
      <div className="relative overflow-hidden rounded-sm border border-tertiary bg-secondary p-2.5 sm:p-3">
        {isLive && (
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
        )}

        <div className="mb-3 flex items-center justify-between gap-2">
          {isLive ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('common.live')} {live.currentMinute || 0}'
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
              {formattedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {formattedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <Trophy size={12} />
            {live.tournament?.name || t('common.match')}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center sm:gap-5">
          <div className="text-right">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary/70">{t('sports.home')}</div>
            <h1 className="text-sm font-black tracking-tight text-white sm:text-xl line-clamp-2">{live.homeTeam}</h1>
          </div>

          <div className="min-w-[80px] rounded-sm bg-primary/95 px-3 py-1.5 sm:min-w-[110px]">
            <span className="font-mono text-lg font-black tracking-widest text-emerald-400 sm:text-2xl">
              {isLive ? `${live.homeScore ?? 0} - ${live.awayScore ?? 0}` : t('common.vs')}
            </span>
          </div>

          <div className="text-left">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary/70">{t('sports.away')}</div>
            <h1 className="text-sm font-black tracking-tight text-white sm:text-xl line-clamp-2">{live.awayTeam}</h1>
          </div>
        </div>
      </div>

      {isLive && <PitchTracker matchId={live.id} homeTeam={live.homeTeam} awayTeam={live.awayTeam} />}

      {/* Filter & Search Bar */}
      <div className="space-y-2">
        {/* Search input for instant market find */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={marketSearch}
            onChange={(e) => setMarketSearch(e.target.value)}
            placeholder="Kërko tregje (p.sh. golat, pjesa e parë, fituesi, kënde...)"
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
          Duke shfaqur <strong className="text-white">{groupedMarkets.length}</strong> tregje
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

            return (
              <section key={`${group.baseName}-${idx}`} className="overflow-hidden border border-tertiary/80 bg-secondary">
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
                      const cleanOutcomes = dedupeOutcomes((market as any).outcomes ?? [], market.name);
                      if (!cleanOutcomes.length) return null;
                      const line = String(market.line ?? '').trim();
                      const showLine = group.markets.length > 1 || !!line;
                      return (
                        <div key={market.id} className="flex items-stretch min-h-[40px] bg-[#252e3b]">
                          {showLine && (
                            <div className="w-[48px] sm:w-[76px] shrink-0 flex items-center justify-center bg-[#424d60] border-r border-tertiary/80 px-1 text-xs font-bold text-slate-200">
                              {formatMarketLine(market.name, line) || translateMarketName(market.name, t)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0 grid gap-px bg-tertiary/80"
                            style={{gridTemplateColumns: `repeat(${Math.min(cleanOutcomes.length, 3)}, minmax(0, 1fr))`}}>
                            {cleanOutcomes.map((outcome: any) => (
                              <div key={outcome.id} className="min-w-0 bg-[#252e3b] [&_button]:w-full [&_button]:h-full [&_button]:min-h-[40px] [&_button]:rounded-none [&_button]:bg-transparent [&_button]:px-2 [&_button]:text-xs">
                                <OddsButton match={live} market={market} outcome={outcome} isWide />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
