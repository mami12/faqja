import { useLiveFeed, useLivePatch } from '../../api/liveFeed';
import { MatchEvent } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface Props { matchId: string }

export default function PitchTracker({ matchId }: Props) {
  const { t } = useLanguage();
  const patch = useLivePatch(matchId);
  const { matchEvents } = useLiveFeed();

  const isLive = patch?.status === 'LIVE';
  const minute = patch?.currentMinute ?? 0;
  const second = patch?.currentSecond ?? 0;
  const homeScore = patch?.homeScore ?? 0;
  const awayScore = patch?.awayScore ?? 0;
  const homeCorners = patch?.corners?.home ?? 0;
  const awayCorners = patch?.corners?.away ?? 0;
  const homeCards = patch?.cards?.home ?? 0;
  const awayCards = patch?.cards?.away ?? 0;

  // filter events for this match
  const myEvents: MatchEvent[] = (matchEvents ?? []).filter(e => e.matchId === String(matchId));

  return (
    <div className="bg-secondary rounded-xl border border-tertiary overflow-hidden shadow-md">
      {/* Scoreboard Bar */}
      <div className="bg-gradient-to-r from-blue-900/80 via-slate-900 to-red-900/80 px-4 py-3 flex items-center justify-between">
        <div className="flex-1 text-right">
          <span className="text-white font-bold text-sm truncate block max-w-[120px] ml-auto">{/* home */}</span>
        </div>
        {isLive && (
          <div className="flex items-center gap-3 mx-4">
            <span className="text-white font-black text-3xl tabular-nums">{homeScore}</span>
            <div className="text-center">
              <span className="bg-accent-red text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse inline-block mb-0.5">LIVE</span>
              <div className="text-white font-bold text-sm tabular-nums">
                {minute}:{String(second).padStart(2, '0')}'
              </div>
            </div>
            <span className="text-white font-black text-3xl tabular-nums">{awayScore}</span>
          </div>
        )}
        {!isLive && (
          <div className="text-white font-bold text-lg mx-4">
            {homeScore} - {awayScore}
          </div>
        )}
        <div className="flex-1">
          <span className="text-white font-bold text-sm truncate block max-w-[120px]">{/* away */}</span>
        </div>
      </div>
{/* SVG Pitch */}
      <div className="relative w-full aspect-[3/2] bg-emerald-800">
        <svg viewBox="0 0 300 200" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <rect x="0" y="0" width="300" height="200" fill="#2d8a4e" rx="2" />
          <rect x="0" y="0" width="37.5" height="200" fill="#2a8048" />
          <rect x="75" y="0" width="37.5" height="200" fill="#2a8048" />
          <rect x="150" y="0" width="37.5" height="200" fill="#2a8048" />
          <rect x="225" y="0" width="37.5" height="200" fill="#2a8048" />
          <rect x="2" y="2" width="296" height="196" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" rx="2" />
          <line x1="150" y1="2" x2="150" y2="198" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <circle cx="150" cy="100" r="18" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <circle cx="150" cy="100" r="1.5" fill="rgba(255,255,255,0.6)" />
          <rect x="2" y="40" width="35" height="120" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <rect x="2" y="70" width="15" height="60" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <circle cx="25" cy="100" r="1.5" fill="rgba(255,255,255,0.6)" />
          <rect x="0" y="80" width="4" height="40" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <rect x="263" y="40" width="35" height="120" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <rect x="283" y="70" width="15" height="60" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <circle cx="275" cy="100" r="1.5" fill="rgba(255,255,255,0.6)" />
          <rect x="296" y="80" width="4" height="40" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <path d="M2,2 Q6,2 6,6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <path d="M298,2 Q294,2 294,6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <path d="M2,198 Q6,198 6,194" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          <path d="M298,198 Q294,198 294,194" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          {/* corner flags as triangles */}
          <polygon points="6,3 12,1 10,8" fill="#f59e0b" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
          <line x1="6" y1="3" x2="6" y2="12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
          <polygon points="294,3 288,1 290,8" fill="#f59e0b" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
          <line x1="294" y1="3" x2="294" y2="12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
          <polygon points="6,197 12,199 10,192" fill="#f59e0b" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
          <line x1="6" y1="197" x2="6" y2="188" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
          <polygon points="294,197 288,199 290,192" fill="#f59e0b" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
          <line x1="294" y1="197" x2="294" y2="188" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
          {isLive && (
            <>
              <circle cx="150" cy="100" r="3" fill="white" stroke="#333" strokeWidth="0.5" />
              <ellipse cx="150" cy="103" rx="3" ry="1" fill="rgba(0,0,0,0.2)" />
            </>
          )}
          {/* Cards as rectangles */}
          {homeCards > 0 && (
            <g transform="translate(20, 15)">
              {Array.from({ length: Math.min(homeCards, 3) }).map((_, i) => (
                <rect key={`h-y-${i}`} x={i * 8} y="0" width="7" height="10" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="0.5" />
              ))}
            </g>
          )}
          {awayCards > 0 && (
            <g transform="translate(260, 15)">
              {Array.from({ length: Math.min(awayCards, 3) }).map((_, i) => (
                <rect key={`a-y-${i}`} x={i * 8} y="0" width="7" height="10" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="0.5" />
              ))}
            </g>
          )}
          {/* Corner flag counts */}
          {homeCorners > 0 && (
            <g transform="translate(8, 175)">
              <polygon points="0,0 8,3 0,6" fill="#f59e0b" stroke="#d97706" strokeWidth="0.3" />
              <text x="11" y="5" fill="white" fontSize="6" fontWeight="bold">{homeCorners}</text>
            </g>
          )}
          {awayCorners > 0 && (
            <g transform="translate(280, 175)">
              <polygon points="0,0 8,3 0,6" fill="#f59e0b" stroke="#d97706" strokeWidth="0.3" />
              <text x="11" y="5" fill="white" fontSize="6" fontWeight="bold">{awayCorners}</text>
            </g>
          )}
        </svg>
      </div>
{/* Stats & Timeline */}
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-primary/40 rounded-lg p-2 border border-tertiary/50">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-1">{t('tracker.corners')}</div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-xs">{homeCorners}</span>
              <span className="text-text-secondary text-[10px]">vs</span>
              <span className="font-bold text-white text-xs">{awayCorners}</span>
            </div>
          </div>
          <div className="bg-primary/40 rounded-lg p-2 border border-tertiary/50">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-1">{t('tracker.cards')}</div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-xs">{homeCards}</span>
              <span className="text-text-secondary text-[10px]">vs</span>
              <span className="font-bold text-white text-xs">{awayCards}</span>
            </div>
          </div>
        </div>

        {myEvents.length > 0 && (
          <div>
            <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-1.5">Timeline</div>
            <div className="flex flex-wrap gap-1.5">
              {myEvents.slice(-10).reverse().map((event, i) => (
                <span
                  key={`${event.minute}-${event.type}-${i}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    event.team === 'home'
                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                      : 'bg-red-500/10 text-red-300 border-red-500/20'
                  }`}
                >
                  <span className="font-mono">{event.minute}'</span>
                  <span>{event.text}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {!isLive && !patch && (
          <div className="text-center py-6 text-text-secondary text-xs">
            <div className="text-2xl mb-1">⚽</div>
            {t('common.no_results')}
          </div>
        )}
      </div>
    </div>
  );
}
