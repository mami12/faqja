/**
 * Live check for idle mode: does the feed really stop when nobody is on the board, and does the
 * first visitor get a live board - without ever selling a price from before the pause?
 *
 *   IDLE_FEED=true IDLE_AFTER_MS=15000 IDLE_COLD_BOOT_MS=8000 ODDS_SOCKET=true npm start
 *   LOCAL_URL=http://localhost:3000 npm run verify:idle
 *
 * The windows come from /health, so the script waits exactly as long as the server is configured
 * to wait. It leaves the server awake (a live board) so the other checks can run straight after
 * it, and it deletes the throwaway player it creates.
 *
 * Use short windows only for this script (IDLE_AFTER_MS=15000 IDLE_COLD_BOOT_MS=8000): the feed
 * pauses between requests, and the other verify scripts (which expect a live feed throughout)
 * should be run against the normal 15 minute window.
 */
import { io } from 'socket.io-client';

const B = process.env.LOCAL_URL ?? 'http://localhost:3100';
const API = `${B}/app/api`;

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!ok) failures++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const health = async () => (await fetch(`${B}/health`)).json();

const call = async (path, token, init = {}) => {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
    /* empty response */
  }
  return { status: r.status, body };
};

/** polls /health until the feed reports the mode we want (health is not "activity", by design) */
const waitForMode = async (want, ms) => {
  const until = Date.now() + ms;
  let seen = 'unknown';
  while (Date.now() < until) {
    try {
      seen = (await health()).feedMode;
      if (seen === want) return seen;
    } catch {
      /* the server may be mid-restart */
    }
    await sleep(500);
  }
  return seen;
};

/** one priced selection from the board, in the shape the betslip posts */
const pickSelection = async () => {
  const board = await call('/matches');
  for (const m of board.body ?? []) {
    for (const mk of m.markets ?? []) {
      const o = (mk.outcomes ?? []).find((x) => typeof x.odds === 'number' && x.odds > 1);
      if (o) return { outcomeId: o.id, odds: o.odds, matchId: m.id };
    }
  }
  return null;
};


// --- 0. the server must actually have idle mode on, with a window we can wait for --------
console.log('0) configuration');
const first = await health();
check('the server reports an idle state', !!first.idle, `feedMode=${first.feedMode}`);
check('idle mode is enabled', first.idle?.enabled === true);
if (first.idle?.enabled !== true) {
  console.log('\nidle mode is off: start the server with IDLE_FEED=true and a short IDLE_COLD_BOOT_MS');
  process.exit(1);
}
const window = Math.max(Number(first.idle.coldBootIdleMs) || 0, Number(first.idle.idleAfterMs) || 0);
console.log(
  `   pause after ${Math.round((first.idle.idleAfterMs || 0) / 1000)}s without a visitor ` +
    `(${Math.round((first.idle.coldBootIdleMs || 0) / 1000)}s before the first visit)`,
);
check('the window is short enough to test', window > 0 && window <= 60000, `${Math.round(window / 1000)}s`);
check('the database probe is configured to stop while idle', first.idle.stopDbProbeOnIdle === true);

// --- a throwaway player, so a bet can be attempted later ---------------------------------
const suffix = String(Date.now()).slice(-6);
const adminLogin = await call('/auth/login', null, {
  method: 'POST',
  body: JSON.stringify({ username: process.env.ADMIN_USER ?? 'admin', password: process.env.ADMIN_PASSWORD ?? 'admin123' }),
});
const adminToken = adminLogin.body?.token ?? null;
check('admin can log in', !!adminToken);
const player = `idle_${suffix}`;
const created = await call('/admin/users', adminToken, {
  method: 'POST',
  body: JSON.stringify({ username: player, password: 'pass1234', initialBalance: 5000, role: 'PLAYER' }),
});
check('a player can be opened for the run', created.status === 200, created.body?.message ?? '');
const playerId = created.body?.id ?? created.body?.user?.id ?? null;
const token = (
  await call('/auth/login', null, { method: 'POST', body: JSON.stringify({ username: player, password: 'pass1234' }) })
).body?.token ?? null;
check('the player can log in', !!token);

// --- 1. nobody on the board: the feed must stop ------------------------------------------
console.log(`\n1) nobody on the board -> the feed should pause (waiting up to ${Math.round(window / 1000) + 25}s)`);
// `visits` counts socket connections over the life of the process, so the check below compares
// it before and after: polling /health must not look like a visitor (a monitor would otherwise
// keep the feed - and the invoice - running forever)
const visitsBefore = Number((await health()).idle?.visits ?? 0);
const idleMode = await waitForMode('idle', window + 25000);
check('the feed reports idle', idleMode === 'idle', `mode=${idleMode}`);
const idleState = await health();
check('the collector is stopped (no upstream polling)', idleState.collector?.paused === true);
check('the pusher is stopped (its upstream socket is closed)', idleState.pusher?.paused === true);
check('the database probe is stopped (no outbound traffic is left)', idleState.idle?.dbProbeStopped === true);
check('the pause is counted in /health', Number(idleState.idle?.sleeps) >= 1, `sleeps=${idleState.idle?.sleeps}`);
check(
  'polling /health did NOT count as a visitor',
  Number(idleState.idle?.visits ?? 0) === visitsBefore,
  `visits ${visitsBefore} -> ${idleState.idle?.visits}`,
);


// --- 2. a visitor must wake it, and the board must fill again ----------------------------
console.log('\n2) a visitor opens the board -> the feed must wake');
const socket = io(B, { path: '/socket.io', transports: ['websocket'] });
let helloMode = null;
socket.on('hello', (h) => {
  if (helloMode === null) helloMode = h?.mode ?? null;
});
await new Promise((resolve) => {
  if (socket.connected) return resolve();
  socket.once('connect', resolve);
  setTimeout(resolve, 4000);
});
check('the board socket connects', socket.connected, B);
// the connection itself is the visitor: the feed must have left idle before anything is sent.
// (`hello` also carries the mode, but /health is the authoritative read.)
const afterConnect = await health();
check(
  'opening a socket wakes the feed at once',
  socket.connected && afterConnect.feedMode !== 'idle',
  `feedMode=${afterConnect.feedMode}${helloMode ? ` hello.mode=${helloMode}` : ''}`,
);

const liveMode = await waitForMode('live', 45000);
check('the feed reports live once the first cycle is in', liveMode === 'live', `mode=${liveMode}`);
const afterWake = await health();
check('matches are back on the board', Number(afterWake.matches?.matches) > 0, `matches=${afterWake.matches?.matches}`);
check('prices are back', Number(afterWake.odds?.rows) > 0, `oddsRows=${afterWake.odds?.rows}`);
check('the collector is polling again', afterWake.collector?.paused === false);
check(
  'the pusher is subscribed again',
  afterWake.pusher?.paused === false && Number(afterWake.pusher?.subscribedIds) > 0,
  `subscribed=${afterWake.pusher?.subscribedIds}`,
);
socket.close();

// --- 3. a bet inside the waking window must be refused, never sold a stale price ---------
console.log('\n3) a bet while the feed is starting must be refused');
const selection = await pickSelection();
check('the board has a priced selection to bet on', !!selection, selection?.outcomeId);
const idleAgain = await waitForMode('idle', window + 25000);
check('the feed went back to idle after the socket closed', idleAgain === 'idle', `mode=${idleAgain}`);
if (idleAgain === 'idle' && selection) {
  // an app API call is a visitor: it wakes the feed, and the bet must not slip through
  await call('/matches');
  const bet = await call('/bets/place', token, {
    method: 'POST',
    body: JSON.stringify({
      stake: 100,
      ticketType: 'SINGLE',
      selections: [{ outcomeId: selection.outcomeId, oddsAtPlacement: selection.odds }],
    }),
  });
  const message = String(bet.body?.message ?? bet.body?.error ?? '');
  check(
    'the bet is refused while the feed is refreshing',
    bet.status >= 400 && /rifreskohen/i.test(message),
    `${bet.status} ${message.slice(0, 80)}`,
  );
}

// --- leave the server awake, so the other checks can run straight after ------------------
const finalMode = await waitForMode('live', 45000);
check('the server is left live for the next check', finalMode === 'live', `mode=${finalMode}`);
if (playerId) await call(`/admin/users/${playerId}`, adminToken, { method: 'DELETE' });

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
// let the socket finish closing: exiting inside the close callback trips a libuv assertion on
// Windows (the checks above have already run)
setTimeout(() => process.exit(failures ? 1 : 0), 250);
