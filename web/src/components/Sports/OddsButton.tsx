import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOddsButtonLabel, isResultBttsMarket, parseResultBttsOutcome } from '../../utils/sportsbookLabels';

interface Props { match: Match; market: Market; outcome: Outcome; isWide?: boolean; showRawLabel?: boolean; }

export default function OddsButton({ match, market, outcome, isWide, showRawLabel = false }: Props) {
  const { selections, addSelection, removeSelection } = useBetslip();
  const { oddsDeltas, lockedOutcomes, riskLockedOutcomes, lockedMarkets, lockedMatches } = useLiveFeed();
  const { t } = useLanguage();
  const [currentOdds, setCurrentOdds] = useState(outcome.odds);
  const [flashClass, setFlashClass] = useState('');

  const isSelected = selections.some(s => s.outcomeId === outcome.id);
  const unidentifiedMixedOutcome = isResultBttsMarket(market.name) &&
    !parseResultBttsOutcome(outcome.code, match.homeTeam, match.awayTeam) &&
    !parseResultBttsOutcome(outcome.name, match.homeTeam, match.awayTeam);
  // Once the server clears a risk lock, a stale REST status must not keep the
  // choice disabled. Provider/admin locks always remain authoritative.
  const providerSuspended = outcome.feedSuspended ??
    (outcome.status === 'SUSPENDED' && outcome.riskSuspended !== true);
  const autoSuspended = riskLockedOutcomes[outcome.id] ?? outcome.riskSuspended === true;
  const isSuspended =
    unidentifiedMixedOutcome ||
    providerSuspended ||
    autoSuspended ||
    market.status === 'SUSPENDED' ||
    match.isSuspended ||
    lockedOutcomes[outcome.id] === true ||
    lockedMarkets[market.id] === true ||
    lockedMatches[String(match.id)] === true ||
    currentOdds === null || currentOdds === undefined;

  const label = showRawLabel
    ? String(outcome.name || outcome.code || 'Selection').trim()
    : formatOddsButtonLabel(outcome.name, market.name, market.line || market.specifier, t, `${match.homeTeam} vs ${match.awayTeam}`, outcome.code);
  const scoringTimeLabel = !showRawLabel && /\btime\s+of\s+scoring\b|\bgoal\s+(?:before|after|in|during|until|by|within|between)\b|\b(?:to\s+score|scores?|scoring)\s+(?:before|after|in|during|until|by|within|between)\b/i.test(market.name);

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
      className={`group relative flex items-center ${scoringTimeLabel ? 'flex-col justify-center gap-1 py-2.5 text-center' : 'justify-between gap-2'} rounded-sm border-0 px-2 py-2 text-left transition-colors duration-150 select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-[-2px] ${flashClass} ${
        isSuspended
          ? 'cursor-not-allowed bg-primary/30 opacity-50'
          : isSelected
          ? 'bg-accent-green/25 text-white'
          : 'bg-primary/40 text-text-primary hover:bg-tertiary/60 active:bg-tertiary/80'
      }`}
    >
      <span
        className={`text-[11px] font-semibold transition-colors sm:text-xs leading-snug ${
          scoringTimeLabel ? 'break-words whitespace-normal line-clamp-3' : isWide || label.length > 10 ? 'break-words line-clamp-2' : 'truncate'
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
