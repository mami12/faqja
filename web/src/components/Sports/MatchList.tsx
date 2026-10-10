import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Match } from '../../types';
import OddsButton from './OddsButton';
import MarketPanel from './MarketPanel';
import { useLiveFeed } from '../../api/liveFeed';
import { useNavigate } from 'react-router-dom';
import { Radio, ChevronRight, Clock, Shield, Search, CalendarDays } from 'lucide-react';
import { isMarketVisible, isOutcomeAvailable } from '../../utils/marketExpiry';

interface Props {
  tournamentId?: string;
  categoryId?: string;
  sportId?: string;
  isLiveOnly?: boolean;
}

type DateFilter = 'all' | 'today' | 'tomorrow';

export default function MatchList({ tournamentId, categoryId, sportId, isLiveOnly }: Props) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [viewMode, setViewMode] = useState<'all' | 'live' | 'prematch'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { livePatches, lockedMatches, lockedMarkets, feedMode } = useLiveFeed();
  const refreshing = feedMode !== 'live';

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (tournamentId) params.tournamentId = tournamentId;
      if (categoryId) params.categoryId = categoryId;
      if (sportId) params.sportId = sportId;
      if (isLiveOnly) params.status = 'LIVE';

      const res = await apiClient.get('/matches', { params });
      setMatches(res.data);
    } catch (e) {
      console.error('Failed to fetch matches:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 15000);
    return () => clearInterval(interval);
  }, [tournamentId, categoryId, sportId, isLiveOnly]);

  const searchFiltered = searchTerm.trim()
    ? matches.filter(m => {
        const search = searchTerm.toLowerCase();
        return (
          m.homeTeam?.toLowerCase().includes(search) ||
          m.awayTeam?.toLowerCase().includes(search) ||
          m.tournament?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.sport?.name?.toLowerCase().includes(search)
        );
      })
    : matches;

  const filteredMatches = searchFiltered.filter(m => {
    if (dateFilter === 'all') return true;
    const matchDate = new Date(m.startTime);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateFilter === 'today') {
      return matchDate >= today && matchDate < tomorrow;
    }
    if (dateFilter === 'tomorrow') {
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      return matchDate >= tomorrow && matchDate < dayAfter;
    }
    return true;
  });

  const pricedMatches = filteredMatches.filter(m => {
    const patch = livePatches[String(m.id)];
    if (patch?.marketCount && patch.marketCount > 0) return true;
    return (m.markets ?? []).some((mk: any) =>
      (mk.outcomes ?? []).some((o: any) => typeof o.odds === 'number' && o.odds > 0),
    );
  });

  const liveMatches = pricedMatches.filter(m => m.status === 'LIVE');
  const prematchMatches = pricedMatches.filter(m => m.status !== 'LIVE');
  const visibleMatches = viewMode === 'live' ? liveMatches : viewMode === 'prematch' ? prematchMatches : pricedMatches;

  if (loading && matches.length === 0) {
    return (
      <div className="p-12 text-center text-text-secondary flex items-center justify-center gap-2">
        <span className="w-3 h-3 rounded-full bg-accent-green animate-ping"></span>
        {t(refreshing ? 'common.feed_refreshing' : 'common.loading')}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="p-8 sm:p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto">
        <div className="text-4xl">{refreshing ? '⏳' : '⚽'}</div>
        <div className="font-bold text-white text-base">
          {t(refreshing ? 'common.feed_refreshing' : 'common.no_results')}
        </div>
        {refreshing ? (
          <p className="text-xs text-text-secondary">{t('common.feed_refreshing_hint')}</p>
        ) : (
          <p className="text-xs text-text-secondary">{t('sections.select_sport')}</p>
        )}
      </div>
    );
  }

  const renderFilterBar = () => (
    <div className="sticky top-0 z-10 border-b border-white/5 bg-[#0e1727]/85 backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#121a2a]/80 p-2">
          {[
            { id: 'all', label: t('sports.all') },
            { id: 'live', label: t('sports.live') },
            { id: 'prematch', label: t('sports.prematch') },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as 'all' | 'live' | 'prematch')}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                viewMode === tab.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'border border-white/5 bg-[#182232] text-text-secondary hover:border-white/10 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMatchCard = (raw: any) => {
    const m = { ...raw, ...(livePatches[String(raw.id)] ?? {}) };

    const is1X2 = (mk: any) => {
      const name = String(mk.name ?? '').toLowerCase();
      if (/half|1st|2nd|pjes|corner|card|handicap|double chance|chance/i.test(name)) return false;
      if (mk.period && mk.period !== 0) return false;
      return mk.marketType === '1X2' || /1x2|match result|full time result|\bwinner\b|moneyline/i.test(name);
    };
    const isBothScore = (mk: any) =>
      /both teams? to score|both score|\bbtts\b|\bgg\/?ng\b|\bgg\b|\bng\b/i.test(mk.name ?? '');
    const isOverUnder = (mk: any) =>
      mk.marketType === 'OVER_UNDER' ||
      /total goals|over\/?under|under\/?over|^ou$|goals over|goal line/i.test(mk.name ?? '');

    const pickQuickMarket = (): { market: any; slots: (any | null)[]; mode: '1x2' | 'btts' | 'ou' } | null => {
      const findOutcome = (mk: any, targets: string[]) => {
        const normT = targets.map((t) => t.toLowerCase());
        const hit = (mk.outcomes ?? []).find((o: any) => {
          const n = String(o.name ?? '').trim().toLowerCase();
          const c = String(o.code ?? o.key ?? '').trim().toLowerCase();
          return normT.includes(n) || normT.includes(c);
        });
        return isOutcomeAvailable(hit) ? hit : null;
      };

      const m1 = (m.markets ?? []).find((mk: any) => is1X2(mk) && isMarketVisible(m, mk, lockedMarkets));
      if (m1) {
        const slots = [
          findOutcome(m1, ['1', 'home', 'w1', 'h', String(m.homeTeam ?? '').toLowerCase()]),
          findOutcome(m1, ['x', 'draw', 'tie', 'wx', 'd']),
          findOutcome(m1, ['2', 'away', 'w2', 'a', String(m.awayTeam ?? '').toLowerCase()]),
        ];
        return { market: m1, slots, mode: '1x2' };
      }

      const m2 = (m.markets ?? []).find((mk: any) => isBothScore(mk) && isMarketVisible(m, mk, lockedMarkets));
      if (m2) {
        const slots = [
          findOutcome(m2, ['yes', 'gg']),
          findOutcome(m2, ['no', 'ng']),
        ];
        return { market: m2, slots, mode: 'btts' };
      }

      const m3 = (m.markets ?? []).find((mk: any) => isOverUnder(mk) && isMarketVisible(m, mk, lockedMarkets));
      if (m3) {
        const slots = [
          findOutcome(m3, ['over', 'o']),
          findOutcome(m3, ['under', 'u']),
        ];
        return { market: m3, slots, mode: 'ou' };
      }
      return null;
    };

    const quick = pickQuickMarket();
    const quickMarket = quick?.market ?? null;
    const quickSlots: (any | null)[] = quick?.slots ?? [];

    // Linja e market-it (2.5, 3.5, ...) — vjen nga `line` ose `specifier`
    const quickLine = String(quickMarket?.line ?? quickMarket?.specifier ?? '').trim();

    // Label-i: për O/U përfshin linjën, për të tjerat mbetet i njëjti
    const quickLabel =
      quick?.mode === '1x2' ? '1X2'
      : quick?.mode === 'btts' ? 'GG/NG'
      : quick?.mode === 'ou' ? 'O/U'
      : '';

    const quickCols = quick?.mode === '1x2' ? 3 : 2;
    const isLocked = lockedMatches[String(m.id)] === true;

    const totalMarketsCount = Math.max(m.markets?.length || 0, Number(m.marketCount) || 0);

    return (
      <div 
        key={m.id} 
        className="bg-card-bg/90 hover:bg-card-hover/90 rounded-2xl border border-tertiary/80 hover:border-slate-600/70 shadow-md transition-all duration-200 overflow-hidden group"
      >
        <div className="bg-primary/60 px-3.5 sm:px-4 py-2 border-b border-tertiary/60 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-text-secondary truncate">
            <span className="font-semibold text-text-primary text-[11px] sm:text-xs truncate tracking-wide">
              {m.tournament?.category?.name ? `${m.tournament.category.name} • ` : ''}{m.tournament?.name || 'League'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLocked && (
              <span
                className="inline-flex items-center gap-1 bg-accent-red/20 border border-accent-red/40 text-accent-red text-[10px] font-black px-2 py-0.5 rounded-full"
                title={t('sections.odds_locked')}
              >
                🔒 {t('sections.odds_locked')}
              </span>
            )}
            {m.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-red"></span>
                </span>
                LIVE {m.currentMinute || 0}:{String(m.currentSecond ?? 0).padStart(2, '0')}'
              </span>
            ) : (
              <span className="text-text-secondary flex items-center gap-1.5 text-[11px] font-medium bg-primary/40 px-2 py-0.5 rounded-md border border-tertiary/40">
                <Clock size={12} className="text-text-muted" />
                {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {new Date(m.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div 
            className="flex-1 cursor-pointer space-y-1.5 min-w-0"
            onClick={() => navigate(`/match/${m.id}`)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 group-hover:bg-accent-green transition-colors"></span>
                <span className="font-bold text-white text-xs sm:text-sm group-hover:text-accent-green transition truncate">
                  {m.homeTeam}
                </span>
              </div>
              {m.status === 'LIVE' && (
                <span className="font-mono font-black text-xs sm:text-sm px-2 py-0.5 bg-primary/90 border border-tertiary rounded text-accent-yellow tabular-nums shrink-0 shadow-inner">
                  {m.homeScore ?? 0}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 group-hover:bg-accent-green transition-colors"></span>
                <span className="font-bold text-white text-xs sm:text-sm group-hover:text-accent-green transition truncate">
                  {m.awayTeam}
                </span>
              </div>
              {m.status === 'LIVE' && (
                <span className="font-mono font-black text-xs sm:text-sm px-2 py-0.5 bg-primary/90 border border-tertiary rounded text-accent-yellow tabular-nums shrink-0 shadow-inner">
                  {m.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto pt-2 md:pt-0 border-t border-tertiary/40 md:border-t-0">
            {quickMarket && quickSlots.length >= 2 ? (
              <div className="flex-1 md:w-72">
                {/* Label-i i market-it — për O/U shfaqet linja bashkë */}
                {quickLabel && quickLabel !== '1X2' && (
                  <div className="text-[9px] font-black uppercase tracking-wider mb-1 pl-1 flex items-baseline gap-1">
                    <span className="text-accent-green/90">{quickLabel}</span>
                    {quick?.mode === 'ou' && quickLine && (
                      <span className="text-white">{quickLine}</span>
                    )}
                  </div>
                )}
                <div className={`grid ${quickCols === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                  {quickSlots.map((slot: any, i: number) =>
                    slot ? (
                      <OddsButton key={slot.id ?? i} match={m} market={quickMarket} outcome={slot} />
                    ) : (
                      <div
                        key={`empty-${i}`}
                        className="px-2.5 py-2 rounded-lg border border-tertiary/50 bg-primary/40 text-text-secondary text-center text-xs font-bold opacity-40 cursor-not-allowed"
                      >
                        —
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-text-secondary italic text-center flex-1 md:w-72">—</div>
            )}

            <button
              onClick={() => setExpandedId(prev => (prev === String(m.id) ? null : String(m.id)))}
              className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 ${
                expandedId === String(m.id)
                  ? 'bg-accent-green text-primary shadow-glow-green'
                  : 'bg-primary/80 hover:bg-tertiary text-text-secondary hover:text-white border border-tertiary/80'
              }`}
              title={t('sections.view_markets')}
              aria-expanded={expandedId === String(m.id)}
            >
              <span>+{totalMarketsCount}</span>
              <ChevronRight
                size={13}
                className={`transition-transform duration-200 ${expandedId === String(m.id) ? 'rotate-90' : ''}`}
              />
            </button>
          </div>
        </div>

        {expandedId === String(m.id) && <MarketPanel match={m} />}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-5 max-w-6xl mx-auto">
      <div className="bg-secondary/70 backdrop-blur-sm border border-tertiary/80 p-3 sm:p-4 rounded-2xl shadow-sm space-y-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search size={16} className="text-text-secondary" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t('common.search_matches')}
            className="w-full bg-primary/80 border border-tertiary/80 rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-text-secondary/70 focus:outline-none focus:border-accent-green transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-secondary hover:text-white transition"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-text-secondary text-xs font-semibold mr-1.5">
            <CalendarDays size={15} />
            <span className="hidden sm:inline">Filter:</span>
          </div>
          <div className="bg-primary/70 p-1 rounded-xl border border-tertiary/60 flex items-center gap-1">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dateFilter === 'all' 
                  ? 'bg-accent-green text-primary shadow-sm' 
                  : 'text-text-secondary hover:text-white hover:bg-tertiary/50'
              }`}
            >
              {t('dates.all')}
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dateFilter === 'today' 
                  ? 'bg-accent-green text-primary shadow-sm' 
                  : 'text-text-secondary hover:text-white hover:bg-tertiary/50'
              }`}
            >
              {t('dates.today')}
            </button>
            <button
              onClick={() => setDateFilter('tomorrow')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dateFilter === 'tomorrow' 
                  ? 'bg-accent-green text-primary shadow-sm' 
                  : 'text-text-secondary hover:text-white hover:bg-tertiary/50'
              }`}
            >
              {t('dates.tomorrow')}
            </button>
          </div>
        </div>
      </div>

      {searchTerm && (
        <div className="text-xs font-semibold text-text-secondary px-1">
          {filteredMatches.length} {t('common.results_found')}
        </div>
      )}

      {searchTerm && filteredMatches.length === 0 && (
        <div className="p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto bg-secondary/50 rounded-2xl border border-tertiary">
          <div className="text-4xl">🔍</div>
          <div className="font-bold text-white text-base">{t('common.no_search_results')}</div>
          <p className="text-xs text-text-secondary">{t('common.try_different_search')}</p>
        </div>
      )}

      {!searchTerm && filteredMatches.length === 0 && (
        <div className="p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto bg-secondary/50 rounded-2xl border border-tertiary">
          <div className="text-4xl">📅</div>
          <div className="font-bold text-white text-base">{t('common.no_matches_date')}</div>
        </div>
      )}

      {filteredMatches.length > 0 && pricedMatches.length === 0 && (
        <div className="p-8 sm:p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto bg-secondary/50 rounded-2xl border border-tertiary">
          <div className="font-bold text-white text-base">
            {t(refreshing ? 'common.feed_refreshing' : 'common.no_results')}
          </div>
          {refreshing && <p className="text-xs text-text-secondary">{t('common.feed_refreshing_hint')}</p>}
        </div>
      )}

      {renderFilterBar()}

      {((viewMode === 'all' || viewMode === 'live') && liveMatches.length > 0 && !tournamentId) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-red"></span>
            </span>
            <span className="text-accent-red font-black text-sm uppercase tracking-wider">{t('sections.live_now')}</span>
            <span className="text-xs text-text-secondary font-bold bg-secondary px-2 py-0.5 rounded-full border border-tertiary">
              {liveMatches.length}
            </span>
          </div>

          <div className="space-y-2.5">
            {liveMatches.map(renderMatchCard)}
          </div>
        </div>
      )}

      {((viewMode === 'all' || viewMode === 'prematch') && prematchMatches.length > 0) && (
        <div className="space-y-3">
          <div className="text-white font-bold text-sm tracking-wide uppercase flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-green"></span>
              <span>{isLiveOnly ? t('sections.live_now') : t('sections.upcoming_fixtures')}</span>
              <span className="text-xs text-text-secondary font-bold bg-secondary px-2 py-0.5 rounded-full border border-tertiary">
                {prematchMatches.length}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {prematchMatches.map(renderMatchCard)}
          </div>
        </div>
      )}
    </div>
  );
}
