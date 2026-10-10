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

      const completeSlots = (mk: any, slots: (any | null)[]) => {
        const outcomes = mk?.outcomes ?? [];
        const used = new Set(slots.filter(Boolean));
        return slots.map((slot) => {
          if (slot) return slot;
          const fallback = outcomes.find((outcome: any) =>
            !used.has(outcome) && isOutcomeAvailable(outcome),
          );
          if (fallback) used.add(fallback);
          return fallback ?? null;
        });
      };

      const m1 = (m.markets ?? []).find((mk: any) => is1X2(mk) && isMarketVisible(m, mk, lockedMarkets));
      if (m1) {
        const slots = completeSlots(m1, [
          findOutcome(m1, ['1', 'home', 'w1', 'h', String(m.homeTeam ?? '').toLowerCase()]),
          findOutcome(m1, ['x', 'draw', 'tie', 'wx', 'd']),
          findOutcome(m1, ['2', 'away', 'w2', 'a', String(m.awayTeam ?? '').toLowerCase()]),
        ]);
        return { market: m1, slots, mode: '1x2' };
      }

      const m2 = (m.markets ?? []).find((mk: any) => isBothScore(mk) && isMarketVisible(m, mk, lockedMarkets));
      if (m2) {
        const slots = completeSlots(m2, [
          findOutcome(m2, ['yes', 'gg']),
          findOutcome(m2, ['no', 'ng']),
        ]);
        return { market: m2, slots, mode: 'btts' };
      }

      const m3 = (m.markets ?? []).find((mk: any) => isOverUnder(mk) && isMarketVisible(m, mk, lockedMarkets));
      if (m3) {
        const slots = completeSlots(m3, [
          findOutcome(m3, ['over', 'o']),
          findOutcome(m3, ['under', 'u']),
        ]);
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
      : quick?.mode === 'btts' ? `${t('outcomes.yes')}/${t('outcomes.no')}`
      : quick?.mode === 'ou' ? `${t('outcomes.over')}/${t('outcomes.under')}`
      : '';

    const quickCols = quick?.mode === '1x2' ? 3 : 2;
    const isLocked = lockedMatches[String(m.id)] === true;

    const totalMarketsCount = Math.max(m.markets?.length || 0, Number(m.marketCount) || 0);

    return (
      <div 
        key={m.id} 
        className="group overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-b from-[#111b2a] to-[#0d1522] shadow-xl shadow-slate-950/20 transition-all duration-200 hover:border-emerald-500/30 hover:shadow-emerald-500/10"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-[#131d2d]/90 px-3.5 py-2.5 text-xs sm:px-4">
          <div className="flex items-center gap-2 truncate text-text-secondary">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            <span className="truncate text-[11px] font-semibold tracking-[0.12em] uppercase text-text-secondary">
              {m.tournament?.category?.name ? `${m.tournament.category.name} • ` : ''}{m.tournament?.name || 'Liga'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLocked && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black text-rose-300"
                title={t('sections.odds_locked')}
              >
                🔒 {t('sections.odds_locked')}
              </span>
            )}
            {m.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
                </span>
                LIVE {m.currentMinute || 0}:{String(m.currentSecond ?? 0).padStart(2, '0')}'
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[#0f1826] px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                <Clock size={12} className="text-text-secondary" />
                {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {new Date(m.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 p-3 sm:p-4 md:flex-row md:items-center">
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
                {quickLabel && quickLabel !== '1X2' && (
                  <div className="mb-1.5 flex items-baseline gap-1 pl-1 text-[9px] font-black uppercase tracking-[0.14em] text-text-secondary">
                    <span className="text-emerald-300">{quickLabel}</span>
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
                        className="cursor-not-allowed rounded-lg border border-white/5 bg-[#0f1727] px-2.5 py-2 text-center text-xs font-bold text-text-secondary opacity-40"
                      >
                        —
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 text-center text-xs italic text-text-secondary md:w-72">—</div>
            )}

            <button
              onClick={() => setExpandedId(prev => (prev === String(m.id) ? null : String(m.id)))}
              className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
                expandedId === String(m.id)
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'border border-white/10 bg-[#0f1826] text-text-secondary hover:border-white/20 hover:text-white'
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
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-5 md:p-6">
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#101a2a] via-[#0d1422] to-[#0b1220] p-4 shadow-2xl shadow-slate-950/30 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">{t('nav.sports')}</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-white sm:text-xl">{t('common.live_betting_board')}</h2>
          </div>
          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300">
            {filteredMatches.length} ndeshje
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <Search size={16} className="text-text-secondary" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t('common.search_matches')}
              className="w-full rounded-2xl border border-white/10 bg-[#111b2a]/90 py-2.5 pl-10 pr-9 text-xs text-white placeholder:text-text-secondary/70 focus:border-emerald-500/50 focus:outline-none sm:text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-secondary transition hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="mr-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
              <CalendarDays size={15} />
              <span className="hidden sm:inline">{t('common.filter')}:</span>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#121b2a] p-1">
              <button
                onClick={() => setDateFilter('all')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                  dateFilter === 'all'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('dates.all')}
              </button>
              <button
                onClick={() => setDateFilter('today')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                  dateFilter === 'today'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('dates.today')}
              </button>
              <button
                onClick={() => setDateFilter('tomorrow')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                  dateFilter === 'tomorrow'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('dates.tomorrow')}
              </button>
            </div>
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
