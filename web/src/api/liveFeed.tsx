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
  /** how many markets the board currently prices for this match (0 = nothing to bet yet) */
  marketCount?: number;
  isSuspended?: boolean;
  updatedAt: string;
}

interface LiveFeedValue {
  oddsDeltas: Record<string, OddsDelta>;
  livePatches: Record<string, LivePatch>;
  matchEvents: MatchEvent[];
  connected: boolean;
  /**
   * 'live'   the feed is running: prices are fresh and bets are accepted
   * 'idle'   the server paused the feed because nobody was on the board
   * 'waking' it is collecting the first cycle again - the board is rebuilt in a few seconds
   * While this is not 'live' the board shows "odds are being refreshed" instead of an empty
   * list, and a bet would be refused by the server anyway.
   */
  feedMode: FeedMode;
  /** prices the feed has locked right now, keyed exactly like the REST payload ids */
  lockedOutcomes: Record<string, boolean>;
  lockedMarkets: Record<string, boolean>;
  lockedMatches: Record<string, boolean>;
}

export type FeedMode = 'live' | 'idle' | 'waking';

const EMPTY: LiveFeedValue = {
  oddsDeltas: {},
  livePatches: {},
  matchEvents: [],
  connected: false,
  feedMode: 'live',
  lockedOutcomes: {},
  lockedMarkets: {},
  lockedMatches: {},
};

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
  const [lockedOutcomes, setLockedOutcomes] = useState<Record<string, boolean>>({});
  const [lockedMarkets, setLockedMarkets] = useState<Record<string, boolean>>({});
  const [lockedMatches, setLockedMatches] = useState<Record<string, boolean>>({});
  const [feedMode, setFeedMode] = useState<FeedMode>('live');
  const prevOdds = useRef<Record<string, number>>({});

  useEffect(() => {
    const socket: Socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // idle mode: the server says when it paused the feed (nobody was on the board) and when it
    // is filling it again, so the board can say "odds are being refreshed" instead of looking
    // broken. `hello` carries the mode on connect, `feed:state` on every change.
    const useMode = (payload: any) => {
      const mode = payload?.mode;
      if (mode === 'live' || mode === 'idle' || mode === 'waking') setFeedMode(mode);
    };
    socket.on('hello', useMode);
    socket.on('meta', useMode);
    socket.on('feed:state', useMode);

    socket.on('odds:update', (payload: { matchId: string | number; markets?: any[] }) => {
      const deltas: Record<string, OddsDelta> = {};
      const outcomeLocks: Record<string, boolean> = {};
      const marketLocks: Record<string, boolean> = {};

      for (const market of payload?.markets ?? []) {
        const marketId = `${payload.matchId}|${market.key}|${market.line ?? ''}`;

        for (const outcome of market?.outcomes ?? []) {
          const outcomeId = `${marketId}|${outcome.key}`;

          // The feed locks a price around a goal or a dangerous attack: "status":2 arrives as
          // suspended. This is the whole point of using the socket - by REST poll the market
          // stayed open for up to 15s, which is exactly the window nobody may bet in.
          if (outcome?.suspended === true || outcome?.suspended === false) {
            outcomeLocks[outcomeId] = outcome.suspended === true;
          }

          if (outcome?.price === null || outcome?.price === undefined) continue;
          const next = Number(outcome.price);
          const before = prevOdds.current[outcomeId];
          prevOdds.current[outcomeId] = next;
          if (before === undefined || before === next) continue;
          deltas[outcomeId] = { outcomeId, newOdds: next, direction: next > before ? 'up' : 'down' };
        }

        // only the rows that moved are pushed, so "every row in this frame is suspended" is
        // what a fully locked market looks like over the socket
        const outcomes = market?.outcomes ?? [];
        if (outcomes.length) marketLocks[marketId] = outcomes.every((o: any) => o.suspended === true);
      }

      if (Object.keys(deltas).length) setOddsDeltas(prev => ({ ...prev, ...deltas }));
      if (Object.keys(outcomeLocks).length) setLockedOutcomes(prev => ({ ...prev, ...outcomeLocks }));
      if (Object.keys(marketLocks).length) setLockedMarkets(prev => ({ ...prev, ...marketLocks }));
    });

    // the whole live board, once per collector cycle
    socket.on('matches:live', (payload: { matches?: any[] }) => {
      useMode(payload); // the first board after a wake also announces the mode
      const patches: Record<string, LivePatch> = {};
      for (const m of payload?.matches ?? []) {
        if (!m || m.id === undefined || m.id === null) continue;
        const minute = Number(m.minute);
        const home = Number(m?.score?.home);
        const away = Number(m?.score?.away);
        patches[String(m.id)] = compact({
          status: m.status === 'live' ? 'LIVE' : m.status === 'ended' ? 'ENDED' : undefined,
          currentMinute: Number.isFinite(minute) ? minute : undefined,
          marketCount: Number.isFinite(Number(m.marketCount)) ? Number(m.marketCount) : undefined,
          period: m.phase ?? null,
          homeScore: Number.isFinite(home) ? home : undefined,
          awayScore: Number.isFinite(away) ? away : undefined,
          corners: cornersOf(m.stats),
          cards: cardsOf(m.stats),
          isSuspended: m.suspended === true,
          updatedAt: new Date().toISOString(),
        }) as LivePatch;
      }
      if (Object.keys(patches).length) {
        setLivePatches(prev => ({ ...prev, ...patches }));
        // the board's own view: a match whose every market is locked
        const matchLocks: Record<string, boolean> = {};
        for (const [id, p] of Object.entries(patches)) matchLocks[id] = p.isSuspended === true;
        setLockedMatches(prev => ({ ...prev, ...matchLocks }));
      }
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
      // the feed's own "this match has no open odds" flag locks every price on it
      if (typeof info.has_open_odds === 'boolean') {
        setLockedMatches(prev => ({ ...prev, [key]: info.has_open_odds === false }));
      }
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
    () => ({ oddsDeltas, livePatches, matchEvents, connected, feedMode, lockedOutcomes, lockedMarkets, lockedMatches }),
    [oddsDeltas, livePatches, matchEvents, connected, feedMode, lockedOutcomes, lockedMarkets, lockedMatches],
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

