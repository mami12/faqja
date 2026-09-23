/**
 * Connects to the two upstream Socket.IO v4 channels over raw WebSocket and logs
 * EVERY frame for a few seconds. Purpose: find out whether the push channel emits
 * odds / score / card / corner data without authentication, and what the event
 * names look like.
 *
 * Run: node scripts/probe-sockets.mjs [seconds]
 */
import WebSocket from 'ws';

const SECONDS = Number(process.argv[2] ?? 20);
const PARTNER = process.env.PARTNER_ID ?? 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f';
const LANG = process.env.LANG_CODE ?? 'en-001';

const targets = [
  {
    name: 'gw-push-server-v2',
    url: `wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=${LANG}&externalPartnerId=${PARTNER}&EIO=4&transport=websocket`,
    origin: 'https://bitgames6205.com',
  },
  {
    name: 'bitgames-v4-socket-io',
    url: 'wss://bitgames6205.com/v4/socket.io/?xorigin=bitgames6205.com&app=frontend&Language=en&EIO=4&transport=websocket',
    origin: 'https://bitgames6205.com',
  },
];

const seen = new Map();

for (const t of targets) {
  const ws = new WebSocket(t.url, {
    headers: {
      Origin: t.origin,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
    handshakeTimeout: 15000,
  });

  let frames = 0;
  const counter = { oddsish: 0 };

  ws.on('open', () => {
    console.log(`[${t.name}] OPEN`);
    // Socket.IO v4: "40" = connect to the default namespace.
    setTimeout(() => {
      ws.send('40');
      console.log(`[${t.name}] -> 40 (namespace connect)`);
    }, 400);
  });

  ws.on('message', (data) => {
    const s = data.toString();
    frames++;
    const head = s.length > 900 ? `${s.slice(0, 900)}...<+${s.length - 900} chars>` : s;
    if (frames <= 25) console.log(`[${t.name}] <- ${head}`);

    // engine.io heartbeat: server sends "2", client must answer "3"
    if (s === '2') ws.send('3');

    if (/"(coef|odds|price|kef|cf)"/i.test(s)) counter.oddsish++;
    const ev = s.match(/^42(\/[\w-]+)?,?\[?"([^"]+)"/);
    if (ev) seen.set(`${t.name}:${ev[2]}`, (seen.get(`${t.name}:${ev[2]}`) ?? 0) + 1);
  });

  ws.on('error', (e) => console.log(`[${t.name}] ERROR: ${e.message}`));
  ws.on('close', (code, reason) => console.log(`[${t.name}] CLOSE ${code} ${reason?.toString() ?? ''}`));

  setTimeout(() => {
    console.log(`[${t.name}] SUMMARY frames=${frames} odds-ish frames=${counter.oddsish}`);
    ws.close();
  }, SECONDS * 1000);
}

setTimeout(() => {
  console.log('\n================ EVENT NAMES SEEN ================');
  if (seen.size === 0) console.log('(none — the channel is silent until you subscribe)');
  for (const [k, v] of [...seen.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}  x${v}`);
  process.exit(0);
}, (SECONDS + 3) * 1000);
