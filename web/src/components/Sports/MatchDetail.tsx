import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import PitchTracker from '../Tracker/PitchTracker';
import { useLanguage } from '../../context/LanguageContext';
import { useLivePatch } from '../../api/liveFeed';

/** feed market names are already readable; translate the ones we know, keep the rest */
const marketLabel = (t: (key: string) => string, name?: string) => {
  if (!name) return '';
  const key = `markets.${name}`;
  const translated = t(key);
  return translated === key ? name : translated;
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
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-secondary hover:text-accent-green transition text-sm font-semibold"
      >
        <ArrowLeft size={16} /> Back to matches
      </button>

      <div className="bg-secondary p-6 rounded-lg text-center shadow-lg border border-tertiary">
        {live.status === 'LIVE' && (
          <span className="bg-accent-red text-white text-xs px-2 py-1 rounded animate-pulse mb-2 inline-block">
            LIVE {live.currentMinute || 0}'{live.period ? ` · ${live.period}` : ''}
          </span>
        )}
        <div className="flex justify-between items-center px-12">
          <h2 className="text-2xl font-bold text-white flex-1 text-right">{live.homeTeam}</h2>
          <div className="text-3xl font-bold text-accent-yellow mx-8">
            {live.status === 'LIVE' ? `${live.homeScore ?? 0} - ${live.awayScore ?? 0}` : 'vs'}
          </div>
          <h2 className="text-2xl font-bold text-white flex-1 text-left">{live.awayTeam}</h2>
        </div>
        <div className="text-text-secondary mt-2">{new Date(live.startTime).toLocaleString()}</div>

        {/* the feed's own live counters */}
        {(live.corners || live.cards) && (
          <div className="mt-3 flex items-center justify-center gap-6 text-xs text-text-secondary">
            {live.corners && (
              <span>
                {t('markets.corners')}:{' '}
                <span className="font-bold text-white">
                  {live.corners.home} - {live.corners.away}
                </span>
              </span>
            )}
            {live.cards && (
              <span>
                {t('markets.cards')}:{' '}
                <span className="font-bold text-white">
                  {live.cards.home} - {live.cards.away}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {live.status === 'LIVE' && <PitchTracker matchId={live.id} />}

      <div className="space-y-4">
        {markets.map(market => (
          <div key={market.id} className="bg-secondary rounded-xl border border-tertiary overflow-hidden shadow-md">
            <div className="bg-tertiary/70 px-4 py-2.5 font-bold text-sm text-white flex items-center justify-between">
              <span>
                {marketLabel(t, market.name) || t('markets.market')}
                {market.line ? ` ${market.line}` : ''}
              </span>
              <span className={`text-xs font-medium ${market.status === 'SUSPENDED' ? 'text-accent-red' : 'text-accent-green'}`}>
                {market.status === 'SUSPENDED' ? '🔒' : 'Active'}
              </span>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              {(market as any).outcomes?.map((outcome: any) => (
                <OddsButton 
                  key={outcome.id} 
                  match={match} 
                  market={market} 
                  outcome={outcome} 
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
