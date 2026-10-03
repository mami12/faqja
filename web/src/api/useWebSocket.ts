import { PitchState } from '../types';
import { useLiveFeed } from './liveFeed';

/**
 * Kept for the components written against it (OddsButton, PitchTracker).
 *
 * It used to open its own Socket.IO connection per caller - one per odds button, so hundreds
 * of connections on a full board. It now reads the single shared connection mounted by
 * LiveFeedProvider (see liveFeed.tsx), so those callers keep the same API without another
 * socket. Outside the provider it returns empty data instead of throwing.
 */
export function useWebSocket() {
  const { oddsDeltas, matchEvents, livePatches } = useLiveFeed();
  // ball position is not part of the feed; the pitch falls back to the REST tracker
  const pitchStates: Record<string, PitchState> = {};

  return { oddsDeltas, pitchStates, matchEvents, livePatches };
}
