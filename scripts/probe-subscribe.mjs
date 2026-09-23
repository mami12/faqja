/**
 * Tries a list of candidate Socket.IO subscribe frames against the upstream push
 * channel and logs anything the server answers with.
 *
 * Run: node scripts/probe-subscribe.mjs [secondsBetweenFrames]
 */
import WebSocket from 'ws';

const PARTNER = process.env.PARTNER_ID ?? 'd3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f';
const LANG = process.env.LANG_CODE ?? 'en-001';
const GAP = Number(process.argv[2] ?? 1200);

const url = `wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=${LANG}&externalPartnerId=${PARTNER}&EIO=4&transport=websocket`;

const candidates = [
  ['subscribe",{"type":"sports"}', '42["subscribe",{"type":"sports"}]'],
  ['subscribe (array)', '42["subscribe",["sports"]]'],
  ['sub channels', '42["sub",{"channels":["sports"]}]'],
  ['sports/subscribe', '42["sports/subscribe",{}]'],
  ['subscribe sportIds', '42["subscribe",{"sportIds":[18]}]'],
  ['subscribe channel prematch', '42["subscribe",{"channel":"prematch"}]'],
  ['subscribe channel live', '42["subscribe",{"channel":"live"}]'],
  ['subscribe matches', '42["subscribe",{"matchIds":[40337530]}]'],
  ['join room football', '42["join",{"room":"football"}]'],
  ['subscribe odds', '42["subscribe",{"event":"odds","payload":{"matchId":40337530}}]'],
  ['odds:subscribe', '42["odds:subscribe",{"matchId":40337530}]'],
  ['get-many', '42["get-many",{"sportIds":[18]}]'],
  ['matches get-many', '42["matches","get-many"]'],
  ['auth empty', '42["auth",{}]'],
  ['login guest', '42["login",{"guest":true}]'],
  ['get sports', '42["sports:get-many",{}]'],
];

const responses = [];
const ws = new WebSocket(url, {
  headers: {
    Origin: 'https://bitgames6205.com',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  },
  handshakeTimeout: 15000,
});

let i = 0;
let timer;

ws.on('open', () => {
  console.log(`OPEN ${url}`);
  setTimeout(() => ws.send('40'), 300);
});

ws.on('message', (data) => {
  const s = data.toString();
  responses.push(s);
  console.log('  <- ' + (s.length > 500 ? s.slice(0, 500) + `...<+${s.length - 500}>` : s));
  if (s === '2') ws.send('3');
});

ws.on('error', (e) => console.log('ERROR', e.message));
ws.on('close', (c, r) => console.log('CLOSE', c, r?.toString() ?? ''));

setTimeout(() => {
  timer = setInterval(() => {
    if (i >= candidates.length) {
      clearInterval(timer);
      console.log('\nframes answered:', responses.length);
      console.log('anything odds-like:', responses.some((r) => /"(coef|odds|price|kef|cf|corners?|cards?)"/i.test(r)));
      ws.close();
      setTimeout(() => process.exit(0), 500);
      return;
    }
    const [label, frame] = candidates[i++];
    console.log(`-> [${label}] ${frame}`);
    ws.send(frame);
  }, GAP);
}, 1500);
