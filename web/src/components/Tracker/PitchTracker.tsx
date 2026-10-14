import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, Flag, ShieldAlert } from 'lucide-react';
import { useLiveFeed, useLivePatch } from '../../api/liveFeed';
import { MatchEvent } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
}

/**
 * Compact secondary information for the match page.
 * The primary MatchDetail header already shows the teams, score and minute.
 * Do not duplicate that scoreboard here.
 */
export default function PitchTracker({ matchId, homeTeam, awayTeam }: Props) {
  const { t } = useLanguage();
  const patch = useLivePatch(matchId);
  const { matchEvents } = useLiveFeed();
  const [showEvents, setShowEvents] = useState(false);

  const corners = patch?.corners;
  const cards = patch?.cards;
  const events: MatchEvent[] = (matchEvents ?? []).filter(e => e.matchId === String(matchId));

  // Some providers send the same event more than once. Keep one line per actual occurrence.
  const seen = new Set<string>();
  const recentEvents = [...events].reverse().filter(e => {
    const key = [e.minute, e.type, e.team, e.text].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);

  if (!corners && !cards && recentEvents.length === 0) return null;

  return (
    <section className="overflow-hidden border border-tertiary bg-secondary text-xs" aria-label="Statistikat live">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-[#25303e] px-3 py-2">
        {corners && (
          <div className="flex items-center gap-2" title={`${homeTeam} / ${awayTeam}`}>
            <Flag size={14} className="text-text-secondary" />
            <span className="text-text-secondary">{t('tracker.corners')}</span>
            <strong className="font-mono font-semibold tabular-nums text-white">{corners.home} - {corners.away}</strong>
          </div>
        )}
        {cards && (
          <div className="flex items-center gap-2" title={`${homeTeam} / ${awayTeam}`}>
            <ShieldAlert size={14} className="text-accent-yellow" />
            <span className="text-text-secondary">{t('tracker.cards')}</span>
            <strong className="font-mono font-semibold tabular-nums text-white">{cards.home} - {cards.away}</strong>
          </div>
        )}
        {recentEvents.length > 0 && (
          <button
            type="button"
            onClick={() => setShowEvents(value => !value)}
            aria-expanded={showEvents}
            className="ml-auto flex items-center gap-1.5 py-0.5 font-semibold text-text-secondary hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-yellow"
          >
            <Clock3 size={13}/>
            {t('tracker.timeline')}
            {showEvents ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        )}
      </div>
      {showEvents && recentEvents.length > 0 && (
        <div className="divide-y divide-tertiary/50 border-t border-tertiary bg-[#1b2530]">
          {recentEvents.map((event, i) => (
            <div key={`${event.minute}-${event.type}-${event.team}-${i}`} className="flex items-start gap-3 px-3 py-2">
              <span className="w-9 shrink-0 font-mono font-semibold text-accent-yellow">{event.minute}'</span>
              <span className="min-w-0 break-words text-slate-200">{event.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
