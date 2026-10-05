import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Match } from '../../types';
import OddsButton from './OddsButton';
import MarketPanel from './MarketPanel';
import { useLiveFeed } from '../../api/liveFeed';
import { useNavigate } from 'react-router-dom';
import { Radio, ChevronRight, Clock, Shield, Search, CalendarDays } from 'lucide-react';

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
  // which match has its extra markets (corners, cards, totals) open in the list
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t } = useLanguage();
  const navigate = useNavigate();
  // minute / score / corners / cards arrive over the socket, so the list is live between polls
  const { livePatches, lockedMatches, feedMode } = useLiveFeed();
  // idle mode: while the server is filling the board again there is nothing to show yet, and
  // "no matches" would be a lie - the fixtures are coming back in a few seconds
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
    const interval = setInterval(fetchMatches, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [tournamentId, categoryId, sportId, isLiveOnly]);

  // Filter matches by search term
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

  // Filter matches by date (Today / Tomorrow)
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

  // A match the feed has not priced is not bettable: its card used to sit on the board as
  // "Loading..." forever. It is dropped instead, and comes back on its own as soon as prices
  // exist for it - the live board carries marketCount, so this does not wait for the 15s poll.
  const pricedMatches = filteredMatches.filter(m => {
    const patch = livePatches[String(m.id)];
    if (patch?.marketCount && patch.marketCount > 0) return true;
    return (m.markets ?? []).some((mk: any) =>
      (mk.outcomes ?? []).some((o: any) => typeof o.odds === 'number' && o.odds > 0),
    );
  });

  const liveMatches = pricedMatches.filter(m => m.status === 'LIVE');
  const prematchMatches = pricedMatches.filter(m => m.status !== 'LIVE');

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

  const renderMatchCard = (raw: any) => {
    // merge what the socket pushed for this match (live minute, score, corners, cards)
    const m = { ...raw, ...(livePatches[String(raw.id)] ?? {}) };

    const isPriced = (o: any) => typeof o.odds === 'number' && o.odds > 0;
    const pricedOutcomes = (mk: any) => (mk.outcomes ?? []).filter(isPriced);
    const pricedMarkets = (m.markets ?? []).filter((mk: any) => pricedOutcomes(mk).length > 0);

    // Convenience detectors for the fallback chain: each market type is detected by its
    // real name / type first, so one market can never be mistaken for another.
    const is1X2 = (mk: any) =>
      mk.marketType === '1X2' ||
      /1x2|match result|full time result|\bwinner\b|moneyline/i.test(mk.name ?? '');
    const isBothScore = (mk: any) =>
      /both teams? to score|both score|\bbtts\b|\bgg\/?ng\b|\bgg\b|\bng\b/i.test(mk.name ?? '');
    const isOverUnder = (mk: any) =>
      mk.marketType === 'OVER_UNDER' ||
      /total goals|over\/?under|under\/?over|^ou$|goals over|goal line/i.test(mk.name ?? '');

    /** Returns the best market to show on the card. The first market type that exists wins
     *  (1X2 > GG/NG > O/U), even if it has only partial outcomes — missing positions show
     *  a "-" instead of borrowing odds from another market. */
    const pickQuickMarket = (): { market: any; slots: (any | null)[]; mode: '1x2' | 'btts' | 'ou' } | null => {
      const findOutcome = (mk: any, names: string[]) => (mk.outcomes ?? []).find((o: any) => names.includes(o.name));
      // 1) 1X2 — always 3 slots: 1, X, 2
      const m1 = (m.markets ?? []).find(is1X2);
      if (m1) {
        const slots = [
          findOutcome(m1, ['1', 'Home', 'home', 'W1']),
          findOutcome(m1, ['X', 'Draw', 'draw', 'Tie']),
          findOutcome(m1, ['2', 'Away', 'away', 'W2']),
        ];
        return { market: m1, slots, mode: '1x2' };
      }
      // 2) BTTS — always 2 slots: Yes, No
      const m2 = (m.markets ?? []).find(isBothScore);
      if (m2) {
        const slots = [
          findOutcome(m2, ['Yes', 'yes', 'GG', 'gg']),
          findOutcome(m2, ['No', 'no', 'NG', 'ng']),
        ];
        return { market: m2, slots, mode: 'btts' };
      }
      // 3) Over/Under — always 2 slots: Over, Under (or the first 2 priced outcomes)
      const m3 = (m.markets ?? []).find(isOverUnder);
      if (m3) {
        const slots = [
          findOutcome(m3, ['Over', 'over', 'O']),
          findOutcome(m3, ['Under', 'under', 'U']),
        ];
        return { market: m3, slots, mode: 'ou' };
      }
      return null;
    };

    const quick = pickQuickMarket();
    const quickMarket = quick?.market ?? null;
    const quickSlots: (any | null)[] = quick?.slots ?? [];
    // a short label on the "+" row so the user always knows which market the card shows
    const quickLabel = quick?.mode === '1x2' ? '1X2' : quick?.mode === 'btts' ? 'GG/NG' : quick?.mode === 'ou' ? 'O/U' : '';
    const quickCols = quick?.mode === '1x2' ? 3 : 2; // 1X2=3cols, BTTS/O-U=2cols
    const isLocked = lockedMatches[String(m.id)] === true;

    const totalMarketsCount = Math.max(m.markets?.length || 0, Number(m.marketCount) || 0);

    return (
      <div 
        key={m.id} 
        className="bg-secondary rounded-xl border border-tertiary shadow-md hover:border-text-secondary/40 transition overflow-hidden group"
      >
        {/* Card Header: Tournament &amp; Time/Status */}
        <div className="bg-primary/50 px-3 sm:px-4 py-2 border-b border-tertiary/60 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-text-secondary truncate">
            <span className="font-semibold text-text-primary truncate">
              {m.tournament?.category?.name ? `${m.tournament.category.name} - ` : ''}{m.tournament?.name || 'League'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isLocked && (
              <span
                className="inline-flex items-center gap-1 bg-accent-red text-white text-[10px] font-black px-2 py-0.5 rounded-full"
                title={t('sections.odds_locked')}
              >
                🔒 {t('sections.odds_locked')}
              </span>
            )}
            {m.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 bg-accent-red text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                <Radio size={10} />
                LIVE {m.currentMinute || 0}:{String(m.currentSecond ?? 0).padStart(2, '0')}'
              </span>
            ) : (
              <span className="text-text-secondary flex items-center gap-1">
                <Clock size={12} />
                {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {new Date(m.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {/* Card Body: Teams, Score & 1X2 Odds */}
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          {/* Teams & Score (Clickable to detail) */}
          <div 
            className="flex-1 cursor-pointer space-y-1 min-w-0"
            onClick={() => navigate(`/match/${m.id}`)}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs sm:text-sm group-hover:text-accent-green transition truncate pr-1">
                {m.homeTeam}
              </span>
              {m.status === 'LIVE' && (
                <span className="text-accent-yellow font-black text-xs sm:text-sm px-1.5 sm:px-2 py-0.5 bg-primary rounded shrink-0">
                  {m.homeScore ?? 0}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs sm:text-sm group-hover:text-accent-green transition truncate pr-1">
                {m.awayTeam}
              </span>
              {m.status === 'LIVE' && (
                <span className="text-accent-yellow font-black text-xs sm:text-sm px-1.5 sm:px-2 py-0.5 bg-primary rounded shrink-0">
                  {m.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* Main Odds Buttons Column — always uses the same number of slots (3 for 1X2,
              2 for GG/NG or O/U); missing outcomes show a disabled "-" — never borrows
              prices from another market. */}
          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {quickMarket && quickSlots.length >= 2 ? (
              <div className="flex-1 sm:w-64">
                {quickLabel && quickLabel !== '1X2' && (
                  <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-accent-green/80 mb-0.5">
                    {quickLabel}
                  </div>
                )}
                <div className={`grid ${quickCols === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1 sm:gap-1.5`}>
                  {quickSlots.map((slot: any, i: number) =>
                    slot ? (
                      <OddsButton key={slot.id ?? i} match={m} market={quickMarket} outcome={slot} />
                    ) : (
                      <div
                        key={`empty-${i}`}
                        className="p-2 sm:p-3 rounded border border-tertiary bg-primary/40 text-text-secondary text-center text-xs font-bold opacity-50 cursor-not-allowed"
                      >
                        —
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-text-secondary italic text-center flex-1 sm:w-64">—</div>
            )}

            {/* Opens the extra markets (corners, cards, totals, ...) right here */}
            <button
              onClick={() => setExpandedId(prev => (prev === String(m.id) ? null : String(m.id)))}
              className="p-2 sm:p-2.5 bg-tertiary/60 hover:bg-tertiary text-text-secondary hover:text-white rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1 shrink-0"
              title={t('sections.view_markets')}
              aria-expanded={expandedId === String(m.id)}
            >
              <span>+{totalMarketsCount}</span>
              <ChevronRight
                size={12}
                className={`transition-transform ${expandedId === String(m.id) ? 'rotate-90' : ''}`}
              />
            </button>
          </div>
        </div>

        {expandedId === String(m.id) && <MarketPanel match={m} />}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={18} className="text-text-secondary" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder={t('common.search_matches')}
          className="w-full bg-secondary border border-tertiary rounded-xl pl-10 pr-4 py-3 text-white placeholder-text-secondary focus:outline-none focus:border-accent-green transition shadow-md"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-secondary hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Date Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-text-secondary mr-1">
          <CalendarDays size={16} />
        </div>
        <button
          onClick={() => setDateFilter('all')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            dateFilter === 'all' 
              ? 'bg-accent-green text-primary shadow-md' 
              : 'bg-secondary text-text-secondary hover:bg-tertiary hover:text-white border border-tertiary'
          }`}
        >
          {t('dates.all')}
        </button>
        <button
          onClick={() => setDateFilter('today')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            dateFilter === 'today' 
              ? 'bg-accent-green text-primary shadow-md' 
              : 'bg-secondary text-text-secondary hover:bg-tertiary hover:text-white border border-tertiary'
          }`}
        >
          {t('dates.today')}
        </button>
        <button
          onClick={() => setDateFilter('tomorrow')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            dateFilter === 'tomorrow' 
              ? 'bg-accent-green text-primary shadow-md' 
              : 'bg-secondary text-text-secondary hover:bg-tertiary hover:text-white border border-tertiary'
          }`}
        >
          {t('dates.tomorrow')}
        </button>
      </div>

      {/* Search Results Count */}
      {searchTerm && (
        <div className="text-xs text-text-secondary">
          {filteredMatches.length} {t('common.results_found')}
        </div>
      )}

      {/* No search results */}
      {searchTerm && filteredMatches.length === 0 && (
        <div className="p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto">
          <div className="text-4xl">🔍</div>
          <div className="font-bold text-white text-base">{t('common.no_search_results')}</div>
          <p className="text-xs text-text-secondary">{t('common.try_different_search')}</p>
        </div>
      )}

      {/* No matches for selected date */}
      {!searchTerm && filteredMatches.length === 0 && (
        <div className="p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto">
          <div className="text-4xl">📅</div>
          <div className="font-bold text-white text-base">{t('common.no_matches_date')}</div>
        </div>
      )}

      {/* there are fixtures, but the feed has not priced any of them yet */}
      {filteredMatches.length > 0 && pricedMatches.length === 0 && (
        <div className="p-8 sm:p-12 text-center text-text-secondary space-y-3 max-w-md mx-auto">
          <div className="font-bold text-white text-base">
            {t(refreshing ? 'common.feed_refreshing' : 'common.no_results')}
          </div>
          {refreshing && <p className="text-xs text-text-secondary">{t('common.feed_refreshing_hint')}</p>}
        </div>
      )}

      {/* Live Matches Section */}
      {liveMatches.length > 0 && !tournamentId && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-red animate-ping"></span>
            <span className="text-accent-red font-black uppercase">{t('sections.live_now')}</span>
            <span className="text-xs text-text-secondary font-medium">({liveMatches.length})</span>
          </div>

          <div className="space-y-3">
            {liveMatches.map(renderMatchCard)}
          </div>
        </div>
      )}

      {/* Prematch / Upcoming Section */}
      {prematchMatches.length > 0 && (
        <div className="space-y-3">
          <div className="text-white font-bold text-sm tracking-wide uppercase flex items-center justify-between">
            <span>{isLiveOnly ? t('sections.live_now') : t('sections.upcoming_fixtures')} ({prematchMatches.length})</span>
          </div>

          <div className="space-y-3">
            {prematchMatches.map(renderMatchCard)}
          </div>
        </div>
      )}
    </div>
  );
}