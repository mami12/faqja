import { useLanguage } from '../../context/LanguageContext';
import { outcomeLabel, marketLabel } from '../../utils/marketPresentation';
import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';

interface Props { match: Match; market: Market; outcome: Outcome; }

export default function OddsButton({ match, market, outcome }: Props) {
  const { t } = useLanguage();
  const label = outcomeLabel(t, outcome.name);
  const { selections, addSelection, removeSelection } = useBetslip();
  const { oddsDeltas, lockedOutcomes, lockedMarkets, lockedMatches } = useLiveFeed();
  const [currentOdds, setCurrentOdds] = useState(outcome.odds);
  const [flashClass, setFlashClass] = useState('');

  const isSelected = selections.some(s => s.outcomeId === outcome.id);
  // the feed locks prices around a goal or a dangerous attack (its own "status":2) and can close
  // a whole match ("hasOpenOdds":false). Both arrive over the socket now, so the lock is on
  // screen the moment it happens instead of up to 15s later with the REST board.
  const isSuspended =
    outcome.status !== 'ACTIVE' ||
    market.status !== 'ACTIVE' ||
    match.status === 'ENDED' || match.status === 'CANCELLED' ||
    match.isSuspended ||
    lockedOutcomes[outcome.id] === true ||
    lockedMarkets[market.id] === true ||
    lockedMatches[String(match.id)] === true ||
    currentOdds === null || currentOdds === undefined || !Number.isFinite(currentOdds) || currentOdds <= 1;

  useEffect(() => { setCurrentOdds(outcome.odds); }, [outcome.id, outcome.odds]);
  const delta = oddsDeltas[outcome.id];
  useEffect(() => {
    if (delta) {
      setCurrentOdds(delta.newOdds);
      setFlashClass(delta.direction === 'up' ? 'animate-flash-green' : 'animate-flash-red');
      const t = setTimeout(() => setFlashClass(''), 1000);
      return () => clearTimeout(t);
    }
  }, [delta, outcome.id]);

  const toggle = () => {
    if (isSuspended) return;
    if (isSelected) {
      removeSelection(outcome.id);
    } else {
      addSelection({
        outcomeId: outcome.id,
        matchId: match.id,
        marketId: market.id,
        outcomeName: outcome.name,
        marketName: market.name,
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        odds: currentOdds
      });
    }
  };

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      title={`${marketLabel(t, market.name)} · ${label}${isSuspended ? ` · ${t('sections.odds_locked')}` : ''}`}
      onClick={toggle}
      disabled={isSuspended}
      className={`group min-w-0 min-h-[40px] relative flex justify-between items-center gap-2 px-2 py-1.5 rounded-md border transition-colors duration-150 select-none ${flashClass} ${
        isSuspended
          ? 'bg-primary/30 border-tertiary/30 opacity-45 cursor-not-allowed'
          : isSelected
          ? 'bg-accent-green/15 border-accent-green/80 text-white'
          : 'bg-primary/70 border-tertiary/70 hover:border-slate-500 hover:bg-tertiary/50 text-text-primary'
      }`}
    >
      <span className={`text-[10px] sm:text-[11px] font-medium truncate transition-colors ${
        isSelected ? 'text-accent-green font-bold' : 'text-text-secondary group-hover:text-slate-200'
      }`} title={label}>
        {label}
      </span>
      <span className={`font-mono font-bold text-xs sm:text-[13px] ml-1 tabular-nums shrink-0 ${
        isSuspended ? 'text-text-secondary' : isSelected ? 'text-white' : 'text-accent-yellow sm:text-text-primary group-hover:text-accent-yellow'
      }`}>
        {isSuspended ? <Lock size={12} className="inline text-text-secondary" /> : currentOdds !== null && currentOdds !== undefined ? currentOdds.toFixed(2) : '-'}
      </span>
    </button>
  );
}
