import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, TrendingUp, ShieldAlert } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch } from '../../api/liveFeed';

const cleanMarketName = (name?: string) => {
  if (!name) return '';
  const s = String(name).trim();
  if (/^cols-?\d+$/i.test(s)) return 'Match Market';
  if (/^total-2$/i.test(s)) return 'Total Goals';
  if (/^fora-2$/i.test(s)) return 'Handicap';
  return s;
};

const marketLabel = (t: (key: string) => string, name?: string) => {
  if (!name) return '';
  const clean = cleanMarketName(name);
  const key = `markets.${clean}`;
  const translated = t(key);
  return translated === key ? clean : translated;
};

const formatLine = (line?: string) => (line && !/^#\d+$/.test(String(line).trim()) ? ` (${line})` : '');

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

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
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
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary text-sm font-medium">
        {t('common.loading')}
      </div>
    );
  }

  const live = { ...match, ...(patch ?? {}) };

  // Kategoria e tregjeve për tab-et lart (për të shmangur rrëmujën)
  const categories = ['all', 'Popular', 'Goals', 'Halves'];

  return (
    <div className="max-w-3xl mx-auto px-3 py-4 sm:p-6 space-y-4">
      {/* Navbar i thjeshtë me Back */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#182232] hover:bg-[#202d42] text-text-secondary hover:text-white transition text-xs font-semibold border border-white/5 shadow-sm"
        >
          <ArrowLeft size={14} /> Kthehu
        </button>
        <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
          {live.competitionName || 'Ndeshje Sportive'}
        </span>
      </div>

      {/* Seksioni i Rezultatit (Scoreboard - Stil Kazino/Bastore Moderne) */}
      <div className="relative bg-gradient-to-br from-[#131b2b] to-[#0d131f] rounded-2xl p-5 border border-white/10 shadow-xl overflow-hidden">
        {/* Vija e gjelbër/e kuqe në sfond për statusin LIVE */}
        {live.status === 'LIVE' && (
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
        )}

        <div className="flex items-center justify-between mb-4">
          {live.status === 'LIVE' ? (
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full text-emerald-400 text-xs font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              LIVE {live.currentMinute || 0}' {live.period ? `(${live.period})` : ''}
            </div>
          ) : (
            <div className="text-xs text-text-secondary font-medium">
              {new Date(live.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(live.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {/* Statistika e shpejtë e korneve / kartonëve nëse ka */}
          {(live.corners || live.cards) && (
            <div className="flex items-center gap-3 text-[11px] text-text-secondary font-mono">
              {live.corners && <span>C: {live.corners.home}-{live.corners.away}</span>}
              {live.cards && <span>Y/R: {live.cards.home}-{live.cards.away}</span>}
            </div>
          )}
        </div>

        {/* Ekipet dhe Rezultati */}
        <div className="flex items-center justify-between gap-3 text-center my-2">
          <div className="flex-1 text-right">
            <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight leading-snug">{live.homeTeam}</h1>
          </div>

          <div className="bg-[#090e17] border border-white/5 px-4 py-2 rounded-xl shadow-inner shrink-0 min-w-[80px]">
            <span className="font-mono text-xl sm:text-2xl font-black text-emerald-400 tracking-wider">
              {live.status === 'LIVE' ? `${live.homeScore ?? 0} - ${live.awayScore ?? 0}` : 'VS'}
            </span>
          </div>

          <div className="flex-1 text-left">
            <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight leading-snug">{live.awayTeam}</h1>
          </div>
        </div>
      </div>

      {live.status === 'LIVE' && <PitchTracker matchId={live.id} />}

      {/* Tab-et e Kategorizimit të Tregjeve (Clean Filter) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === cat 
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' 
                : 'bg-[#182232] text-text-secondary hover:text-white border border-white/5'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lista e Tregjeve (Markets) - Dizajn i pastër me kartela */}
      <div className="space-y-3">
        {markets.map(market => {
          const cleanOutcomes = dedupeOutcomes((market as any).outcomes ?? [], market.name);
          const title = marketLabel(t, market.name) || t('markets.market');
          
          return (
            <div key={market.id} className="bg-[#131b2b]/80 rounded-2xl border border-white/5 overflow-hidden shadow-sm">
              {/* Header i Tregut */}
              <div className="bg-[#182232]/50 px-4 py-2.5 text-xs font-semibold text-white flex items-center justify-between border-b border-white/5">
                <span className="truncate flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-emerald-400" />
                  {title} {formatLine(market.line)}
                </span>
                
                {market.status === 'SUSPENDED' && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 font-medium">
                    <Lock size={10} /> Locked
                  </span>
                )}
              </div>

              {/* Grid-i i Koeficientëve - Përshtatur për celular dhe desktop */}
              <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
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
        })}
      </div>
    </div>
  );
}
