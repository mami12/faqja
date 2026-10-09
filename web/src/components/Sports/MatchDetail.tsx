import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, TrendingUp } from 'lucide-react';
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

/** Funksion që grupon tregjet sipas emrit bazë (p.sh. të gjitha linjat e Total Goals bashkë) */
interface GroupedMarket {
  baseName: string;
  title: string;
  markets: Market[];
}

const groupMarkets = (markets: Market[], t: any): GroupedMarket[] => {
  const map = new Map<string, Market[]>();

  for (const m of markets) {
    const rawClean = cleanMarketName(m.name);
    // Heqim numrat ose linjat nga emri bazë që të grupohen bashkë (p.sh. "Total Goals 0.5" bëhet "Total Goals")
    const baseKey = rawClean.replace(/[\d\.]+/g, '').trim();
    
    if (!map.has(baseKey)) {
      map.set(baseKey, []);
    }
    map.get(baseKey)!.push(m);
  }

  const result: GroupedMarket[] = [];
  map.forEach((marketList, baseKey) => {
    // Mund t'i renditim sipas linjës nëse kanë (p.sh. 0.5, 1.5, 2.5)
    marketList.sort((a, b) => parseFloat(a.line || '0') - parseFloat(b.line || '0'));
    
    result.push({
      baseName: baseKey,
      title: marketLabel(t, marketList[0].name),
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
    return <div className="flex items-center justify-center min-h-[50vh] text-text-secondary text-sm font-medium">{t('common.loading')}</div>;
  }

  const live = { ...match, ...(patch ?? {}) };
  const categories = ['all', 'Popular', 'Goals', 'Corners'];

  // Grupojmë tregjet përpara se t'i shfaqim
  const groupedMarkets = groupMarkets(markets, t);

  return (
    <div className="max-w-3xl mx-auto px-3 py-4 sm:p-6 space-y-4">
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

      {/* Scoreboard */}
      <div className="relative bg-gradient-to-br from-[#131b2b] to-[#0d131f] rounded-2xl p-5 border border-white/10 shadow-xl overflow-hidden">
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
              LIVE {live.currentMinute || 0}'
            </div>
          ) : (
            <div className="text-xs text-text-secondary font-medium">
              {new Date(live.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(live.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 text-center my-2">
          <div className="flex-1 text-right">
            <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight">{live.homeTeam}</h1>
          </div>
          <div className="bg-[#090e17] border border-white/5 px-4 py-2 rounded-xl shadow-inner shrink-0 min-w-[80px]">
            <span className="font-mono text-xl sm:text-2xl font-black text-emerald-400 tracking-wider">
              {live.status === 'LIVE' ? `${live.homeScore ?? 0} - ${live.awayScore ?? 0}` : 'VS'}
            </span>
          </div>
          <div className="flex-1 text-left">
            <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight">{live.awayTeam}</h1>
          </div>
        </div>
      </div>

      {live.status === 'LIVE' && <PitchTracker matchId={live.id} />}

      {/* Tabs */}
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

      {/* Lista e Tregjeve të Grupuara brenda 1 Kartele */}
      <div className="space-y-3">
        {groupedMarkets.map((group, idx) => (
          <div key={idx} className="bg-[#131b2b]/80 rounded-2xl border border-white/5 overflow-hidden shadow-sm">
            {/* Header i Grupit (P.sh. Golat Total / Kornerat) */}
            <div className="bg-[#182232]/50 px-4 py-2.5 text-xs font-semibold text-white flex items-center justify-between border-b border-white/5">
              <span className="truncate flex items-center gap-1.5">
                <TrendingUp size={13} className="text-emerald-400" />
                {group.title}
              </span>
            </div>

            {/* Të gjitha linjat e këtij grupi (p.sh. 0.5, 1.5, 2.5) shfaqen brenda kësaj kutie */}
            <div className="p-3 space-y-2">
              {group.markets.map((market) => {
                const cleanOutcomes = dedupeOutcomes((market as any).outcomes ?? [], market.name);
                return (
                  <div key={market.id} className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-[#182232]/30 p-2 rounded-xl border border-white/5">
                    {/* Nëse ka linjë (p.sh. 1.5 ose 2.5), e shfaqim qartë majtas */}
                    {market.line && (
                      <span className="text-xs font-bold text-emerald-400 font-mono px-2">
                        {market.line}
                      </span>
                    )}
                    
                    {/* Butonat e koeficientëve për këtë linjë */}
                    <div className="grid grid-cols-2 gap-2 w-full">
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
        ))}
      </div>
    </div>
  );
}
