import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';

interface Props { match: Match; market: Market; outcome: Outcome; }

export default function OddsButton({ match, market, outcome }: Props) {
  const { selections, addSelection, removeSelection } = useBetslip();
  const { oddsDeltas, lockedOutcomes, lockedMarkets, lockedMatches } = useLiveFeed();
  const [currentOdds, setCurrentOdds] = useState(outcome.odds);
  const [flashClass, setFlashClass] = useState('');

  const isSelected = selections.some(s => s.outcomeId === outcome.id);
  // the feed locks prices around a goal or a dangerous attack (its own "status":2) and can close
  // a whole match ("hasOpenOdds":false). Both arrive over the socket now, so the lock is on
  // screen the moment it happens instead of up to 15s later with the REST board.
  const isSuspended =
    outcome.status === 'SUSPENDED' ||
    market.status === 'SUSPENDED' ||
    match.isSuspended ||
    lockedOutcomes[outcome.id] === true ||
    lockedMarkets[market.id] === true ||
    lockedMatches[String(match.id)] === true ||
    currentOdds === null || currentOdds === undefined;

  useEffect(() => {
    const delta = oddsDeltas[outcome.id];
    if (delta) {
      setCurrentOdds(delta.newOdds);
      setFlashClass(delta.direction === 'up' ? 'animate-flash-green' : 'animate-flash-red');
      const t = setTimeout(() => setFlashClass(''), 1000);
      return () => clearTimeout(t);
    }
  }, [oddsDeltas, outcome.id]);

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
      onClick={toggle}
      disabled={isSuspended}
      className={`group relative flex justify-between items-center px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg border transition-all duration-150 select-none ${flashClass} ${
        isSuspended
          ? 'bg-primary/40 border-tertiary/40 opacity-50 cursor-not-allowed'
          : isSelected
          ? 'bg-accent-green/20 border-accent-green text-white shadow-glow-green scale-[1.01]'
          : 'bg-primary/80 border-tertiary/80 hover:border-slate-500 hover:bg-tertiary/40 text-text-primary active:scale-[0.98]'
      }`}
    >
      <span className={`text-[11px] sm:text-xs font-semibold truncate transition-colors ${
        isSelected ? 'text-accent-green font-bold' : 'text-text-secondary group-hover:text-slate-200'
      }`} title={outcome.name}>
        {outcome.name}
      </span>
      <span className={`font-mono font-black text-xs sm:text-sm ml-1.5 tabular-nums shrink-0 ${
        isSuspended ? 'text-text-secondary' : isSelected ? 'text-white' : 'text-accent-yellow sm:text-text-primary group-hover:text-accent-yellow'
      }`}>
        {isSuspended ? <Lock size={12} className="inline text-text-secondary" /> : currentOdds !== null && currentOdds !== undefined ? currentOdds.toFixed(2) : '-'}
      </span>
    </button>
  );
}
