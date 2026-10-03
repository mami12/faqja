import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Match, MatchEvent, OddsDelta } from '../types';

/**
 * One shared Socket.IO connection for the whole board.
 *
 * Every odds button used to call useWebSocket(), so a board with ~150 matches opened hundreds
 * of sockets (three per card), and the hook listened to odds:update only - which meant the
 * minute, the score, the corners and the cards arrived through the 15s REST poll instead of by
 * push. The provider owns a single connection and publishes:
 *
 *   oddsDeltas  - just the outcomes whose price moved, per outcome id
 *   livePatches - per-match minute / score / corners / cards / status
 *   matchEvents - the last 50 match-info events
 */

/** the pushed state of one match, already in the client's field names */
export interface LivePatch {
  status?: Match['status'];
  currentMinute?: number;
  period?: string | null;
  homeScore?: number;
  awayScore?: number;
  corners?: { home: number; away: number } | null;
  cards?: { home: number; away: number } | null;
  isSuspended?: boolean;
  updatedAt: string;
}

interface LiveFeedValue {
  oddsDeltas: Record<string, OddsDelta>;
  livePatches: Record<string, LivePatch>;
  matchEvents: MatchEvent[];
  connected: boolean;
}

const EMPTY: LiveFeedValue = { oddsDeltas: {}, livePatches: {}, matchEvents: [], connected: false };

const LiveFeedContext = createContext<LiveFeedValue>(EMPTY);

/** drops undefined keys, so spreading a patch over a REST match cannot blank a real value */
const compact = <T extends object>(input: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) out[k] = v;
  return out as T;
};

const cornersOf = (stats: any) => {
  const home = stats?.home?.corners;
  const away = stats?.away?.corners;
  if (home === null || home === undefined) {
    return away === null || away === undefined ? null : { home: 0, away: Number(away) };
  }
  return { home: Number(home), away: Number(away ?? 0) };
};

const cardsOf = (stats: any) => {
  if (!stats?.home && !stats?.away) return null;
  const count = (side: any) => Number(side?.yellow ?? 0) + Number(side?.red ?? 0);
  return { home: count(stats.home), away: count(stats.away) };
};

export function LiveFeedProvider({ children }: { children: ReactNode }) {
  const [oddsDeltas, setOddsDeltas] = useState<Record<string, OddsDelta>>({});
  const [livePatches, setLivePatches] = useState<Record<string, LivePatch>>({});
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const prevOdds = useRef<Record<string, number>>({});

  useEffect(() => {
    const socket: Socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

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
      if (Object.keys(deltas).length) setOddsDeltas(prev => ({ ...prev, ...deltas }));
    });

    // the whole live board, once per collector cycle
    socket.on('matches:live', (payload: { matches?: any[] }) => {
      const patches: Record<string, LivePatch> = {};
      for (const m of payload?.matches ?? []) {
        if (!m || m.id === undefined || m.id === null) continue;
        const minute = Number(m.minute);
        const home = Number(m?.score?.home);
        const away = Number(m?.score?.away);
        patches[String(m.id)] = compact({
          status: m.status === 'live' ? 'LIVE' : m.status === 'ended' ? 'ENDED' : undefined,
          currentMinute: Number.isFinite(minute) ? minute : undefined,
          period: m.phase ?? null,
          homeScore: Number.isFinite(home) ? home : undefined,
          awayScore: Number.isFinite(away) ? away : undefined,
          corners: cornersOf(m.stats),
          cards: cardsOf(m.stats),
          isSuspended: m.suspended === true,
          updatedAt: new Date().toISOString(),
        }) as LivePatch;
      }
      if (Object.keys(patches).length) setLivePatches(prev => ({ ...prev, ...patches }));
    });

    // one match (score / clock / stats), between poll cycles
    socket.on('match:info', (info: any) => {
      const id = info?.match_id ?? info?.matchId;
      if (id === undefined || id === null) return;

      const clock = Number(info.match_time_ms);
      const minute = Number.isFinite(clock) ? Math.floor(clock / 60000) : undefined;
      const patch = compact({
        currentMinute: minute,
        period: info.feed_status ?? null,
        homeScore: info.home_score === null || info.home_score === undefined ? undefined : Number(info.home_score),
        awayScore: info.away_score === null || info.away_score === undefined ? undefined : Number(info.away_score),
        corners: cornersOf(info.stats),
        cards: cardsOf(info.stats),
        updatedAt: new Date().toISOString(),
      }) as LivePatch;

      const key = String(id);
      setLivePatches(prev => ({ ...prev, [key]: { ...(prev[key] ?? { updatedAt: patch.updatedAt }), ...patch } }));
      setMatchEvents(prev => [
        ...prev.slice(-49),
        {
          matchId: key,
          type: info.feed_status ?? 'update',
          minute: minute ?? 0,
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

  const value = useMemo<LiveFeedValue>(
    () => ({ oddsDeltas, livePatches, matchEvents, connected }),
    [oddsDeltas, livePatches, matchEvents, connected],
  );

  return <LiveFeedContext.Provider value={value}>{children}</LiveFeedContext.Provider>;
}

export const useLiveFeed = () => useContext(LiveFeedContext);

/** the pushed patch for one match (minute / score / corners / cards), undefined if none yet */
export const useLivePatch = (matchId?: string | number | null): LivePatch | undefined => {
  const { livePatches } = useContext(LiveFeedContext);
  if (matchId === undefined || matchId === null || matchId === '') return undefined;
  return livePatches[String(matchId)];
};

