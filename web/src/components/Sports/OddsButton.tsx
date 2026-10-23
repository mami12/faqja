import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOddsButtonLabel, isResultBttsMarket, parseResultBttsOutcome } from '../../utils/sportsbookLabels';
import { marketSelectionLabel } from '../../utils/marketCatalog';
import { isMarketExpired, isCompletedCombinationOutcome } from '../../utils/marketExpiry';
import { isComboMarket } from '../../utils/comboPolicy';
import { multipliedComboPrice } from '../../../../server/ledger/combo-price.mjs';
import { formatOdds } from '../../utils/formatOdds';

interface Props { match: Match; market: Market; outcome: Outcome; isWide?: boolean; showRawLabel?: boolean; }

export default function OddsButton({ match, market, outcome, isWide, showRawLabel = false }: Props) {
  const { selections, addSelection, removeSelection } = useBetslip();
  const { oddsDeltas, lockedOutcomes, riskLockedOutcomes, lockedMarkets, lockedMatches, combosEnabled } = useLiveFeed();
  const { t, lang } = useLanguage();
  const [currentOdds, setCurrentOdds] = useState(outcome.odds);
  const [flashClass, setFlashClass] = useState('');

  const selectedEntry = selections.find(s => s.outcomeId === outcome.id || s.sourceOutcomeIds?.includes(outcome.id));
  const isSelected = Boolean(selectedEntry);
  const unidentifiedMixedOutcome = isResultBttsMarket(market.name) &&
    !parseResultBttsOutcome(outcome.code, match.homeTeam, match.awayTeam) &&
    !parseResultBttsOutcome(outcome.name, match.homeTeam, match.awayTeam);
  // Once the server clears a risk lock, a stale REST status must not keep the
  // choice disabled. Provider/admin locks always remain authoritative.
  const providerSuspended = outcome.feedSuspended ??
    (outcome.status === 'SUSPENDED' && outcome.riskSuspended !== true);
  const autoSuspended = riskLockedOutcomes[outcome.id] ?? outcome.riskSuspended === true;
  const builderLegLocked = (market.builderLegs ?? []).some(part =>
    lockedMarkets[part.marketId] === true ||
    lockedOutcomes[part.outcomeId] === true ||
    riskLockedOutcomes[part.outcomeId] === true);
  const isSuspended =
    (!combosEnabled && isComboMarket(market)) ||
    isMarketExpired(match, market) || isCompletedCombinationOutcome(match, market, outcome) ||
    builderLegLocked ||
    unidentifiedMixedOutcome ||
    providerSuspended ||
    autoSuspended ||
    market.status === 'SUSPENDED' ||
    match.isSuspended ||
    lockedOutcomes[outcome.id] === true ||
    lockedMarkets[market.id] === true ||
    lockedMatches[String(match.id)] === true ||
    currentOdds === null || currentOdds === undefined || !Number.isFinite(currentOdds) || currentOdds <= 1 ||
    (outcome.id.startsWith('BB|') && currentOdds > 1000);

  const label = showRawLabel
    ? marketSelectionLabel(String(outcome.name || outcome.code || 'Selection'), lang)
    : formatOddsButtonLabel(outcome.name, market.name, market.line || market.specifier, t, `${match.homeTeam} vs ${match.awayTeam}`, outcome.code);
  const scoringTimeLabel = !showRawLabel && /\btime\s+of\s+scoring\b|\bgoal\s+(?:before|after|in|during|until|by|within|between)\b|\b(?:to\s+score|scores?|scoring)\s+(?:before|after|in|during|until|by|within|between)\b/i.test(market.name);

  // Both real leg identities are carried with an automatic combo. A socket
  // change updates its product immediately; placement still verifies on server.
  useEffect(() => {
    if (outcome.id.startsWith('BB|')) {
      const legs = market.builderLegs ?? [];
      const quotedAt = Date.parse(market.builderQuotedAt ?? '') || 0;
      const price = legs.length === 2 && legs.every(p => Number.isFinite(p.odds))
        ? multipliedComboPrice(legs.map(part => ({price:(oddsDeltas[part.outcomeId]?.at ?? 0) >= quotedAt
          ? oddsDeltas[part.outcomeId]?.newOdds ?? Number(part.odds) : Number(part.odds)}))) ?? 0
        : outcome.odds;
      setCurrentOdds(price);
    }
  }, [outcome.id, outcome.odds, market.builderLegs, market.builderQuotedAt, oddsDeltas]);

  useEffect(() => {
    const delta = oddsDeltas[outcome.id];
    if (delta) {
      setCurrentOdds(delta.newOdds);
      if (delta.changed === false) return;
      setFlashClass(delta.direction === 'up' ? 'animate-flash-green' : 'animate-flash-red');
      const timer = setTimeout(() => setFlashClass(''), 1000);
      return () => clearTimeout(timer);
    }
  }, [oddsDeltas, outcome.id]);

  const toggle = () => {
    if (isSuspended) return;
    if (isSelected) {
      removeSelection(selectedEntry!.outcomeId);
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
      type="button"
      aria-pressed={isSelected}
      disabled={isSuspended}
      className={`group relative flex items-center ${scoringTimeLabel ? 'flex-col justify-center gap-1 py-2.5 text-center' : 'justify-between gap-2'} rounded-sm border-0 px-2 py-2 text-left transition-colors duration-150 select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-[-2px] ${flashClass} ${
        isSuspended
          ? '!bg-[#29313d] cursor-not-allowed !text-slate-400 opacity-85'
          : isSelected
          ? '!bg-[#347d48] hover:!bg-[#3b9354] text-white ring-2 ring-inset ring-[#f2c04f] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]'
          : 'bg-primary/40 text-text-primary hover:bg-tertiary/60 active:bg-tertiary/80'
      }`}
    >
      <span
        className={`text-[11px] font-semibold transition-colors sm:text-xs leading-snug ${
          scoringTimeLabel ? 'break-words whitespace-normal line-clamp-3' : isWide || label.length > 10 ? 'break-words line-clamp-2' : 'truncate'
        } ${
          isSuspended ? 'text-slate-400' : isSelected ? 'text-white font-extrabold' : 'text-text-secondary group-hover:text-slate-200'
        }`}
        title={label}
      >
        {label}
      </span>
      <span className={`shrink-0 font-mono text-xs font-black tabular-nums sm:text-sm ${
        isSuspended ? 'text-slate-400' : isSelected ? 'text-white' : 'text-accent-yellow group-hover:text-accent-yellow sm:text-text-primary'
      }`}>
        {isSuspended ? <Lock size={14} strokeWidth={2.3} className="inline text-slate-400" aria-label="Koeficient i pezulluar" /> : formatOdds(currentOdds)}
      </span>
    </button>
  );
}
