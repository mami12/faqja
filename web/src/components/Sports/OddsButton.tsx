import { useBetslip } from '../../context/BetslipContext';
import { Match, Market, Outcome } from '../../types';
import { useLiveFeed } from '../../api/liveFeed';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface Props { match: Match; market: Market; outcome: Outcome; }

const getOutcomeLabel = (name: string, t: (key: string) => string) => {
  const raw = String(name ?? '').trim();
  const key = raw.toLowerCase();

  if (['1', 'home', 'home team', 'home win', 'homewin', 'vendas', '1 (vendas)'].includes(key)) return t('outcomes.home');
  if (['x', 'draw', 'tie', 'draw no bet', 'barazim', 'x (barazim)'].includes(key)) return t('outcomes.draw');
  if (['2', 'away', 'away team', 'away win', 'awaywin', 'udhëtues', 'udhetues', '2 (udhëtues)'].includes(key)) return t('outcomes.away');

  if (/(^|\s)(over|mbi|lart)(\s|$)/.test(key) || /^o$/.test(key) || /over\s*\d/.test(key) || /lart\s*\d/.test(key)) return t('outcomes.over');
  if (/(^|\s)(under|nen|nën|posht|poshtë)(\s|$)/.test(key) || /^u$/.test(key) || /under\s*\d/.test(key) || /posht\s*\d/.test(key) || /nën\s*\d/.test(key)) return t('outcomes.under');

  if (/(both teams? to score|shenojne|shënojnë|gg|gj|g\/ng|g\s*\/\s*ng|shënojnë të dyja ekipet|të dyja ekipet shënojnë)/i.test(raw) || /^yes$/i.test(key)) return t('outcomes.yes');
  if (/(no goal|no both teams to score|nuk shenojne|nuk shënojnë|ng|jo gol|jo-gol)/i.test(raw) || /^no$/i.test(key)) return t('outcomes.no');

  if (/\bgoal\b/i.test(raw) && !/no\s*goal|jo\s*gol|nuk\s*shenojne|nuk\s*shënojnë/i.test(raw)) return t('outcomes.yes');
  if (/(no\s*goal|jo\s*gol|nuk\s*shenojne|nuk\s*shënojnë)/i.test(raw)) return t('outcomes.no');

  return raw;
};

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

  const label = getOutcomeLabel(outcome.name, t);

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
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        odds: currentOdds
      });
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={isSuspended}
      className={`group relative flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-150 select-none sm:px-3 ${flashClass} ${
        isSuspended
          ? 'cursor-not-allowed border-tertiary/40 bg-primary/40 opacity-50'
          : isSelected
          ? 'scale-[1.01] border-accent-green bg-accent-green/20 text-white shadow-glow-green'
          : 'border-tertiary/80 bg-primary/80 text-text-primary hover:border-slate-500 hover:bg-tertiary/40 active:scale-[0.98]'
      }`}
    >
      <span
        className={`truncate text-[11px] font-semibold transition-colors sm:text-xs ${
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
