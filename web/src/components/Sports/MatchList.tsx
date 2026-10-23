import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Match } from '../../types';
import OddsButton from './OddsButton';
import { useLiveFeed } from '../../api/liveFeed';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Star, Bell, BellRing, Filter } from 'lucide-react';
import { filterDecidedOutcomes, isMarketVisible, isOutcomeDisplayable } from '../../utils/marketExpiry';
import { isMainFootballMatch } from '../../utils/sportsbookFilters';
import { isHandicapMarket } from '../../utils/marketCatalog';
import { useFavorites } from '../../context/FavoritesContext';
import { isComboMarket } from '../../utils/comboPolicy';

export type MatchViewMode = 'all' | 'live' | 'prematch' | 'favorites';

interface Props {
  tournamentId?: string;
  categoryId?: string;
  sportId?: string;
  isLiveOnly?: boolean;
  viewMode: MatchViewMode;
  onViewModeChange: (mode: MatchViewMode) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

type DateFilter = 'all' | 'today' | 'tomorrow';

export default function MatchList({ tournamentId, categoryId, sportId, isLiveOnly, viewMode, searchTerm, onSearchChange }: Props) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [mobileDateOpen, setMobileDateOpen] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite, isAlertEnabled, toggleAlert } = useFavorites();
  const { livePatches, lockedMatches, lockedMarkets, lockedOutcomes, riskLockedOutcomes, feedMode, combosEnabled } = useLiveFeed();
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

  // Render a single compact odds board per competition. All odds still use the
  // existing OddsButton and its live-feed, suspension and betslip behavior.
  const renderMatchCard = (raw: any) => {
    const m = { ...raw, ...(livePatches[String(raw.id)] ?? {}) };
    const markets: any[] = m.markets ?? [];
    const visible = (mk: any) => (combosEnabled || !isComboMarket(mk)) && !isHandicapMarket(mk) && isMarketVisible(m, mk, lockedMarkets, lockedOutcomes, riskLockedOutcomes) && filterDecidedOutcomes((mk.outcomes ?? []).filter(isOutcomeDisplayable), mk, m).length > 0;
    const findMarket = (pattern: RegExp, type?: string) =>
      markets.find((mk: any) => visible(mk) && (!mk.period || mk.period === 0) &&
        (type && mk.marketType === type || pattern.test(String(mk.name ?? ''))));
    const main = findMarket(/^(1x2|match result|full time result|winner|moneyline)$/i, '1X2');
    const goals = markets.find((mk: any) => visible(mk) && (!mk.period || mk.period === 0) && (mk.marketType === 'OVER_UNDER' || /total goals|over\/?under|under\/?over|goals over|goal line/i.test(String(mk.name ?? ''))) && (mk.line == null || String(mk.line).includes('2.5'))) ?? null;
    const btts = findMarket(/both teams? to score|both score|btts|gg\/?ng/i);
    const find = (mk: any, names: string[]) => (mk?.outcomes ?? []).find((o: any) => {
      const name = String(o.name ?? '').trim().toLowerCase();
      const code = String(o.code ?? o.key ?? '').trim().toLowerCase();
      return isOutcomeDisplayable(o) && filterDecidedOutcomes([o], mk, m).length > 0 && (names.includes(name) || names.includes(code) || names.some(n => n.length > 2 && (name.startsWith(n + ' ') || name.startsWith(n + ' ('))));
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
      <div className={`grid gap-px bg-[#10151e] ${labels.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {labels.map((label, i) => mk && outcomes[i] ? (
          <div key={outcomes[i].id ?? i} className="min-w-0 [&_button]:w-full [&_button]:min-h-[38px] [&_button]:rounded-none [&_button]:bg-[#28313f] [&_button]:flex-col [&_button]:items-center [&_button]:justify-center [&_button]:gap-0.5 [&_button]:px-0.5 [&_button]:py-1 [&_button_span:last-child]:text-[14px] [&_button_span]:max-w-full [&_button_span]:text-center">
            <OddsButton match={m} market={mk} outcome={outcomes[i]} showRawLabel />
          </div>
        ) : (
          <div key={label} title={label} className="min-h-[38px] bg-[#242d3a] flex items-center justify-center text-text-muted text-xs">—</div>
        ))}
      </div>
    );
    // The tight mobile board mirrors the supplied sportsbook screenshot.
    // Only the actual 1/X/2 outcomes are interactive; other markets live on
    // the match detail page. OddsButton keeps all provider and risk locks.
    const liveMinute = m.currentMinute == null ? '' : String(m.currentMinute).trim();
    const startTime = m.startTime ? new Date(m.startTime) : null;
    const scheduledTime = startTime && !Number.isNaN(startTime.getTime())
      ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';
    const mobileRow = (
      <div className="grid min-h-[56px] grid-cols-[minmax(0,1fr)_repeat(3,53px)_38px] min-[400px]:grid-cols-[minmax(0,1fr)_repeat(3,58px)_42px] border-b border-[#111922] bg-[#242d3b] md:hidden">
        <div className="relative flex min-w-0 items-stretch border-r border-[#111922]">
          <div className="flex w-[39px] shrink-0 flex-col items-center justify-center border-r border-[#111922] px-0.5 text-center font-mono tabular-nums" aria-label={m.status === 'LIVE' ? `Minuta ${liveMinute || 'nuk dihet'}` : `Ora e ndeshjes ${scheduledTime}`}>
            {m.status === 'LIVE' ? (
              <>
                <span className="text-[8px] font-bold leading-tight text-[#35cf68]">LIVE</span>
                <span className="text-[11px] font-black leading-tight text-[#f0d06c]">{liveMinute ? `${liveMinute.replace(/['′]/g, '')}′` : '—'}</span>
              </>
            ) : (
              <span className="text-[10px] font-semibold leading-tight text-[#cbd5e1]">{scheduledTime}</span>
            )}
          </div>
          <button type="button" title={isFavorite(String(m.id)) ? 'Hiq nga të preferuarat' : 'Shto te të preferuarat'}
            aria-label={isFavorite(String(m.id)) ? 'Hiq nga të preferuarat' : 'Shto te të preferuarat'}
            onClick={() => toggleFavorite(String(m.id))}
            className={`absolute bottom-1 left-[41px] z-[1] p-0.5 ${isFavorite(String(m.id)) ? 'text-amber-400' : 'text-[#748093]'}`}>
            <Star size={12} fill={isFavorite(String(m.id)) ? 'currentColor' : 'none'}/>
          </button>
          <button type="button" onClick={() => navigate(`/match/${m.id}`)}
            title={`${m.homeTeam} - ${m.awayTeam}`}
            className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1 pl-4 pr-1.5 text-left text-[12px] leading-tight text-[#d3dce8] hover:bg-[#313d4f]">
            <span className="flex min-w-0 items-center justify-between gap-1">
              <span className="min-w-0 truncate">{m.homeTeam}</span>
              {m.status === 'LIVE' && <span className="shrink-0 font-mono font-bold text-[#00c443]">{m.homeScore ?? 0}</span>}
            </span>
            <span className="flex min-w-0 items-center justify-between gap-1">
              <span className="min-w-0 truncate">{m.awayTeam}</span>
              {m.status === 'LIVE' && <span className="shrink-0 font-mono font-bold text-[#00c443]">{m.awayScore ?? 0}</span>}
            </span>
          </button>
        </div>
        {oneXtwo.map((outcome, i) => (
          <div key={i} className="min-w-0 border-r border-[#111922] [&_button]:h-full [&_button]:min-h-[56px] [&_button]:w-full [&_button]:justify-center [&_button]:rounded-none [&_button]:px-0.5 [&_button]:text-center [&_button_span:first-child]:hidden [&_button_span:last-child]:text-[15px]">
            {main && outcome ? <OddsButton match={m} market={main} outcome={outcome} showRawLabel/> :
              <div className="flex h-full items-center justify-center text-sm text-slate-600">—</div>}
          </div>
        ))}
        <button type="button" onClick={() => navigate(`/match/${m.id}`)}
          title={t('sections.view_markets')} aria-label={`Tregjet e ndeshjes ${m.homeTeam} - ${m.awayTeam}`}
          className="flex h-full items-center justify-center bg-[#293340] text-[#c6d0df] hover:bg-[#39485b]">
          <ChevronRight size={26} strokeWidth={3}/>
        </button>
      </div>
    );
    return (
      <>
        {mobileRow}
        <div key={m.id} className="hidden border-b border-[#10151e] bg-[#262e3b] transition-colors hover:bg-[#343f50] md:block xl:bg-[#252d3a] xl:hover:bg-[#303d4f]">
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
              className="shrink-0 min-h-[38px] w-7 sm:w-9 rounded-none bg-[#414d60] hover:bg-[#536278] text-accent-green text-[10px] font-bold flex items-center justify-center gap-0">
              +{marketCount}<ChevronRight size={13} className="hidden sm:block" />
            </button>
          </div>
        </div>
      </div>
      </>
    );
  };

  const renderCompetitionBoards = (items: any[], sectionTitle = 'Futboll') => {
    const groups = new Map<string, any[]>();
    items.forEach(m => {
      const key = [m.tournament?.category?.name, m.tournament?.name].filter(Boolean).join(' · ') || t('sections.league');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return (
      <>
        {/* Desktop table heading follows the compact dark/green reference layout. */}
        <div className="hidden xl:flex h-[35px] items-stretch border-b border-[#14251b] bg-[#2b6137] text-[11px] font-semibold text-[#e7f3e9]">
          <div className="flex min-w-0 flex-1 items-center border-r border-[#193f25] px-2">
            {sectionTitle}
          </div>
          <div className="flex w-[147px] shrink-0 flex-col items-stretch justify-center border-r border-[#193f25]">
            <span className="text-center leading-4">1x2</span>
            <div className="grid grid-cols-3 text-center leading-4"><span>1</span><span>X</span><span>2</span></div>
          </div>
          <div className="flex w-[128px] shrink-0 flex-col items-stretch justify-center border-r border-[#193f25]">
            <span className="text-center leading-4">TG_L/P</span>
            <div className="grid grid-cols-2 text-center leading-4"><span>Lart</span><span>Poshtë</span></div>
          </div>
          <div className="flex w-9 shrink-0 items-center justify-center" title="Tregjet e tjera">+</div>
        </div>
        <div className="grid h-[35px] grid-cols-[minmax(0,1fr)_repeat(3,53px)_38px] min-[400px]:grid-cols-[minmax(0,1fr)_repeat(3,58px)_42px] items-stretch border-b border-[#101a23] bg-[#285d31] text-[12px] text-[#e4f1e8] md:hidden">
          <div className="flex min-w-0 items-center justify-between gap-1 border-r border-[#16281b] px-1.5">
            <span className="truncate font-semibold">{sectionTitle}</span>
            <span className="shrink-0 text-[#d2e5d5]">{items.length}</span>
          </div>
          <span className="flex items-center justify-center border-r border-[#16281b] font-semibold">1</span>
          <span className="flex items-center justify-center border-r border-[#16281b] font-semibold">X</span>
          <span className="flex items-center justify-center border-r border-[#16281b] font-semibold">2</span>
          <button type="button" onClick={() => setMobileDateOpen(v => !v)}
            aria-label="Filtro ndeshjet sipas datës" aria-expanded={mobileDateOpen}
            className="flex items-center justify-center bg-[#33753c] hover:bg-[#448b4d]">
            <Filter size={19} fill="#e7efe8"/>
          </button>
        </div>
        {mobileDateOpen && (
          <div className="flex gap-1 border-b border-[#151e28] bg-[#405067] px-2 py-2 md:hidden">
            {(['all','today','tomorrow'] as DateFilter[]).map(value => (
              <button type="button" key={value} onClick={() => setDateFilter(value)}
                className={`flex-1 rounded-sm px-2 py-1 text-xs font-semibold ${dateFilter === value ? 'bg-[#e0ad27] text-[#152336]' : 'bg-[#273346] text-white'}`}>
                {value === 'all' ? 'Të gjitha' : value === 'today' ? 'Sot' : 'Nesër'}
              </button>
            ))}
          </div>
        )}
        {Array.from(groups.entries()).map(([league, fixtures]) => (
      <section key={league} className="overflow-hidden rounded-none border border-[#10151e] bg-secondary md:rounded-sm xl:rounded-none xl:bg-[#252d3a]">
        <div className="flex items-center justify-between border-b border-[#10151e] bg-[#414a59] px-2 py-1">
          <h3 className="min-w-0 truncate text-xs font-medium text-[#e4ebf5]">{league.replace(' · ',' / ')}</h3>
          <span className="shrink-0 text-[11px] text-text-secondary tabular-nums">{fixtures.length}</span>
        </div>
        <div className="hidden lg:flex xl:hidden items-center gap-px px-2 py-1 border-b border-tertiary/50 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          <span className="flex-1 min-w-0">Ndeshja</span>
          <span className="w-[147px] text-center">1X2</span>
          <span className="w-[128px] text-center">Over / Under</span>
          <span className="w-9 text-center">+</span>
        </div>
        <div className="hidden md:flex lg:hidden items-center bg-[#424e60] px-2 py-1 text-[10px] font-semibold text-slate-200">
          <span className="flex-1 min-w-0">Ndeshja</span>
          <span className="w-[126px] sm:w-[147px] shrink-0 text-center">1 X 2</span>
          <span className="w-7 sm:w-9 shrink-0 text-center">›</span>
        </div>
        {fixtures.map(renderMatchCard)}
      </section>
        ))}
      </>
    );
  };

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto space-y-1 p-0 sm:p-2 md:space-y-3 md:p-4 xl:max-w-none xl:space-y-1 xl:p-[5px]">
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
            {renderCompetitionBoards(liveMatches, 'Futboll Live')}
          </div>
        </div>
      )}

      {((viewMode === 'all' || viewMode === 'prematch') && prematchMatches.length > 0) && (
        <div className="space-y-3">
          <div className="hidden md:flex text-white font-bold text-sm tracking-wide uppercase items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-green"></span>
              <span>{isLiveOnly ? t('sections.live_now') : t('sections.upcoming_fixtures')}</span>
              <span className="text-xs text-text-secondary font-bold bg-secondary px-2 py-0.5 rounded-full border border-tertiary">
                {prematchMatches.length}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {renderCompetitionBoards(prematchMatches, 'Futboll')}
          </div>
        </div>
      )}
      {viewMode === 'favorites' && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 px-1 text-xs font-bold text-white">
            <Star size={14} className="text-amber-400" /> Të Preferuarat
            <span className="text-text-secondary">{favoriteMatches.length}</span>
          </div>
          {favoriteMatches.length ? renderCompetitionBoards(favoriteMatches, 'Favoritet') : (
            <div className="rounded-md border border-tertiary bg-secondary p-8 text-center text-xs text-text-secondary">
              Nuk ka ndeshje të preferuara.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
