import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { translateOutcomeName, isResultBttsMarket, parseResultBttsOutcome } from '../../utils/sportsbookLabels';

interface Props { match: Match; market: Market; outcome: Outcome; isWide?: boolean; }

export default function OddsButton({ match, market, outcome, isWide }: Props) {
  const { selections, addSelection, removeSelection } = useBetslip();
  const { oddsDeltas, lockedOutcomes, lockedMarkets, lockedMatches } = useLiveFeed();
  const { t } = useLanguage();
  const [currentOdds, setCurrentOdds] = useState(outcome.odds);
  const [flashClass, setFlashClass] = useState('');

  const isSelected = selections.some(s => s.outcomeId === outcome.id);
  const unidentifiedMixedOutcome = isResultBttsMarket(market.name) &&
    !parseResultBttsOutcome(outcome.code, match.homeTeam, match.awayTeam) &&
    !parseResultBttsOutcome(outcome.name, match.homeTeam, match.awayTeam);
  const isSuspended =
    unidentifiedMixedOutcome ||
    outcome.status === 'SUSPENDED' ||
    market.status === 'SUSPENDED' ||
    match.isSuspended ||
    lockedOutcomes[outcome.id] === true ||
    lockedMarkets[market.id] === true ||
    lockedMatches[String(match.id)] === true ||
    currentOdds === null || currentOdds === undefined;

  const label = translateOutcomeName(outcome.name, t, market.name, `${match.homeTeam} vs ${match.awayTeam}`, outcome.code);

  useEffect(() => {
    const delta = oddsDeltas[outcome.id];
    if (delta) {
      setCurrentOdds(delta.newOdds);
      setFlashClass(delta.direction === 'up' ? 'animate-flash-green' : 'animate-flash-red');
      const timer = setTimeout(() => setFlashClass(''), 1000);
      return () => clearTimeout(timer);
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
        outcomeCode: outcome.code,
        marketName: market.name,
        marketLine: market.line || market.specifier,
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        odds: currentOdds
      });
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={isSuspended}
      className={`group relative flex items-center justify-between gap-2 rounded-sm border-0 px-2 py-2 text-left transition-colors duration-150 select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-[-2px] ${flashClass} ${
        isSuspended
          ? 'cursor-not-allowed bg-primary/30 opacity-50'
          : isSelected
          ? 'bg-accent-green/25 text-white'
          : 'bg-primary/40 text-text-primary hover:bg-tertiary/60 active:bg-tertiary/80'
      }`}
    >
      <span
        className={`text-[11px] font-semibold transition-colors sm:text-xs leading-snug ${
          isWide || label.length > 10 ? 'break-words line-clamp-2' : 'truncate'
        } ${
          isSelected ? 'text-accent-green font-bold' : 'text-text-secondary group-hover:text-slate-200'
        }`}
        title={label}
      >
        {label}
      </span>
      <span className={`shrink-0 font-mono text-xs font-black tabular-nums sm:text-sm ${
        isSuspended ? 'text-text-secondary' : isSelected ? 'text-white' : 'text-accent-yellow group-hover:text-accent-yellow sm:text-text-primary'
      }`}>
        {isSuspended ? <Lock size={12} className="inline text-text-secondary" /> : currentOdds !== null && currentOdds !== undefined ? currentOdds.toFixed(2) : '-'}
      </span>
    </button>
  );
}
