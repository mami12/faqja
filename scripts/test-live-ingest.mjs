/**
 * Pushes a frame in the platform's own format for a REAL live football match
 * from the board (real protocol, placeholder prices) and prints what the board
 * ends up with — proves decode -> DB -> market columns -> suspension.
 *
 * Run: node scripts/test-live-ingest.mjs
 */
const BASE = process.env.LOCAL_URL ?? 'http://localhost:3000';
const TOKEN = process.env.INGEST_TOKEN ?? 'change-me';

const getJson = async (p) => {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return res.json();
};

const live = await getJson('/api/matches?service=LIVE&limit=1');
const match = live.items[0];
if (!match) throw new Error('no live match in the DB');
console.log(`target match ${match.id}  ${match.home} - ${match.away}  (${match.minute}')`);

const group = (id, outcomes, renderType, list) => ({
  id: String(id),
  isBase: true,
  outcomes,
  renderType,
  oddsList: list.map(([id2, cf, status]) => ({ id: id2, cf, status, ts: Date.now() })),
});

const tuple = (typeId, line, outcomeIdx) =>
  `12:L:9001:[${typeId},[${line}],[0],1,${outcomeIdx},[]]`;

const message = {
  messageType: 'match-odds',
  data: {
    matchId: match.id,
    oddsGroups: [
      group(6257, ['1', 'x', '2'], 'cols-3', [
        [tuple(1, '', 0), 2.1, 1],
        [tuple(1, '', 1), 3.4, 1],
        [tuple(1, '', 3), 3.0, 1],
      ]),
      group(54211, ['under', 'over'], 'total-2', [
        [tuple(264, 2.5, 4), 1.95, 1],
        [tuple(264, 2.5, 5), 1.85, 1],
      ]),
      group(55999, ['under', 'over'], 'total-2', [
        [tuple(777, 9.5, 4), 1.9, 1],
        [tuple(777, 9.5, 5), 1.9, 1],
      ]),
      group(55998, ['under', 'over'], 'total-2', [
        [tuple(778, 3.5, 4), 2.05, 0], // status 0 -> suspended
        [tuple(778, 3.5, 5), 1.75, 0],
      ]),
    ],
  },
};

const frame = `42${JSON.stringify(['u', message, 'local-test'])}`;

const post = await fetch(`${BASE}/ingest/frames`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ingest-token': TOKEN },
  body: JSON.stringify({ frames: [frame] }),
});
console.log('POST /ingest/frames ->', post.status, await post.text());

const after = await getJson(`/api/matches/${match.id}`);
console.log(`\nmarkets for ${match.id} (suspended=${after.suspended}, hasSuspended=${after.hasSuspended}):`);
for (const m of after.markets) {
  const outs = m.outcomes.map((o) => `${o.name}=${o.price}${o.suspended ? ' [SUSP]' : ''}`).join('  ');
  console.log(`  ${String(m.column).padEnd(8)} ${m.name.padEnd(20)} ${m.suspended ? 'SUSPENDED' : '         '} ${outs}`);
}
