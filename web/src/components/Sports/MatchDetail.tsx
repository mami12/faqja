import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch } from '../../api/liveFeed';

/* ------------------------------------------------------------------ */
/* Ndihmës                                                            */
/* ------------------------------------------------------------------ */

/** Clean up any synthetic names from the feed */
const cleanMarketName = (name?: string) => {
  if (!name) return '';
  const s = String(name).trim();
  if (/^cols-?\d+$/i.test(s)) return 'Match Market';
  if (/^total-2$/i.test(s)) return 'Total Goals';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
};

/** feed market names are already readable; translate the ones we know, keep the rest */
const marketLabel = (t: (key: string) => string, name?: string) => {
  if (!name) return '';
  const clean = cleanMarketName(name);
  const key = `markets.${clean}`;
  const translated = t(key);
  return translated === key ? clean : translated;
};

/** Don't display synthetic #1, #2 lines */
const formatLine = (line?: string) => (line && !/^#\d+$/.test(String(line).trim()) ? ` (${line})` : '');

/** Deduplicate outcomes within a single market and filter phantom outcomes */
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

/* ------------------------------------------------------------------ */
/* Kategoritë e market-eve                                            */
/* ------------------------------------------------------------------ */

type Category = 'main' | 'goals' | 'corners' | 'cards' | 'other' | 'all';

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'all', label: 'Të Gjitha', icon: '📋' },
  { key: 'main', label: 'Kryesore', icon: '⭐' },
  { key: 'goals', label: 'Golat', icon: '⚽' },
  { key: 'corners', label: 'Këndet', icon: '🚩' },
  { key: 'cards', label: 'Kartonat', icon: '🟨' },
  { key: 'other', label: 'Të Tjera', icon: '📊' },
];

/** Kthen kategorinë e një market-i */
const categoryOf = (market: Market): Category => {
  const name = String(market.name ?? '').toLowerCase();
  const type = String(market.marketType ?? '').toUpperCase();

  // Këndet
  if (type === 'CORNERS' || /corner/i.test(name)) return 'corners';
  // Kartonat
  if (type === 'CARDS' || /\bcards?\b|booking|yellow|\bred\b/i.test(name)) return 'cards';
  // Golat (Over/Under, Total, BTTS, Next Goal, Correct Score)
  if (
    type === 'OVER_UNDER' ||
    /total|over\/?under|both teams|btts|next goal|correct score|exact|goals/i.test(name)
  ) return 'goals';
  // Kryesore (1X2, Double Chance, Draw No Bet)
  if (
    type === '1X2' ||
    /1x2|match result|full time result|winner|double chance|draw no bet|moneyline/i.test(name)
  ) return 'main';
  // Të tjera
  return 'other';
};

/* ------------------------------------------------------------------ */
/* MatchDetail                                                         */
/* ------------------------------------------------------------------ */

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showTracker, setShowTracker] = useState(false);
  // minute / score / corners / cards pushed over the single shared socket
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

  /* Grupimi dhe filtrimi i market-eve */
  const { categorized, counts } = useMemo(() => {
    const result: Record<Category, Market[]> = {
      main: [], goals: [], corners: [], cards: [], other: [], all: [],
    };
    const c: Record<Category, number> = {
      main: 0, goals: 0, corners: 0, cards: 0, other: 0, all: 0,
    };

    for (const m of markets) {
      const cat = categoryOf(m);
      result[cat].push(m);
      result.all.push(m);
      c[cat]++;
      c.all++;
    }
    return { categorized: result, counts: c };
  }, [markets]);

  /* Filtro sipas kategorisë + search */
  const filteredMarkets = useMemo(() => {
    let list = activeCategory === 'all' ? categorized.all : categorized[activeCategory];
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      list = list.filter(m =>
        String(m.name ?? '').toLowerCase().includes(s) ||
        String(m.marketType ?? '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [activeCategory, categorized, searchTerm]);

  if (!match) {
    return (
      <div className="p-3 sm:p-5 md:p-6 max-w-4xl mx-auto space-y-4">
        {/* Skeleton header */}
        <div className="h-32 bg-secondary/60 rounded-2xl animate-pulse"></div>
        {/* Skeleton markets */}
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-secondary/60 rounded-2xl animate-pulse"></div>
        ))}
      </div>
    );
  }

  const live = { ...match, ...(patch ?? {}) };
  const isLive = live.status === 'LIVE';

  return (
    <div className="p-3 sm:p-5 md:p-6 max-w-4xl mx-auto space-y-4">

      {/* Butoni Kthehu */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 hover:bg-tertiary text-text-secondary hover:text-white border border-tertiary/60 transition text-xs font-bold"
      >
        <ArrowLeft size={14} /> Kthehu
      </button>

      {/* ============ HEADER KOMPAKT ============ */}
      <div className="bg-gradient-to-b from-secondary/95 via-secondary/80 to-primary rounded-2xl shadow-lg border border-tertiary/80 relative overflow-hidden">
        {/* Vija e gjelbër lart */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-accent-green to-teal-400"></div>

        {/* Statusi LIVE */}
        {isLive && (
          <div className="flex justify-center pt-3">
            <span className="inline-flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-black px-2.5 py-0.5 rounded-full">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-red"></span>
              </span>
              LIVE {live.currentMinute || 0}:{String(live.currentSecond ?? 0).padStart(2, '0')}'
              {live.period ? ` · ${live.period}` : ''}
            </span>
          </div>
        )}

        {/* Ekipet + Rezultati */}
        <div className="p-4 sm:p-6 flex items-center justify-between gap-3">
          {/* Vendas */}
          <div className="flex-1 min-w-0 text-center sm:text-right">
            <div className="font-bold text-white text-sm sm:text-lg truncate" title={live.homeTeam}>
              {live.homeTeam}
            </div>
          </div>

          {/* Rezultati */}
          <div className="shrink-0 bg-primary/90 border border-tertiary/90 px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl shadow-inner">
            <div className="font-mono text-xl sm:text-3xl font-black text-accent-yellow tabular-nums whitespace-nowrap">
              {isLive ? `${live.homeScore ?? 0} : ${live.awayScore ?? 0}` : 'VS'}
            </div>
          </div>

          {/* Udhëtues */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="font-bold text-white text-sm sm:text-lg truncate" title={live.awayTeam}>
              {live.awayTeam}
            </div>
          </div>
        </div>

        {/* Data + Ora */}
        <div className="text-text-secondary text-[10px] sm:text-xs flex items-center justify-center gap-1.5 pb-2">
          <span>{new Date(live.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span>&bull;</span>
          <span>{new Date(live.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Statistikat live (corners/cards) */}
        {(live.corners || live.cards) && (
          <div className="mx-4 mb-3 pt-2 border-t border-tertiary/40 flex items-center justify-center gap-2 sm:gap-4 text-[10px] sm:text-xs">
            {live.corners && (
              <span className="bg-primary/50 px-2 py-0.5 rounded-md border border-tertiary/50 text-text-secondary">
                🚩 <span className="font-bold text-white tabular-nums">{live.corners.home} - {live.corners.away}</span>
              </span>
            )}
            {live.cards && (
              <span className="bg-primary/50 px-2 py-0.5 rounded-md border border-tertiary/50 text-text-secondary">
                🟨 <span className="font-bold text-white tabular-nums">{live.cards.home} - {live.cards.away}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ============ PITCH TRACKER (opsional në mobile) ============ */}
      {isLive && (
        <div>
          <button
            onClick={() => setShowTracker(v => !v)}
            className="w-full flex items-center justify-between px-3.5 py-2 bg-secondary/80 hover:bg-secondary border border-tertiary/60 rounded-xl text-xs font-bold text-text-secondary hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              📊 Statistika live të ndeshjes
            </span>
            {showTracker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showTracker && (
            <div className="mt-2">
              <PitchTracker matchId={live.id} />
            </div>
          )}
        </div>
      )}

      {/* ============ NUMËRATOR + FILTRA ============ */}
      <div className="space-y-3">

        {/* Numërator + Search */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-bold text-text-secondary flex items-center gap-2">
            <Filter size={13} className="text-accent-green" />
            <span>{counts.all} market-e</span>
            {isLive && counts.main > 0 && (
              <span className="text-accent-green">• {counts.main} kryesore</span>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Kërko market..."
              className="w-full bg-primary/80 border border-tertiary/70 rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white placeholder-text-muted focus:outline-none focus:border-accent-green transition"
            />
          </div>
        </div>

        {/* Filtrat e kategorive */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
          {CATEGORIES.map(cat => {
            const count = counts[cat.key];
            const isActive = activeCategory === cat.key;
            // Mos shfaq kategori bosh (përveç "Të Gjitha")
            if (cat.key !== 'all' && count === 0) return null;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                  isActive
                    ? 'bg-accent-green text-primary shadow-sm'
                    : 'bg-secondary/80 text-text-secondary hover:text-white hover:bg-tertiary border border-tertiary/60'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                    isActive ? 'bg-primary/20 text-primary' : 'bg-primary/60 text-text-secondary'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ============ MARKET-ET ============ */}
      <div className="space-y-3">
        {filteredMarkets.length === 0 ? (
          <div className="bg-secondary/60 p-8 text-center text-text-secondary rounded-2xl border border-tertiary space-y-2">
            <div className="text-3xl">🔍</div>
            <div className="font-bold text-white text-sm">
              {searchTerm ? 'Nuk u gjet asnjë market' : 'Nuk ka market-e në këtë kategori'}
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-accent-green hover:underline"
              >
                Pastro kërkimin
              </button>
            )}
          </div>
        ) : (
          filteredMarkets.map(market => {
            const cleanOutcomes = dedupeOutcomes((market as any).outcomes ?? [], market.name);
            if (cleanOutcomes.length === 0) return null;
            const title = marketLabel(t, market.name) || t('markets.market');
            const isSuspended = market.status === 'SUSPENDED';
            const category = categoryOf(market);
            const catIcon = CATEGORIES.find(c => c.key === category)?.icon ?? '📊';

            return (
              <div
                key={market.id}
                className="bg-secondary/90 rounded-2xl border border-tertiary/80 overflow-hidden shadow-sm hover:border-slate-600/60 transition"
              >
                {/* Header i market-it */}
                <div className="bg-primary/50 px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between border-b border-tertiary/60 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{catIcon}</span>
                    <span className="font-bold text-xs sm:text-sm text-white truncate" title={title}>
                      {title}
                      {formatLine(market.line)}
                    </span>
                  </div>
                  {isSuspended && (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-accent-red border border-rose-500/20">
                      🔒 Pezulluar
                    </span>
                  )}
                </div>

                {/* Outcomes */}
                <div className={`p-2.5 sm:p-3 grid gap-1.5 sm:gap-2 ${
                  cleanOutcomes.length > 3
                    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                    : cleanOutcomes.length === 3
                      ? 'grid-cols-3'
                      : 'grid-cols-2'
                }`}>
                  {cleanOutcomes.map((outcome: any) => (
                    <OddsButton
                      key={outcome.id}
                      match={match}
                      market={market}
                      outcome={outcome}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
