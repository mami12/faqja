import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch } from '../../api/liveFeed';

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

/** Deduplicate outcomes within a single market */
const dedupeOutcomes = (outcomes: any[] = []) => {
  const seen = new Set<string>();
  const res: any[] = [];
  for (const o of outcomes) {
    const k = String(o.name || o.key || '').trim().toLowerCase().replace(/\s*:\s*/g, ':');
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

  if (!match) return <div className="p-8 text-center text-text-secondary">{t('common.loading')}</div>;

  const live = { ...match, ...(patch ?? {}) };

  return (
    <div className="p-3 sm:p-5 md:p-6 max-w-4xl mx-auto space-y-5">
      <button 
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 hover:bg-tertiary text-text-secondary hover:text-white border border-tertiary/60 transition text-xs font-bold"
      >
        <ArrowLeft size={14} /> Back to matches
      </button>

      {/* Stadium Billboard Header */}
      <div className="bg-gradient-to-b from-secondary/95 via-secondary/80 to-primary p-4 sm:p-7 rounded-2xl text-center shadow-lg border border-tertiary/80 relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-accent-green to-teal-400"></div>

        {live.status === 'LIVE' && (
          <span className="inline-flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black px-3 py-1 rounded-full mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-red"></span>
            </span>
            LIVE {live.currentMinute || 0}:{String(live.currentSecond ?? 0).padStart(2, '0')}'{live.period ? ` · ${live.period}` : ''}
          </span>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-6 px-2 sm:px-6">
          <div className="flex-1 sm:text-right w-full sm:w-auto">
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight">{live.homeTeam}</h2>
          </div>

          <div className="bg-primary/90 border border-tertiary/90 px-4 sm:px-6 py-2 rounded-xl shadow-inner shrink-0">
            <div className="font-mono text-2xl sm:text-4xl font-black text-accent-yellow tabular-nums">
              {live.status === 'LIVE' ? `${live.homeScore ?? 0} : ${live.awayScore ?? 0}` : 'VS'}
            </div>
          </div>

          <div className="flex-1 sm:text-left w-full sm:w-auto">
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight">{live.awayTeam}</h2>
          </div>
        </div>

        <div className="text-text-secondary text-xs mt-4 flex items-center justify-center gap-2">
          <span>{new Date(live.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>&bull;</span>
          <span>{new Date(live.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* the feed's own live counters */}
        {(live.corners || live.cards) && (
          <div className="mt-4 pt-3 border-t border-tertiary/40 flex items-center justify-center gap-4 sm:gap-8 text-xs text-text-secondary">
            {live.corners && (
              <span className="bg-primary/50 px-3 py-1 rounded-lg border border-tertiary/50">
                {t('markets.corners')}:{' '}
                <span className="font-bold text-white tabular-nums">
                  {live.corners.home} - {live.corners.away}
                </span>
              </span>
            )}
            {live.cards && (
              <span className="bg-primary/50 px-3 py-1 rounded-lg border border-tertiary/50">
                {t('markets.cards')}:{' '}
                <span className="font-bold text-white tabular-nums">
                  {live.cards.home} - {live.cards.away}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {live.status === 'LIVE' && <PitchTracker matchId={live.id} />}

      <div className="space-y-3.5">
        {markets.map(market => {
          const cleanOutcomes = dedupeOutcomes((market as any).outcomes ?? []);
          const title = marketLabel(t, market.name) || t('markets.market');
          return (
            <div key={market.id} className="bg-secondary/90 rounded-2xl border border-tertiary/80 overflow-hidden shadow-sm">
              <div className="bg-primary/50 px-4 py-2.5 font-bold text-xs sm:text-sm text-white flex items-center justify-between border-b border-tertiary/60">
                <span className="truncate" title={title}>
                  {title}
                  {formatLine(market.line)}
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${market.status === 'SUSPENDED' ? 'bg-rose-500/10 text-accent-red border border-rose-500/20' : 'bg-emerald-500/10 text-accent-green border border-emerald-500/20'}`}>
                  {market.status === 'SUSPENDED' ? '🔒 Locked' : 'Active'}
                </span>
              </div>
              <div className="p-3 sm:p-4 grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
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
