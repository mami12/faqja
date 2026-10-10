import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Trophy, Sparkles } from 'lucide-react';
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

const getGroupCategory = (name?: string) => {
  const value = String(name ?? '').toLowerCase();
  if (/corner|kendo|kënd|corners/i.test(value)) return 'Corners';
  if (/goal|total|over|under|score|btts|gg|ng|gola|kënd|total/i.test(value)) return 'Goals';
  return 'Popular';
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

interface GroupedMarket {
  baseName: string;
  title: string;
  category: string;
  markets: Market[];
}

const groupMarkets = (markets: Market[], t: any): GroupedMarket[] => {
  const map = new Map<string, Market[]>();

  for (const m of markets) {
    const rawClean = cleanMarketName(m.name);
    const baseKey = rawClean.replace(/[\d\.]+/g, '').trim();

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
      title: marketLabel(t, marketList[0].name),
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
  const categories = [
    { id: 'all', label: t('sports.all') },
    { id: 'Popular', label: t('sports.popular') },
    { id: 'Goals', label: t('sports.goals') },
    { id: 'Corners', label: t('sports.corners') }
  ];

  const groupedMarkets = groupMarkets(markets, t).filter(group =>
    activeTab === 'all' || group.category === activeTab
  );

  const formattedDate = new Date(live.startTime);
  const isLive = live.status === 'LIVE';

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#182232] px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-emerald-500/40 hover:bg-[#1f2d3f] hover:text-white"
        >
          <ArrowLeft size={14} />
          {t('common.back')}
        </button>

        <div className="rounded-full border border-white/10 bg-[#121a2a] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
          {live.tournament?.name || live.tournament?.category?.name || t('common.match')}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#111c2d] via-[#0f1728] to-[#0b1220] p-4 shadow-2xl shadow-slate-950/30 sm:p-5">
        {isLive && (
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          {isLive ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              {t('common.live')} {live.currentMinute || 0}'
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
              {formattedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {formattedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
            <Trophy size={12} />
            {live.tournament?.name || t('common.match')}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center sm:gap-5">
          <div className="text-right">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary/80">{t('sports.home')}</div>
            <h1 className="text-base font-bold tracking-tight text-white sm:text-xl">{live.homeTeam}</h1>
          </div>

          <div className="min-w-[92px] rounded-2xl border border-white/5 bg-[#090e17] px-3 py-2 shadow-inner sm:min-w-[110px]">
            <span className="font-mono text-xl font-black tracking-[0.12em] text-emerald-400 sm:text-2xl">
              {isLive ? `${live.homeScore ?? 0} - ${live.awayScore ?? 0}` : t('common.vs')}
            </span>
          </div>

          <div className="text-left">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary/80">{t('sports.away')}</div>
            <h1 className="text-base font-bold tracking-tight text-white sm:text-xl">{live.awayTeam}</h1>
          </div>
        </div>
      </div>

      {isLive && <PitchTracker matchId={live.id} />}

      <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === cat.id
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'border border-white/5 bg-[#182232] text-text-secondary hover:border-white/10 hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {groupedMarkets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#121a2a] p-6 text-center text-sm text-text-secondary">
            {t('common.no_results')}
          </div>
        ) : (
          groupedMarkets.map((group, idx) => (
            <div key={`${group.baseName}-${idx}`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#131b2b]/80 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/5 bg-[#182232]/55 px-4 py-2.5">
                <div className="flex items-center gap-2 truncate text-xs font-semibold text-white">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <TrendingUp size={12} />
                  </div>
                  <span className="truncate">{group.title}</span>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-text-secondary">
                  {group.markets.length}
                </span>
              </div>

              <div className="space-y-2 p-3">
                {group.markets.map((market) => {
                  const cleanOutcomes = dedupeOutcomes((market as any).outcomes ?? [], market.name);

                  return (
                    <div key={market.id} className="rounded-xl border border-white/5 bg-[#182232]/35 p-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                          {marketLabel(t, market.name) || t('markets.market')}
                        </span>
                        {market.line && (
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                            {market.line}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          ))
        )}
      </div>
    </div>
  );
}
