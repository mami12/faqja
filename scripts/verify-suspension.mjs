/**
 * Live check: does a suspension the feed sends reach the board - and the browser - at once?
 *
 * Around a goal or a dangerous attack the platform locks its prices ("status":2 in the odds
 * frame) and can close a whole match ("hasOpenOdds":false). The board must mark the outcome
 * SUSPENDED, and the socket must carry the lock so the button disables immediately instead of
 * waiting for the next 15s REST poll - the window nobody may bet in.
 *
 * Needs a running server (the same setup the other checks use):
 *   LOCAL_URL=http://localhost:3000 ODDS_SOCKET=true npm start
 *   npm run verify:suspension
 *
 * It only flips the status flag of one existing market and puts it back.
 */
import { io } from 'socket.io-client';

const B = process.env.LOCAL_URL ?? 'http://localhost:3100';
const TOKEN = process.env.INGEST_TOKEN ?? 'change-me';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!ok) failures++;
};

const json = async (p) => (await fetch(`${B}${p}`)).json();

// --- a live match with a priced 1X2 market -------------------------------------------
const board = await json('/api/matches?service=LIVE&limit=100');
const match = (board.items ?? []).find(
  (m) => (m.markets ?? []).some((mk) => mk.column === 'result' && (mk.outcomes ?? []).filter((o) => o.price !== null).length >= 2),
);
if (!match) {
  console.log('no live match with a priced 1X2 market - nothing to test');
  process.exit(1);
}
const market = match.markets.find((mk) => mk.column === 'result' && (mk.outcomes ?? []).filter((o) => o.price !== null).length >= 2);
const outcomes = market.outcomes.filter((o) => o.price !== null);
const groupId = String(market.key).replace(/^g/, '').replace(/p\d+$/, '');
console.log(`match ${match.id}: market ${market.key} (group ${groupId}), ${outcomes.length} priced outcomes\n`);

// --- the frame the feed sends when it locks a market ---------------------------------
const frame = (status) =>
  `42${JSON.stringify([
    'u',
    {
      messageType: 'match-odds',
      data: {
        matchId: match.id,
        oddsGroups: [
          {
            id: groupId,
            outcomes: outcomes.map((o) => o.key),
            renderType: 'cols-3',
            isBase: true,
            order: 0,
            oddsList: outcomes.map((o) => ({ id: `10:53552314920213864:${o.key}`, cf: o.price, status, ts: Date.now() })),
          },
        ],
      },
    },
    'verify-suspension',
  ])}`;

const post = async (status) => {
  const r = await fetch(`${B}/ingest/frames`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-token': TOKEN },
    body: JSON.stringify({ frames: [frame(status)] }),
  });
  return r.json();
};

// --- what the browser gets over the socket -------------------------------------------
const socket = io(B, { path: '/socket.io', transports: ['websocket'] });
const updates = [];
socket.on('odds:update', (payload) => updates.push(payload));
await new Promise((resolve) => {
  if (socket.connected) return resolve();
  socket.once('connect', resolve);
  setTimeout(resolve, 4000);
});
check('the board socket is reachable', socket.connected, B);

const waitForLock = async (want, ms = 4000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    for (const payload of updates) {
      if (String(payload.matchId) !== String(match.id)) continue;
      for (const mk of payload.markets ?? []) {
        for (const o of mk.outcomes ?? []) if (o.suspended === want) return true;
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
};

console.log('1) the feed suspends this market (status 0)');
const locked = await post(0);
check('the ingest accepts the suspended frame', locked.status === undefined || locked.oddsRows !== 0, JSON.stringify(locked).slice(0, 140));
check('the socket pushes the lock to the browser', await waitForLock(true), `odds:update received=${updates.length}`);

const afterLock = (await json(`/api/matches/${match.id}`)).markets.find((mk) => mk.key === market.key);
check(
  'the board shows the outcomes as suspended',
  (afterLock?.outcomes ?? []).filter((o) => o.suspended === true).length >= 2,
  JSON.stringify((afterLock?.outcomes ?? []).map((o) => `${o.name}:${o.suspended}`)),
);

console.log('\n2) the feed re-opens it (status 1)');
updates.length = 0;
await post(1);
check('the socket releases the lock', await waitForLock(false), `odds:update received=${updates.length}`);

const afterOpen = (await json(`/api/matches/${match.id}`)).markets.find((mk) => mk.key === market.key);
check(
  'the board shows them bettable again',
  (afterOpen?.outcomes ?? []).every((o) => o.suspended !== true),
  JSON.stringify((afterOpen?.outcomes ?? []).map((o) => `${o.name}:${o.suspended}`)),
);

socket.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
// let the socket finish closing: exiting inside the close callback trips a libuv assertion on
// Windows (the checks above have already run)
setTimeout(() => process.exit(failures ? 1 : 0), 250);
