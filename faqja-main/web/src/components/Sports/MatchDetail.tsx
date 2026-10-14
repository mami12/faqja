import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { Match } from '../../types';
import MarketPanel from './MarketPanel';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch } from '../../api/liveFeed';

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const patch = useLivePatch(id);
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    setMatch(null); setError(false);
    const load = async () => {
      if (!id || pending) return;
      pending = true;
      try {
        const res = await apiClient.get(`/matches/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (active) { setMatch(res.data); setError(false); }
      } catch { if (active) setError(true); }
      finally { pending = false; }
    };
    void load();
    const timer = setInterval(load, 15000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [id, retry]);
  const back = <button type="button" onClick={() => navigate('/')} className="filter-chip inline-flex items-center gap-2"><ArrowLeft size={16} />{t('sections.back_to_matches')}</button>;
  if (!match) return <div className="max-w-5xl mx-auto p-4 space-y-4">{back}<div className="ui-empty" role="status">{t(error ? 'common.load_failed' : 'common.loading')}{error && <button className="filter-chip block mx-auto mt-4" onClick={() => setRetry(n => n + 1)}>{t('common.retry')}</button>}</div></div>;
  const live = { ...match, ...(patch ?? {}) };
  const isLive = live.status === 'LIVE';
  const locale = lang === 'al' ? 'sq-AL' : lang;
  return (
    <div className="max-w-5xl mx-auto px-3 py-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">{back}<span className="text-xs text-text-secondary">{live.tournament?.name || t('sections.league')}</span></div>
      {error && <p role="status" className="text-sm text-amber-300">{t('common.refresh_failed')}</p>}
      <section className="ui-card relative overflow-hidden bg-gradient-to-br from-[#182232] to-[#0d131f] p-4 sm:p-6">
        {isLive && <div className="absolute top-0 inset-x-0 h-0.5 bg-emerald-400" />}
        <div className="text-center mb-5 text-xs text-text-secondary">
          {isLive ? <span className="inline-flex rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 font-semibold">{t('nav.live')} · {live.currentMinute ?? 0}'</span> : live.status === 'PREMATCH' ? new Date(live.startTime).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t(`match_status.${live.status}`)}
        </div>
        <h1 className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm sm:text-lg font-bold">
          <span className="text-right min-w-0 break-words">{live.homeTeam}</span>
          <span className="rounded-xl bg-primary border border-white/5 p-3 sm:px-5 font-mono text-xl sm:text-3xl text-emerald-400">{live.status === 'PREMATCH' ? 'VS' : `${live.homeScore ?? 0} - ${live.awayScore ?? 0}`}</span>
          <span className="min-w-0 break-words">{live.awayTeam}</span>
        </h1>
      </section>
      {isLive && <PitchTracker matchId={live.id} />}
      <MarketPanel key={live.id} match={live} />
    </div>
  );
}
