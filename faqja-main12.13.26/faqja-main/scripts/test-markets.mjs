/**
 * Proves the "all markets + real time + suspension" behaviour against a locally
 * running backend, using frames in the platform's own format:
 *   1) 1X2 (base), totals (base), corners, cards, 1st-half 1X2, one suspended market
 *   2) the same frame again with moved prices -> price change + history + broadcast
 *   3) the same frame with status 0 -> suspension propagates to the board
 *
 * Run: node scripts/test-markets.mjs
 */
const BASE = process.env.LOCAL_URL ?? 'http://localhost:3000';
const TOKEN = process.env.INGEST_TOKEN ?? 'change-me';

const json = async (p) => {
  const r = await fetch(`${BASE}${p}`);
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
};

const live = await json('/api/matches?service=LIVE&limit=1');
const match = live.items[0];
if (!match) throw new Error('no live match');
console.log(`match ${match.id}  ${match.home} - ${match.away}  (${match.minute}')\n`);

const tuple = (typeId, line, outcomeIdx, period = 0) => `12:L:9001:[${typeId},[${line}],[${period}],1,${outcomeIdx},[]]`;

const frame = (prices, susp = false) => {
  const st = susp ? 0 : 1;
  const g = (id, outcomes, renderType, order, isBase, list) => ({ id, outcomes, renderType, order, isBase, oddsList: list });
  const message = {
    messageType: 'match-odds',
    data: {
      matchId: match.id,
      oddsGroups: [
        g(6257, ['1', 'x', '2'], 'cols-3', 0, true, [
          { id: tuple(1, '', 0), cf: prices.h, status: st, ts: Date.now() },
          { id: tuple(1, '', 1), cf: prices.d, status: st, ts: Date.now() },
          { id: tuple(1, '', 3), cf: prices.a, status: st, ts: Date.now() },
        ]),
        g(54211, ['under', 'over'], 'total-2', 2000, true, [
          { id: tuple(264, 2.5, 4), cf: prices.uo, status: st, ts: Date.now() },
          { id: tuple(264, 2.5, 5), cf: prices.ov, status: st, ts: Date.now() },
        ]),
        g(55999, ['under', 'over'], 'total-2', 3000, false, [
          { id: tuple(777, 9.5, 4), cf: 1.9, status: st, ts: Date.now() },
          { id: tuple(777, 9.5, 5), cf: 1.9, status: st, ts: Date.now() },
        ]),
        g(55998, ['under', 'over'], 'total-2', 4000, false, [
          { id: tuple(778, 3.5, 4), cf: 2.05, status: st, ts: Date.now() },
          { id: tuple(778, 3.5, 5), cf: 1.75, status: st, ts: Date.now() },
        ]),
        g(6258, ['1', 'x', '2'], 'cols-3', 21000, true, [
          { id: tuple(1, '', 0, 1), cf: 2.4, status: st, ts: Date.now() },
          { id: tuple(1, '', 1, 1), cf: 2.1, status: st, ts: Date.now() },
          { id: tuple(1, '', 3, 1), cf: 9.0, status: st, ts: Date.now() },
        ]),
      ],
    },
  };
  return `42${JSON.stringify(['u', message, 'mkts-test'])}`;
};

const post = async (frames) => {
  const res = await fetch(`${BASE}/ingest/frames`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-token': TOKEN },
    body: JSON.stringify({ frames }),
  });
  return { status: res.status, body: await res.json() };
};

const show = async (label) => {
  const after = await json(`/api/matches/${match.id}`);
  console.log(`--- ${label}: ${after.marketCount} markets, suspended=${after.suspended}, hasSuspended=${after.hasSuspended}`);
  for (const mk of after.markets) {
    const outs = mk.outcomes.map((o) => `${o.name}=${o.price}${o.suspended ? '[SUSP]' : ''}`).join('  ');
    console.log(
      `    ${String(mk.column).padEnd(8)} ${(mk.name + (mk.line ? ' ' + mk.line : '')).padEnd(26)} ${mk.isBase ? 'base' : '    '} ${
        mk.period ? 'p' + mk.period : '    '
      }  ${mk.suspended ? 'SUSPENDED  ' : '           '}${outs}`,
    );
  }
  console.log('');
};

const first = { h: 2.1, d: 3.4, a: 3.0, uo: 1.95, ov: 1.85 };
console.log('1) initial market set');
console.log('  ', (await post([frame(first)])).body);
await show('after 1)');

console.log('2) prices move (home 2.10 -> 1.85)');
console.log('  ', (await post([frame({ ...first, h: 1.85, d: 3.9, a: 3.6 })])).body);
await show('after 2)');

console.log('3) markets suspended (status 0 = the book pulling them during a goal chance)');
console.log('  ', (await post([frame({ ...first, h: 1.85, d: 3.9, a: 3.6 }, true)])).body);
await show('after 3)');

const hist = await json(`/api/odds/${match.id}/history?limit=6`);
console.log('price history (newest first):');
for (const h of hist.items) console.log(`   ${h.market_key} ${h.outcome_key} = ${h.price}${h.suspended ? ' [SUSP]' : ''}`);
