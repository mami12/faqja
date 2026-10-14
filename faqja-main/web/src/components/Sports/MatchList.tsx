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
  matchMode?: 'all' | 'live' | 'prematch';
}

type DateFilter = 'all' | 'today' | 'tomorrow';

export default function MatchList({ tournamentId, categoryId, sportId, isLiveOnly, matchMode = 'all' }: Props) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { livePatches, lockedMatches, lockedMarkets, feedMode } = useLiveFeed();
  const refreshing = feedMode !== 'live';

  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    setMatches([]); setLoading(true); setError(false); setExpandedId(null);
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const params: Record<string, string> = {};
        if (tournamentId) params.tournamentId = tournamentId;
        if (categoryId) params.categoryId = categoryId;
        if (sportId) params.sportId = sportId;
        const res = await apiClient.get('/matches', { params, signal: controller.signal });
        if (active) { setMatches(Array.isArray(res.data) ? res.data : []); setError(false); }
      } catch { if (active) setError(true); }
      finally { pending = false; if (active) setLoading(false); }
    };
    void load();
    const interval = setInterval(load, 15000);
    return () => { active = false; controller.abort(); clearInterval(interval); };
  }, [tournamentId, categoryId, sportId, retry]);

  const mode = isLiveOnly ? 'live' : matchMode;
  const modeMatches = matches.map(m => ({ ...m, ...(livePatches[String(m.id)] ?? {}) })).filter(m =>
    (m.status === 'LIVE' || m.status === 'PREMATCH') && (mode === 'all' || m.status === (mode === 'live' ? 'LIVE' : 'PREMATCH'))
  );
  const searchFiltered = searchTerm.trim()
    ? modeMatches.filter(m => {
        const search = searchTerm.trim().toLowerCase();
        return (
          m.homeTeam?.toLowerCase().includes(search) ||
          m.awayTeam?.toLowerCase().includes(search) ||
          m.tournament?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.name?.toLowerCase().includes(search) ||
          m.tournament?.category?.sport?.name?.toLowerCase().includes(search)
        );
      })
    : modeMatches;

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
  const prematchMatches = pricedMatches.filter(m => m.status === 'PREMATCH');

  if (loading && matches.length === 0) {
    return (
      <div className="p-12 text-center text-text-secondary flex items-center justify-center gap-2">
        <span className="w-3 h-3 rounded-full bg-accent-green animate-ping"></span>
        {t(refreshing ? 'common.feed_refreshing' : 'common.loading')}
      </div>
    );
  }


  // Render a single compact odds board per competition. All odds still use the
  // existing OddsButton and its live-feed, suspension and betslip behavior.
  const renderMatchCard = (raw: any) => {
    const m = { ...raw, ...(livePatches[String(raw.id)] ?? {}) };
    const markets: any[] = m.markets ?? [];
    const visible = (mk: any) => isMarketVisible(m, mk, lockedMarkets);
    const findMarket = (pattern: RegExp, type?: string) =>
      markets.find((mk: any) => visible(mk) && (!mk.period || mk.period === 0) &&
        (type && mk.marketType === type || pattern.test(String(mk.name ?? ''))));
    const main = findMarket(/^(1x2|match result|full time result|winner|moneyline)$/i, '1X2');
    const goals = markets.find((mk: any) => visible(mk) && (!mk.period || mk.period === 0) && (mk.marketType === 'OVER_UNDER' || /total goals|over\/?under|under\/?over|goals over|goal line/i.test(String(mk.name ?? ''))) && (mk.line == null || String(mk.line).includes('2.5'))) ?? null;
    const btts = findMarket(/both teams? to score|both score|btts|gg\/?ng/i);
    const find = (mk: any, names: string[]) => (mk?.outcomes ?? []).find((o: any) => {
      const name = String(o.name ?? '').trim().toLowerCase();
      const code = String(o.code ?? o.key ?? '').trim().toLowerCase();
      return isOutcomeAvailable(o) && (names.includes(name) || names.includes(code) || names.some(n => n.length > 2 && (name.startsWith(n + ' ') || name.startsWith(n + ' ('))));
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
      <div className="grid grid-cols-3 gap-1 min-w-[174px]">
        {labels.map((label, i) => mk && outcomes[i] ? (
          <OddsButton key={outcomes[i].id ?? i} match={m} market={mk} outcome={outcomes[i]} />
        ) : (
          <div key={label} title={label} className="min-h-[40px] rounded border border-tertiary/40 bg-primary/40 flex items-center justify-center text-text-muted text-xs">—</div>
        ))}
      </div>
    );
    return (
      <div key={m.id} className="border-b border-tertiary/60 last:border-b-0 bg-card-bg hover:bg-card-hover transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-3 min-w-0 lg:flex-[1.4]">
            <div className="w-12 shrink-0 text-center text-[10px] font-semibold text-text-secondary tabular-nums">
              {m.status === 'LIVE' ? (
                <span className="text-accent-red">LIVE<br />{m.currentMinute ?? 0}'</span>
              ) : (
                <span>{new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            <button type="button" onClick={() => navigate(`/match/${m.id}`)}
              className="min-w-0 flex-1 text-left py-1 hover:text-accent-green transition-colors">
              <span className="flex items-center justify-between gap-2 text-xs sm:text-[13px] font-semibold text-white">
                <span className="truncate">{m.homeTeam}</span>
                {m.status === 'LIVE' && <span className="text-accent-yellow font-mono">{m.homeScore ?? 0}</span>}
              </span>
              <span className="flex items-center justify-between gap-2 text-xs sm:text-[13px] font-semibold text-white mt-1">
                <span className="truncate">{m.awayTeam}</span>
                {m.status === 'LIVE' && <span className="text-accent-yellow font-mono">{m.awayScore ?? 0}</span>}
              </span>
            </button>
            {locked && <span title={t('sections.odds_locked')} className="text-accent-red text-xs">🔒</span>}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto pb-1 lg:pb-0">
            <div className="shrink-0 w-[174px]">{oddsGroup(main, oneXtwo, ['1', 'X', '2'])}</div>
            <div className="shrink-0 w-[174px]">{oddsGroup(goals, total, ['Over', 'Under', '—'])}</div>
            <div className="shrink-0 w-[174px]">{oddsGroup(btts, both, ['Yes', 'No', '—'])}</div>
            <button type="button" onClick={() => setExpandedId(prev => prev === String(m.id) ? null : String(m.id))}
              aria-expanded={expandedId === String(m.id)} title={t('sections.view_markets')}
              className="shrink-0 min-h-[40px] px-2 rounded border border-tertiary bg-primary hover:bg-tertiary text-accent-green text-xs font-bold flex items-center gap-1">
              +{marketCount}<ChevronRight size={13} className={expandedId === String(m.id) ? 'rotate-90' : ''} />
            </button>
          </div>
        </div>
        {expandedId === String(m.id) && <div className="border-t border-tertiary/70 p-2 sm:p-3"><MarketPanel match={m} /></div>}
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
      <section key={league} className="overflow-hidden rounded-md border border-tertiary/80 bg-secondary">
        <div className="flex items-center justify-between px-3 py-2 bg-tertiary/50 border-b border-tertiary/70">
          <h3 className="text-xs font-bold text-white truncate">{league}</h3>
          <span className="text-[11px] text-text-secondary tabular-nums">{fixtures.length}</span>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 border-b border-tertiary/50 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          <span className="flex-[1.4] min-w-0">{t('sections.league')}</span>
          <span className="w-[174px] text-center">1X2</span>
          <span className="w-[174px] text-center">Over / Under</span>
          <span className="w-[174px] text-center">BTTS</span>
          <span className="w-[57px] text-center">+</span>
        </div>
        {fixtures.map(renderMatchCard)}
      </section>
    ));
  };

  return (
    <div className="px-3 pb-5 pt-3 sm:px-4 space-y-3 max-w-7xl mx-auto">
      {error && <div role="alert" className="ui-card p-4 text-sm text-amber-300 flex flex-wrap gap-3 items-center justify-between"><span>{t(matches.length ? 'common.refresh_failed' : 'common.load_failed')}</span><button className="filter-chip" onClick={() => setRetry(n => n + 1)}>{t('common.retry')}</button></div>}
      <div className="bg-secondary border border-tertiary/70 p-2.5 sm:p-3 rounded-lg space-y-2.5">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search size={16} className="text-text-secondary" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            aria-label={t('common.search_matches')}
            placeholder={t('common.search_matches')}
            className="w-full bg-primary border border-tertiary/80 rounded-md pl-10 pr-9 py-2 text-xs sm:text-sm text-white placeholder-text-secondary/70 focus:outline-none focus:border-accent-green transition-colors"
          />
          {(searchTerm || dateFilter !== 'all') && <button className="filter-chip" onClick={() => { setSearchTerm(''); setDateFilter('all'); }}>{t('common.reset_filters')}</button>}
      {searchTerm && (
            <button
              aria-label={t('common.clear_search')}
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
            <span className="hidden sm:inline">{t('common.filter')}:</span>
          </div>
          <div className="bg-primary p-1 rounded-md border border-tertiary/60 flex items-center gap-1">
            <button
              aria-pressed={dateFilter === 'all'}
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
              aria-pressed={dateFilter === 'today'}
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
              aria-pressed={dateFilter === 'tomorrow'}
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

      {(searchTerm || dateFilter !== 'all') && <button className="filter-chip" onClick={() => { setSearchTerm(''); setDateFilter('all'); }}>{t('common.reset_filters')}</button>}
      {searchTerm && (
        <div className="text-xs font-semibold text-text-secondary px-1">
          {pricedMatches.length} {t('common.results_found')}
        </div>
      )}

      {searchTerm && filteredMatches.length === 0 && (
        <div className="p-8 sm:p-10 text-center text-text-secondary space-y-3 max-w-md mx-auto bg-secondary/50 rounded-lg border border-tertiary">
          <div className="text-4xl">🔍</div>
          <div className="font-bold text-white text-base">{t('common.no_search_results')}</div>
          <p className="text-xs text-text-secondary">{t('common.try_different_search')}</p>
        </div>
      )}

      {!searchTerm && filteredMatches.length === 0 && (
        <div className="p-8 sm:p-10 text-center text-text-secondary space-y-3 max-w-md mx-auto bg-secondary/50 rounded-lg border border-tertiary">
          <div className="text-4xl">📅</div>
          <div className="font-bold text-white text-base">{t('board.empty')}</div>
        </div>
      )}

      {filteredMatches.length > 0 && pricedMatches.length === 0 && (
        <div className="p-8 sm:p-10 text-center text-text-secondary space-y-3 max-w-md mx-auto bg-secondary/50 rounded-lg border border-tertiary">
          <div className="font-bold text-white text-base">
            {t(refreshing ? 'common.feed_refreshing' : 'common.no_results')}
          </div>
          {refreshing && <p className="text-xs text-text-secondary">{t('common.feed_refreshing_hint')}</p>}
        </div>
      )}

      {liveMatches.length > 0 && (
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
            {renderCompetitionBoards(liveMatches)}
          </div>
        </div>
      )}

      {prematchMatches.length > 0 && (
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
    </div>
  );
}
