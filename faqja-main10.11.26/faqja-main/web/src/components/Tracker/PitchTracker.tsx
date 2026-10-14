import { useLiveFeed, useLivePatch } from '../../api/liveFeed';
import { MatchEvent } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
}

export default function PitchTracker({ matchId, homeTeam, awayTeam }: Props) {
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
  const cornerTotal = homeCorners + awayCorners;
  const cardTotal = homeCards + awayCards;
  const homeCornerShare = cornerTotal ? (homeCorners / cornerTotal) * 100 : 50;
  const homeCardShare = cardTotal ? (homeCards / cardTotal) * 100 : 50;

  // filter events for this match
  const myEvents: MatchEvent[] = (matchEvents ?? []).filter(e => e.matchId === String(matchId));

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#111c2d] via-[#0f1728] to-[#0b1220] shadow-2xl shadow-slate-950/20">
      {/* Scoreboard Bar */}
      <div className="relative flex items-center justify-between gap-3 overflow-hidden border-b border-white/5 bg-[#0a111d]/60 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1 text-right">
          <span className="block truncate text-xs font-bold text-slate-200 sm:text-sm" title={homeTeam}>{homeTeam}</span>
        </div>

        {isLive ? (
          <div className="mx-1 flex shrink-0 items-center gap-3 sm:mx-3 sm:gap-5">
            <span className="font-mono text-3xl font-black tracking-tight tabular-nums text-white sm:text-4xl">{homeScore}</span>
            <div className="flex flex-col items-center">
              <span className="mb-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300">
                LIVE
              </span>
              <div className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-0.5 font-mono text-xs font-extrabold tabular-nums text-slate-100 sm:text-sm">
                {minute}:{String(second).padStart(2, '0')}'
              </div>
            </div>
            <span className="font-mono text-3xl font-black tracking-tight tabular-nums text-white sm:text-4xl">{awayScore}</span>
          </div>
        ) : (
          <div className="mx-1 flex shrink-0 items-center gap-3 sm:mx-3">
            <span className="font-mono text-2xl font-black tabular-nums text-white sm:text-3xl">{homeScore}</span>
            <span className="text-xs font-bold uppercase text-slate-500">FT</span>
            <span className="font-mono text-2xl font-black tabular-nums text-white sm:text-3xl">{awayScore}</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-slate-200 sm:text-sm" title={awayTeam}>{awayTeam}</span>
        </div>
      </div>

      {/* Live statistics */}
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: t('tracker.corners'), home: homeCorners, away: awayCorners, homeShare: homeCornerShare, accent: 'bg-emerald-400', marker: 'text-emerald-300' },
            { label: t('tracker.cards'), home: homeCards, away: awayCards, homeShare: homeCardShare, accent: 'bg-amber-400', marker: 'text-amber-300' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/5 bg-[#0a111d]/65 p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">{stat.label}</span>
                <span className={`font-mono text-xs font-black tabular-nums ${stat.marker}`}>
                  {stat.home} <span className="text-text-secondary">—</span> {stat.away}
                </span>
              </div>
              <div className="mb-2 flex justify-between gap-3 text-[10px] font-medium text-text-secondary">
                <span className="max-w-[45%] truncate" title={homeTeam}>{homeTeam}</span>
                <span className="max-w-[45%] truncate text-right" title={awayTeam}>{awayTeam}</span>
              </div>
              <div
                className="flex h-2 overflow-hidden rounded-full bg-slate-700/70"
                role="img"
                aria-label={`${stat.label}: ${homeTeam} ${stat.home}, ${awayTeam} ${stat.away}`}
              >
                <div
                  className={`${stat.accent} rounded-full transition-[width] duration-500`}
                  style={{ width: `${stat.homeShare}%` }}
                />
                <div className="flex-1 bg-slate-600/70 transition-[width] duration-500" />
              </div>
            </div>
          ))}
        </div>

        {myEvents.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary px-1">{t('tracker.timeline')}</div>
            <div className="flex flex-wrap gap-2">
              {myEvents.slice(-10).reverse().map((event, i) => (
                <span
                  key={`${event.minute}-${event.type}-${i}`}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
                    event.team === 'home'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      : 'bg-sky-500/10 text-sky-300 border-sky-500/20'
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

      </div>
    </div>
  );
}
