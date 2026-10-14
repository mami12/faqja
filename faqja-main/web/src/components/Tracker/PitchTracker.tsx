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
    <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800/80 overflow-hidden shadow-2xl transition-all duration-300">
      {/* Scoreboard Bar */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-5 py-4 border-b border-slate-800/80 flex items-center justify-between relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5 pointer-events-none" />

        <div className="flex-1 text-right z-10">
          <span className="text-slate-200 font-bold text-xs sm:text-sm truncate block max-w-[130px] ml-auto">{/* home */}</span>
        </div>

        {isLive ? (
          <div className="flex items-center gap-3 sm:gap-5 mx-4 z-10">
            <span className="text-white font-black text-3xl sm:text-4xl tabular-nums tracking-tight drop-shadow-md">{homeScore}</span>
            <div className="flex flex-col items-center">
              <span className="bg-rose-500/20 border border-rose-500/50 text-rose-400 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1 shadow-sm shadow-rose-500/20 animate-pulse">
                LIVE
              </span>
              <div className="text-slate-100 font-mono font-extrabold text-xs sm:text-sm tabular-nums bg-slate-800/60 px-2.5 py-0.5 rounded-lg border border-slate-700/50">
                {minute}:{String(second).padStart(2, '0')}'
              </div>
            </div>
            <span className="text-white font-black text-3xl sm:text-4xl tabular-nums tracking-tight drop-shadow-md">{awayScore}</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 mx-4 z-10">
            <span className="text-white font-black text-2xl sm:text-3xl tabular-nums">{homeScore}</span>
            <span className="text-slate-500 font-bold text-sm uppercase">FT</span>
            <span className="text-white font-black text-2xl sm:text-3xl tabular-nums">{awayScore}</span>
          </div>
        )}

        <div className="flex-1 z-10">
          <span className="text-slate-200 font-bold text-xs sm:text-sm truncate block max-w-[130px]">{/* away */}</span>
        </div>
      </div>

      {/* SVG Pitch - Modernised Styling */}
      <div className="relative w-full aspect-[3/2] bg-[#124e27] max-h-[280px] shadow-inner overflow-hidden">
        <svg viewBox="0 0 300 200" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Pitch background with modern gradient feel */}
          <rect x="0" y="0" width="300" height="200" fill="#155d2b" />
          <rect x="0" y="0" width="37.5" height="200" fill="#125125" />
          <rect x="75" y="0" width="37.5" height="200" fill="#125125" />
          <rect x="150" y="0" width="37.5" height="200" fill="#125125" />
          <rect x="225" y="0" width="37.5" height="200" fill="#125125" />
          
          {/* Pitch Markings */}
          <rect x="2" y="2" width="296" height="196" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" rx="3" />
          <line x1="150" y1="2" x2="150" y2="198" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <circle cx="150" cy="100" r="20" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <circle cx="150" cy="100" r="2" fill="rgba(255,255,255,0.85)" />
          
          {/* Left Penalty & Goal Area */}
          <rect x="2" y="35" width="40" height="130" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <rect x="2" y="70" width="15" height="60" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <circle cx="28" cy="100" r="1.5" fill="rgba(255,255,255,0.85)" />
          <rect x="0" y="80" width="3" height="40" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" rx="1" />

          {/* Right Penalty & Goal Area */}
          <rect x="258" y="35" width="40" height="130" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <rect x="283" y="70" width="15" height="60" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <circle cx="272" cy="100" r="1.5" fill="rgba(255,255,255,0.85)" />
          <rect x="297" y="80" width="3" height="40" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" rx="1" />

          {/* Corner Arcs */}
          <path d="M2,2 Q8,2 8,8" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <path d="M298,2 Q292,2 292,8" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <path d="M2,198 Q8,198 8,192" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <path d="M298,198 Q292,198 292,192" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />

          {/* Corner flags */}
          <polygon points="6,3 13,1 11,8" fill="#fbbf24" stroke="rgba(0,0,0,0.2)" strokeWidth="0.3" />
          <line x1="6" y1="3" x2="6" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
          
          <polygon points="294,3 287,1 289,8" fill="#fbbf24" stroke="rgba(0,0,0,0.2)" strokeWidth="0.3" />
          <line x1="294" y1="3" x2="294" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
          
          <polygon points="6,197 13,199 11,192" fill="#fbbf24" stroke="rgba(0,0,0,0.2)" strokeWidth="0.3" />
          <line x1="6" y1="197" x2="6" y2="188" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
          
          <polygon points="294,197 287,199 289,192" fill="#fbbf24" stroke="rgba(0,0,0,0.2)" strokeWidth="0.3" />
          <line x1="294" y1="197" x2="294" y2="188" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />

          {/* Live indicator on pitch */}
          {isLive && (
            <g className="animate-bounce">
              <circle cx="150" cy="100" r="4.5" fill="#ffffff" stroke="#0f172a" strokeWidth="1" />
              <ellipse cx="150" cy="104" rx="4" ry="1.5" fill="rgba(0,0,0,0.4)" />
            </g>
          )}

          {/* Cards Display on Pitch Corners */}
          {homeCards > 0 && (
            <g transform="translate(18, 14)">
              {Array.from({ length: Math.min(homeCards, 3) }).map((_, i) => (
                <rect key={`h-y-${i}`} x={i * 9} y="0" width="7.5" height="11" rx="1.5" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" />
              ))}
            </g>
          )}
          {awayCards > 0 && (
            <g transform="translate(258, 14)">
              {Array.from({ length: Math.min(awayCards, 3) }).map((_, i) => (
                <rect key={`a-y-${i}`} x={i * 9} y="0" width="7.5" height="11" rx="1.5" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" />
              ))}
            </g>
          )}

          {/* Corner Counts Display */}
          {homeCorners > 0 && (
            <g transform="translate(8, 172)">
              <rect x="0" y="0" width="24" height="14" rx="3" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="0.5" />
              <text x="12" y="10.5" fill="white" fontSize="7" fontWeight="bold" textAnchor="middle">🚩 {homeCorners}</text>
            </g>
          )}
          {awayCorners > 0 && (
            <g transform="translate(268, 172)">
              <rect x="0" y="0" width="24" height="14" rx="3" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="0.5" />
              <text x="12" y="10.5" fill="white" fontSize="7" fontWeight="bold" textAnchor="middle">🚩 {awayCorners}</text>
            </g>
          )}
        </svg>
      </div>

      {/* Stats & Timeline */}
      <div className="p-4 sm:p-5 space-y-4 bg-slate-900/50">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/60 hover:bg-slate-800/80 transition-colors rounded-2xl p-3 border border-slate-700/50 shadow-sm flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
              <span>🚩</span> {t('tracker.corners')}
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="font-mono font-black text-white text-base">{homeCorners}</span>
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">vs</span>
              <span className="font-mono font-black text-white text-base">{awayCorners}</span>
            </div>
          </div>

          <div className="bg-slate-800/60 hover:bg-slate-800/80 transition-colors rounded-2xl p-3 border border-slate-700/50 shadow-sm flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
              <span>🟨</span> {t('tracker.cards')}
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="font-mono font-black text-white text-base">{homeCards}</span>
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">vs</span>
              <span className="font-mono font-black text-white text-base">{awayCards}</span>
            </div>
          </div>
        </div>

        {myEvents.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-400 uppercase tracking-widest font-extrabold px-1">Timeline</div>
            <div className="flex flex-wrap gap-2">
              {myEvents.slice(-10).reverse().map((event, i) => (
                <span
                  key={`${event.minute}-${event.type}-${i}`}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border shadow-sm transition-transform hover:scale-105 ${
                    event.team === 'home'
                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                  }`}
                >
                  <span className="font-mono font-bold px-1.5 py-0.5 rounded-md bg-black/20 text-[11px]">
                    {event.minute}'
                  </span>
                  <span>{event.text}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {!isLive && !patch && (
          <div className="text-center py-8 text-slate-500 text-xs">
            <div className="text-3xl mb-2 opacity-60">⚽</div>
            {t('common.no_results')}
          </div>
        )}
      </div>
    </div>
  );
}
