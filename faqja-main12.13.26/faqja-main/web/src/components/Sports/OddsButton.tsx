import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { translateOutcomeName } from '../../utils/sportsbookLabels';

interface Props { match: Match; market: Market; outcome: Outcome; }

/** Ndryshon emrin e opsionit për shfaqje kompakte (p.sh. "Arsenal to score first goal" → "Arsenal") */
function getShortOutcomeName(outcomeName: string, marketName: string): string {
  const raw = String(outcomeName ?? '').trim();
  const mName = String(marketName ?? '').toLowerCase();

  // Player props / goal scorers: heq pjësën "to score first goal 1st half" etj.
  if (
    mName.includes('first goal') ||
    mName.includes('last goal') ||
    mName.includes('anytime') ||
    mName.includes('scorer') ||
    mName.includes('to score')
  ) {
    return raw
      .replace(/^.*?(?:to score|scorer|will score)\s+/i, '')
      .replace(/\s*(1st|2nd|first|second)\s*half.*$/i, '')
      .replace(/\s*\(.*?\)\s*$/i, '')
      .trim();
  }

  // Correct score: mban "1-0", "2-1" etj.
  if (mName.includes('correct score')) return raw;

  return raw;
}

export default function OddsButton({ match, market, outcome }: Props) {
  const { selections, addSelection, removeSelection } = useBetslip();
  const { oddsDeltas, lockedOutcomes, lockedMarkets, lockedMatches } = useLiveFeed();
  const { t } = useLanguage();
  const [currentOdds, setCurrentOdds] = useState(outcome.odds);
  const [flashClass, setFlashClass] = useState('');

  const isSelected = selections.some(s => s.outcomeId === outcome.id);
  const isSuspended =
    outcome.status === 'SUSPENDED' ||
    market.status === 'SUSPENDED' ||
    match.isSuspended ||
    lockedOutcomes[outcome.id] === true ||
    lockedMarkets[market.id] === true ||
    lockedMatches[String(match.id)] === true ||
    currentOdds === null || currentOdds === undefined;

  const fullLabel = translateOutcomeName(outcome.name, t, market.name);
  const shortLabel = getShortOutcomeName(outcome.name, market.name);

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
        marketName: market.name,
        marketLine: market.line || market.specifier,
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        odds: currentOdds
      });
    }
  };

  // Bet365/Superbet style: dense table cell (h-9 = 36px)
  return (
    <button
      onClick={toggle}
      disabled={isSuspended}
      className={`
        h-9 w-full flex items-center justify-between px-2.5 rounded border text-xs
        transition-colors select-none touch-manipulation
        ${flashClass}
        ${isSuspended
          ? 'bg-[#141b20] border-white/5 opacity-40 cursor-not-allowed'
          : isSelected
          ? 'bg-accent-green/25 border-accent-green text-white font-bold'
          : 'bg-[#18232c] hover:bg-[#202e38] border-white/5 text-slate-300'
        }
      `}
      style={{ touchAction: 'manipulation' }}
      title={fullLabel}
    >
      <span className="truncate text-[11px] font-semibold text-slate-300 pr-1">
        {shortLabel}
      </span>
      <span className="font-mono font-black text-accent-yellow tabular-nums text-xs ml-1 shrink-0">
        {isSuspended ? <Lock size={11} className="inline text-text-secondary" /> : currentOdds !== null && currentOdds !== undefined ? currentOdds.toFixed(2) : '-'}
      </span>
    </button>
  );
}