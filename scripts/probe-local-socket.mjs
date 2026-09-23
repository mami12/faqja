/**
 * End-to-end check of the realtime chain against a LOCALLY RUNNING backend:
 * connects as a browser client, waits for the snapshot, pushes an odds update
 * through POST /ingest/odds and expects an "odds:update" broadcast back.
 *
 * Run: node scripts/probe-local-socket.mjs
 */
import WebSocket from 'ws';

const BASE = process.env.LOCAL_URL ?? 'http://localhost:3000';
const TOKEN = process.env.INGEST_TOKEN ?? 'change-me';
const wsUrl = `${BASE.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;

const seen = [];
let triggered = false;
let gotOddsUpdate = false;

const ws = new WebSocket(wsUrl, { headers: { Origin: BASE } });

ws.on('open', () => {
  console.log('socket open ->', wsUrl);
  ws.send('40');
});

ws.on('message', async (data) => {
  const text = data.toString();
  if (text === '2') {
    ws.send('3');
    return;
  }
  if (!text.startsWith('42')) return;

  const event = (text.match(/^42\[?"?([^",]+)/) || [])[1];
  seen.push(event);
  console.log(`  <- ${event} (${text.length} bytes)`);

  if (event === 'matches:live' && !triggered) {
    triggered = true;
    try {
      const res = await fetch(`${BASE}/api/matches?service=LIVE&limit=1`);
      const json = await res.json();
      const match = json.items[0];
      if (!match) return console.log('  (no live match available to push odds for)');

      const payload = {
        matchId: match.id,
        markets: [
          {
            key: '1x2',
            name: 'Full Time Result',
            outcomes: [
              { key: '1', name: 'Home', price: 2.05 },
              { key: 'x', name: 'Draw', price: 3.45 },
              { key: '2', name: 'Away', price: 3.1 },
            ],
          },
        ],
      };
      const post = await fetch(`${BASE}/ingest/odds`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ingest-token': TOKEN },
        body: JSON.stringify(payload),
      });
      console.log(`  -> posted odds for ${match.id}: HTTP ${post.status}`);
    } catch (e) {
      console.log('  post failed:', e.message);
    }
  }

  if (event === 'odds:update') gotOddsUpdate = true;
});

ws.on('error', (e) => console.log('socket error:', e.message));

setTimeout(() => {
  console.log('\n================ REALTIME SUMMARY ================');
  console.log('events received :', [...new Set(seen)].join(', ') || '(none)');
  console.log('odds:update seen:', gotOddsUpdate ? 'YES (realtime odds path works)' : 'no');
  ws.close();
  process.exit(0);
}, 25000);
