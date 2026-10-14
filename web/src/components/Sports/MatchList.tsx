import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Match } from '../../types';
import OddsButton from './OddsButton';
import { useLiveFeed } from '../../api/liveFeed';
import { useNavigate } from 'react-router-dom';
import { Radio, ChevronRight, Clock, Shield, Search, CalendarDays, Star, Bell, BellRing } from 'lucide-react';
import { filterDecidedOutcomes, isMarketVisible, isOutcomeAvailable } from '../../utils/marketExpiry';
import { isHandicapMarket, isMainFootballMatch } from '../../utils/sportsbookFilters';
import { useFavorites } from '../../context/FavoritesContext';

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
  const [viewMode, setViewMode] = useState<'all' | 'live' | 'prematch' | 'favorites'>('all');
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite, isAlertEnabled, toggleAlert } = useFavorites();
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

  const mainLeagueMatches = matches.filter(isMainFootballMatch);
  const searchFiltered = searchTerm.trim()
    ? mainLeagueMatches.filter(m => {
        const search = searchTerm.toLowerCase();
        return (
          m.homeTeam?.toLowerCase().includes(search) ||
          m.awayTeam?.toLowerCase().includes(search) ||
          m.tournament?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.sport?.name?.toLowerCase().includes(search)
        );
      })
    : mainLeagueMatches;

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
  const favoriteMatches = pricedMatches.filter(m => isFavorite(String(m.id)));
  const visibleMatches =
    viewMode === 'live' ? liveMatches :
    viewMode === 'prematch' ? prematchMatches :
    viewMode === 'favorites' ? favoriteMatches :
    pricedMatches;

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
    <div className="hidden md:block sticky top-0 z-10 border-y border-tertiary bg-secondary/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#111a20] p-1.5">
          {[
            { id: 'all', label: t('sports.all'), count: pricedMatches.length },
            { id: 'live', label: t('sports.live'), count: liveMatches.length },
            { id: 'prematch', label: t('sports.prematch'), count: prematchMatches.length },
            { id: 'favorites', label: '⭐ Të Preferuarat', count: favoriteMatches.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as any)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all inline-flex items-center gap-1.5 active:scale-95 ${
                viewMode === tab.id
                  ? 'bg-gradient-to-r from-emerald-600 to-accent-green text-primary font-black shadow-md shadow-accent-green/20'
                  : 'border border-white/5 bg-[#202e37] text-text-secondary hover:border-white/10 hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                viewMode === tab.id ? 'bg-primary/30 text-primary' : 'bg-white/5 text-text-secondary'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Render a single compact odds board per competition. All odds still use the
  // existing OddsButton and its live-feed, suspension and betslip behavior.
  const renderMatchCard = (raw: any) => {
    const m = { ...raw, ...(livePatches[String(raw.id)] ?? {}) };
    const markets: any[] = m.markets ?? [];
    const visible = (mk: any) => !isHandicapMarket(mk) && isMarketVisible(m, mk, lockedMarkets) && filterDecidedOutcomes((mk.outcomes ?? []).filter(isOutcomeAvailable), mk, m).length > 0;
    const findMarket = (pattern: RegExp, type?: string) =>
      markets.find((mk: any) => visible(mk) && (!mk.period || mk.period === 0) &&
        (type && mk.marketType === type || pattern.test(String(mk.name ?? ''))));
    const main = findMarket(/^(1x2|match result|full time result|winner|moneyline)$/i, '1X2');
    const goals = markets.find((mk: any) => visible(mk) && (!mk.period || mk.period === 0) && (mk.marketType === 'OVER_UNDER' || /total goals|over\/?under|under\/?over|goals over|goal line/i.test(String(mk.name ?? ''))) && (mk.line == null || String(mk.line).includes('2.5'))) ?? null;
    const btts = findMarket(/both teams? to score|both score|btts|gg\/?ng/i);
    const find = (mk: any, names: string[]) => (mk?.outcomes ?? []).find((o: any) => {
      const name = String(o.name ?? '').trim().toLowerCase();
      const code = String(o.code ?? o.key ?? '').trim().toLowerCase();
      return isOutcomeAvailable(o) && filterDecidedOutcomes([o], mk, m).length > 0 && (names.includes(name) || names.includes(code) || names.some(n => n.length > 2 && (name.startsWith(n + ' ') || name.startsWith(n + ' ('))));
    }) ?? null;
    const oneXtwo = [
      find(main, ['1', 'home', 'w1', 'h', String(m.homeTeam ?? '').toLowerCase()]),
      find(main, ['x', 'draw', 'tie', 'wx', 'd']),
      find(main, ['2', 'away', 'w2', 'a', String(m.awayTeam ?? '').toLowerCase()]),
    ];
    const total = [
      find(goals, ['over', 'o', 'over 2.5', 'o2.5']),
      find(goals, ['under', 'u', 'under 2.5', 'u2.5']),
    ];
    const both = [find(btts, ['yes', 'gg']), find(btts, ['no', 'ng'])];
    const marketCount = Math.max(markets.length, Number(m.marketCount) || 0);
    const locked = lockedMatches[String(m.id)] === true;
    const oddsGroup = (mk: any, outcomes: (any | null)[], labels: string[]) => (
      <div className={`grid gap-px bg-[#101720] ${labels.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {labels.map((label, i) => mk && outcomes[i] ? (
          <div key={outcomes[i].id ?? i} className="min-w-0 [&_button]:w-full [&_button]:min-h-[38px] [&_button]:rounded-none [&_button]:bg-[#263140] [&_button]:flex-col [&_button]:items-center [&_button]:justify-center [&_button]:gap-0.5 [&_button]:px-0.5 [&_button]:py-1 [&_button_span:last-child]:text-[14px] [&_button_span]:max-w-full [&_button_span]:text-center">
            <OddsButton match={m} market={mk} outcome={outcomes[i]} />
          </div>
        ) : (
          <div key={label} title={label} className="min-h-[38px] bg-[#202a35] flex items-center justify-center text-text-muted text-xs">—</div>
        ))}
      </div>
    );
    return (
      <div key={m.id} className="border-b border-[#101720] last:border-b-0 bg-[#252e3b] hover:bg-[#303b49] transition-colors">
        <div className="flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <div className="w-9 sm:w-11 shrink-0 text-center text-[9px] font-semibold text-text-secondary tabular-nums">
              {m.status === 'LIVE' ? (
                <span className="text-accent-red">LIVE<br />{m.currentMinute ?? 0}'</span>
              ) : (
                <span>{new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            <button type="button" onClick={() => navigate(`/match/${m.id}`)}
              className="min-w-0 flex-1 text-left py-1 hover:text-accent-green transition-colors" title={`${m.homeTeam} - ${m.awayTeam}`}>
              <span className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-white">
                <span className="block break-words leading-snug">{m.homeTeam}</span>
                {m.status === 'LIVE' && <span className="text-accent-yellow font-mono">{m.homeScore ?? 0}</span>}
              </span>
              <span className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-white mt-1">
                <span className="block break-words leading-snug">{m.awayTeam}</span>
                {m.status === 'LIVE' && <span className="text-accent-yellow font-mono">{m.awayScore ?? 0}</span>}
              </span>
            </button>
            <button type="button" onClick={() => toggleFavorite(String(m.id))} title={isFavorite(String(m.id)) ? 'Hiq nga të preferuarat' : 'Shto te të preferuarat'}
              className={`shrink-0 p-0.5 rounded-sm text-text-secondary hover:text-white ${isFavorite(String(m.id)) ? 'text-amber-400' : 'text-text-secondary hover:text-white'}`}>
              <Star size={14} className={isFavorite(String(m.id)) ? 'fill-amber-400' : ''} />
            </button>
            <button type="button" onClick={() => toggleAlert(String(m.id))} title={isAlertEnabled(String(m.id)) ? 'Çaktivizo njoftimet' : 'Aktivizo njoftimet'}
              className={`shrink-0 p-0.5 rounded-sm text-text-secondary hover:text-white ${isAlertEnabled(String(m.id)) ? 'text-accent-green' : 'text-text-secondary hover:text-white'}`}>
              {isAlertEnabled(String(m.id)) ? <BellRing size={14} /> : <Bell size={14} />}
            </button>
            {locked && <span title={t('sections.odds_locked')} className="text-accent-red text-xs">🔒</span>}
          </div>
          <div className="flex shrink-0 items-center gap-px min-w-0">
            <div className="w-[126px] sm:w-[147px]">
              <div className="hidden text-[10px] font-bold text-center text-text-secondary mb-1">1X2</div>
              {oddsGroup(main, oneXtwo, ['1', 'X', '2'])}
            </div>
            <div className="hidden lg:block w-[128px]">
              <div className="hidden text-[10px] font-bold text-center text-text-secondary mb-1">Over / Under {goals?.line ? String(goals.line) : ''}</div>
              {oddsGroup(goals, total, ['Over', 'Under'])}
            </div>
            <button type="button" onClick={() => navigate(`/match/${m.id}`)}
              title={t('sections.view_markets')}
              className="shrink-0 min-h-[38px] w-7 sm:w-9 rounded-none bg-[#344253] hover:bg-[#435368] text-accent-green text-[10px] font-bold flex items-center justify-center gap-0">
              +{marketCount}<ChevronRight size={13}  />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCompetitionBoards = (items: any[]) => {
    const groups = new Map<string, any[]>();
    items.forEach(m => {
      const key = [m.tournament?.category?.name, m.tournament?.name].filter(Boolean).join(' · ') || t('sections.league');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return Array.from(groups.entries()).map(([league, fixtures]) => (
      <section key={league} className="overflow-hidden rounded-sm border border-[#101720] bg-secondary">
        <div className="flex items-center justify-between px-2 py-1 bg-[#424d5e] border-b border-[#101720]">
          <h3 className="text-xs font-bold text-white truncate">{league}</h3>
          <span className="text-[11px] text-text-secondary tabular-nums">{fixtures.length}</span>
        </div>
        <div className="hidden lg:flex items-center gap-px px-2 py-1 border-b border-tertiary/50 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          <span className="flex-1 min-w-0">Ndeshja</span>
          <span className="w-[147px] text-center">1X2</span>
          <span className="w-[128px] text-center">Over / Under</span>
          <span className="w-9 text-center">+</span>
        </div>
        <div className="flex lg:hidden items-center bg-[#286c3e] px-2 py-1 text-[10px] font-semibold text-white">
          <span className="flex-1 min-w-0">Ndeshja</span>
          <span className="w-[126px] sm:w-[147px] shrink-0 text-center">1 X 2</span>
          <span className="w-7 sm:w-9 shrink-0 text-center">›</span>
        </div>
        {fixtures.map(renderMatchCard)}
      </section>
    ));
  };

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto space-y-1 p-0 sm:p-2 md:space-y-3 md:p-4">
      <div className="hidden md:block overflow-hidden rounded-sm border border-tertiary bg-secondary p-3 sm:p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">{t('nav.sports')}</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-white sm:text-xl">{t('common.live_betting_board')}</h2>
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
              className="w-full rounded-md border border-white/10 bg-[#111a20] py-2.5 pl-10 pr-9 text-xs text-white placeholder:text-text-secondary/70 focus:border-emerald-500/50 focus:outline-none sm:text-sm"
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
            <div className="flex items-center gap-1 rounded-md border border-white/10 bg-[#111a20] p-1">
              <button
                onClick={() => setDateFilter('all')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                  dateFilter === 'all'
                    ? 'bg-emerald-400 text-[#102019] shadow-md shadow-emerald-500/15'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('dates.all')}
              </button>
              <button
                onClick={() => setDateFilter('today')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                  dateFilter === 'today'
                    ? 'bg-emerald-400 text-[#102019] shadow-md shadow-emerald-500/15'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('dates.today')}
              </button>
              <button
                onClick={() => setDateFilter('tomorrow')}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                  dateFilter === 'tomorrow'
                    ? 'bg-emerald-400 text-[#102019] shadow-md shadow-emerald-500/15'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('dates.tomorrow')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Compact two-row mobile search/date and match-status controls. */}
      <div className="md:hidden w-full border-y border-tertiary bg-secondary">
        <div className="flex items-center gap-1.5 border-b border-tertiary p-1.5">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary"/>
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t('common.search_matches')}
              aria-label={t('common.search_matches')}
              className="h-8 w-full min-w-0 border border-tertiary bg-primary py-1 pl-7 pr-2 text-[11px] text-white placeholder:text-text-muted focus:border-accent-yellow focus:outline-none"
            />
          </div>
          <select
            aria-label="Filtro sipas datës"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="h-8 max-w-[105px] shrink-0 border border-tertiary bg-[#394758] px-1.5 text-[11px] font-semibold text-white focus:border-accent-yellow focus:outline-none"
          >
            <option value="all">{t('dates.all')}</option>
            <option value="today">{t('dates.today')}</option>
            <option value="tomorrow">{t('dates.tomorrow')}</option>
          </select>
        </div>
        <div className="flex min-w-0 items-center gap-px overflow-x-auto bg-tertiary">
          {[
            { id: 'all', label: t('sports.all'), count: pricedMatches.length },
            { id: 'live', label: t('sports.live'), count: liveMatches.length },
            { id: 'prematch', label: t('sports.prematch'), count: prematchMatches.length },
            { id: 'favorites', label: '★', count: favoriteMatches.length },
          ].map(tab => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setViewMode(tab.id as 'all' | 'live' | 'prematch' | 'favorites')}
              className={`flex min-w-0 flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-2 py-2 text-[11px] font-semibold transition-colors ${viewMode === tab.id ? 'bg-[#394758] text-accent-yellow' : 'bg-secondary text-slate-300 hover:text-white'}`}
            >
              {tab.label}
              <span className="font-mono text-[10px] text-text-secondary">{tab.count}</span>
            </button>
          ))}
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
          <div className="hidden md:flex items-center gap-2 px-1">
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
            {renderCompetitionBoards(liveMatches)}
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
            {renderCompetitionBoards(prematchMatches)}
          </div>
        </div>
      )}
      {viewMode === 'favorites' && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 px-1 text-xs font-bold text-white">
            <Star size={14} className="text-amber-400" /> Të Preferuarat
            <span className="text-text-secondary">{favoriteMatches.length}</span>
          </div>
          {favoriteMatches.length ? renderCompetitionBoards(favoriteMatches) : (
            <div className="rounded-md border border-tertiary bg-secondary p-8 text-center text-xs text-text-secondary">
              Nuk ka ndeshje të preferuara.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
