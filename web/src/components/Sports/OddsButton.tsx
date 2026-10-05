import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';

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
    lockedMatches[String(match.id)] === true;

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
      className={`flex justify-between items-center p-2 sm:p-3 rounded border transition-colors ${flashClass}
        ${isSuspended ? 'bg-tertiary opacity-50 cursor-not-allowed border-transparent' : 
          isSelected ? 'bg-primary border-accent-green text-white' : 'bg-primary border-tertiary hover:border-text-secondary text-text-primary'}`}
    >
      <span className="text-[11px] sm:text-sm truncate">{outcome.name}</span>
      <span className="font-bold text-xs sm:text-sm ml-1 shrink-0">{isSuspended ? '🔒' : currentOdds.toFixed(2)}</span>
    </button>
  );
}
