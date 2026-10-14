/**
 * Tests the subscribe protocol that actually wakes the push channel:
 *   42["subscribe",{"messageType":"subscribe-match-odds","data":{"matchIds":[…],"isBaseOddsGroups":true|false}}]
 *   42["subscribe",{"messageType":"subscribe-match-info","data":{"matchIds":[…]}}]
 *
 * Run: node scripts/probe-subscribe3.mjs [seconds] [base|full]
 */
import WebSocket from 'ws';
import fs from 'node:fs';

const SECONDS = Number(process.argv[2] ?? 40);
const MODE = process.argv[3] ?? 'base';
const PARTNER = process.env.PARTNER_ID ?? 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f';
const LANG = process.env.LANG_CODE ?? 'en-001';
const REST = 'https://api-gateway.gw-lucky-bet.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const HEADERS = {
  'user-agent': UA,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://bitgames6205.com',
  referer: 'https://bitgames6205.com/',
};

// 1) live football ids
const res = await fetch(`${REST}/matches/get-many?l=${LANG}&p=${PARTNER}`, {
  method: 'POST',
  headers: { ...HEADERS, 'content-type': 'application/json', 'x-external-partner-id': PARTNER, 'x-lang': LANG },
  body: JSON.stringify({ service: 'live', sportId: 18, excludeSportType: 'polybet', limit: 20 }),
});
const items = (await res.json()).result.items;
const ids = items.map((i) => i.id);
console.log(`live football ids (${ids.length}): ${ids.join(',')}`);

// 2) socket + subscribe
const url = `wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=${LANG}&externalPartnerId=${PARTNER}&EIO=4&transport=websocket`;
  const ws = new WebSocket(url, { headers: HEADERS, handshakeTimeout: 20000 });

const types = new Map();
const bytes = { total: 0 };
let samples = {};
let saved = {};
let subTimer = null;

const subFrames = () => [
  `42["subscribe",{"messageType":"subscribe-match-odds","data":{"matchIds":${JSON.stringify(ids)},"isBaseOddsGroups":${MODE === 'full' ? 'false' : 'true'}}}]`,
  `42["subscribe",{"messageType":"subscribe-match-info","data":{"matchIds":${JSON.stringify(ids)}}}]`,
];

ws.on('open', () => console.log('OPEN'));

ws.on('message', (data) => {
  const t = data.toString();
  if (t === '2') {
    ws.send('3');
    return;
  }
  if (t.startsWith('0')) {
    ws.send('40');
    return;
  }
  if (t.startsWith('40')) {
    console.log('namespace connected -> sending subscribe frames');
    for (const f of subFrames()) {
      ws.send(f);
      console.log('-> ' + f.slice(0, 160));
    }
    subTimer = setInterval(() => {
      for (const f of subFrames()) ws.send(f);
    }, 20000);
    return;
  }
  if (!t.startsWith('42')) {
    console.log('<- ' + t.slice(0, 200));
    return;
  }

  bytes.total += t.length;
  let payload;
  try {
    const args = JSON.parse(t.slice(t.indexOf('[')));
    payload = Array.isArray(args) && typeof args[1] === 'object' ? args[1] : args;
  } catch {
    return;
  }
  const mt = payload?.messageType ?? '(none)';
  types.set(mt, (types.get(mt) ?? 0) + 1);
  if (!samples[mt]) {
    samples[mt] = t.length > 900 ? t.slice(0, 900) + `...<+${t.length - 900}>` : t;
  }
  // keep one full frame of each snapshot type as an offline fixture
  if ((mt === 'match-odds-snapshot' || mt === 'match-info-snapshot') && !saved[mt]) {
    saved[mt] = true;
    fs.appendFileSync('scripts/sample-snapshot.txt', t + '\n');
    console.log(`saved fixture: scripts/sample-snapshot.txt (${mt}, ${t.length} bytes)`);
  }
});

ws.on('error', (e) => console.log('ERROR', e.message));
ws.on('close', (c, r) => console.log('CLOSE', c, r?.toString() ?? ''));

setTimeout(() => {
  console.log('\n================ RESULT ================');
  console.log(`mode isBaseOddsGroups=${MODE === 'full' ? 'false (all markets)' : 'true (base only)'}  bytes=${bytes.total}`);
  if (!types.size) console.log('NO MESSAGES — subscribe did not take');
  for (const [k, v] of [...types.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k} x${v}`);
  console.log('\n--- sample match-odds-snapshot ---');
  console.log(samples['match-odds-snapshot'] ?? samples['match-odds'] ?? '(none)');
  console.log('\n--- sample match-info-snapshot ---');
  console.log(samples['match-info-snapshot'] ?? samples['match-info'] ?? '(none)');
  clearInterval(subTimer);
  ws.close();
  setTimeout(() => process.exit(0), 400);
}, SECONDS * 1000);
