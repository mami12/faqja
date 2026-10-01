import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { PitchState, MatchEvent, OddsDelta } from '../types';

/**
 * Live data comes from our own backend over Socket.IO (same origin, path /socket.io).
 *
 * The backend pushes:
 *   matches:live  - the whole live board (every poll cycle)
 *   odds:update   - only the markets whose price/suspension just changed
 *   match:info    - score / clock / stats for one match
 *
 * This hook translates those into the shapes the UI expects (oddsDeltas, matchEvents),
 * deriving the flash direction by remembering the previous price per outcome.
 */
export function useWebSocket() {
  const [oddsDeltas, setOddsDeltas] = useState<Record<string, OddsDelta>>({});
  const [pitchStates, setPitchStates] = useState<Record<string, PitchState>>({});
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const prevOdds = useRef<Record<string, number>>({});
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => console.log('[socket] connected'));

    socket.on('odds:update', (payload: { matchId: string | number; markets?: any[] }) => {
      const deltas: Record<string, OddsDelta> = {};

      for (const market of payload?.markets ?? []) {
        for (const outcome of market?.outcomes ?? []) {
          if (outcome?.price === null || outcome?.price === undefined) continue;
          const outcomeId = `${payload.matchId}|${market.key}|${market.line ?? ''}|${outcome.key}`;
          const next = Number(outcome.price);
          const before = prevOdds.current[outcomeId];
          prevOdds.current[outcomeId] = next;
          if (before === undefined || before === next) continue;
          deltas[outcomeId] = { outcomeId, newOdds: next, direction: next > before ? 'up' : 'down' };
        }
      }

      if (Object.keys(deltas).length) {
        setOddsDeltas(prev => ({ ...prev, ...deltas }));
      }
    });

    socket.on('match:info', (info: any) => {
      if (!info?.match_id) return;
      const minute = Number.isFinite(Number(info.match_time_ms)) ? Math.floor(Number(info.match_time_ms) / 60000) : 0;
      setMatchEvents(prev => [
        ...prev.slice(-49),
        {
          matchId: String(info.match_id),
          type: info.feed_status ?? 'update',
          minute,
          team: 'home',
          text: `${info.home_score ?? '-'}-${info.away_score ?? '-'}`,
        },
      ]);
    });

    socket.on('connect_error', (e: Error) => console.warn('[socket] connect_error:', e.message));

    return () => {
      socket.close();
    };
  }, []);

  return { oddsDeltas, pitchStates, matchEvents };
}