/**
 * Long probe of the push channel:
 *   phase 1 - just listen (does the server push unprompted?)
 *   phase 2 - try subscribe/auth frames shaped like the captured "u" messages
 *
 * Run: node scripts/probe-push2.mjs
 */
import WebSocket from 'ws';

const PARTNER = process.env.PARTNER_ID ?? 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f';
const LANG = process.env.LANG_CODE ?? 'en-001';
const url = `wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=${LANG}&externalPartnerId=${PARTNER}&EIO=4&transport=websocket`;

const MATCH_ID = Number(process.argv[2] ?? 40451752);

const candidates = [
  ['u / match-info', `42["u",{"messageType":"match-info","data":{"matchId":${MATCH_ID},"service":"LIVE","providerId":12}}]`],
  ['u / match-odds', `42["u",{"messageType":"match-odds","data":{"matchId":${MATCH_ID}}}]`],
  ['sub', `42["sub",{"matchIds":[${MATCH_ID}]}]`],
  ['subscribe', `42["subscribe",{"messageType":"match-odds","matchIds":[${MATCH_ID}]}]`],
  ['get', `42["get",{"messageType":"match-info","data":{"matchId":${MATCH_ID}}}]`],
  ['a/login.token', '42["a",{"type":"login.token","data":false}]'],
];

const ws = new WebSocket(url, {
  headers: {
    Origin: 'https://bitgames6205.com',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  },
  handshakeTimeout: 15000,
});

let frames = 0;
let phase = 1;
let i = 0;

ws.on('open', () => {
  console.log('OPEN');
  setTimeout(() => ws.send('40'), 300);
});

ws.on('message', (data) => {
  const text = data.toString();
  if (text === '2') {
    ws.send('3');
    return;
  }
  frames++;
  console.log(`  [p${phase}] <- ${text.length > 400 ? text.slice(0, 400) + `...<+${text.length - 400}>` : text}`);
});

ws.on('error', (e) => console.log('ERROR', e.message));
ws.on('close', (c, r) => console.log('CLOSE', c, r?.toString() ?? ''));

// phase 1: listen silently for 30s
setTimeout(() => {
  console.log(`\n--- phase 1 done, unprompted frames = ${frames} ---`);
  phase = 2;
  const timer = setInterval(() => {
    if (i >= candidates.length) {
      clearInterval(timer);
      console.log(`\n--- phase 2 done, total frames = ${frames} ---`);
      ws.close();
      setTimeout(() => process.exit(0), 500);
      return;
    }
    const [label, frame] = candidates[i++];
    console.log(`-> [${label}]`);
    ws.send(frame);
  }, 9000);
}, 30000);
