/**
 * What does the feed actually publish about suspension?
 *
 * The platform's own site locks the odds around a goal or a dangerous attack. This subscribes
 * to a few live matches exactly the way server/pusher.mjs does and tallies every signal that
 * could express that, so the board can lock the same way instead of guessing:
 *
 *   - the per-price `status` flag ("1 active, anything else suspended" - see push-decode.mjs)
 *   - the match-level `hasOpenOdds` flag
 *   - every other key a match-info frame carries, so a signal we have not decoded shows up
 *
 * Read-only: it opens its own subscription, writes nothing, and does not touch the server.
 *
 * Run: node scripts/probe-suspension.mjs [seconds] [ids]
 */
import WebSocket from 'ws';
import { config } from '../server/config.mjs';
import { fetchRealFootball } from '../server/upstream.mjs';

const seconds = Number(process.argv[2] ?? 75);
const idArg = process.argv[3] ? String(process.argv[3]).split(',').map(Number) : null;

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://bitgames6205.com',
  referer: 'https://bitgames6205.com/',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

const url = `wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=${encodeURIComponent(config.lang)}&externalPartnerId=${encodeURIComponent(config.partnerId)}&EIO=4&transport=websocket`;

const ids = idArg ?? (await fetchRealFootball()).rows.filter((r) => r.service === 'LIVE').slice(0, 40).map((r) => r.match_id);
console.log(`subscribing to ${ids.length} live matches for ${seconds}s\n`);

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const infoKeys = new Map(); // key -> how often it was present
const statusValues = new Map(); // item.status -> rows
const oddsSignals = { frames: 0, rows: 0, suspendedRows: 0, allSuspendedFrames: 0 };
const infoSignals = { frames: 0, hasOpenOdds: new Map(), enabledOddsCount: new Map(), feedStatus: new Map(), noOpenOdds: 0 };
let sampleInfo = null;
let sampleGroup = null;

const ws = new WebSocket(url, { headers: HEADERS, handshakeTimeout: 20000 });
let timer = null;

const subscribe = () => {
  if (ws.readyState !== WebSocket.OPEN) return;
  for (const part of chunk(ids, 50)) {
    ws.send(`42["subscribe",${JSON.stringify({ messageType: 'subscribe-match-odds', data: { matchIds: part, isBaseOddsGroups: false } })}]`);
    ws.send(`42["subscribe",${JSON.stringify({ messageType: 'subscribe-match-info', data: { matchIds: part } })}]`);
  }
};

ws.on('open', () => console.log('[probe] socket open'));
ws.on('error', (e) => console.error('[probe] error:', e.message));

ws.on('message', (data) => {
  const text = data.toString();
  if (text === '2') return ws.send('3');
  if (text.startsWith('0')) return ws.send('40');
  if (text.startsWith('40')) {
    subscribe();
    clearInterval(timer);
    timer = setInterval(subscribe, 20000);
    return;
  }
  if (!text.startsWith('42')) return;

  let msg = null;
  try {
    const args = JSON.parse(text.slice(text.indexOf('[')));
    msg = Array.isArray(args) && args[1] ? args[1] : null;
  } catch {
    return;
  }
  if (!msg?.messageType) return;

  if (msg.messageType === 'match-odds' || msg.messageType === 'match-odds-snapshot') {
    oddsSignals.frames++;
    let allSuspended = true;
    let rows = 0;
    for (const group of msg.data?.oddsGroups ?? []) {
      if (!sampleGroup) sampleGroup = { messageType: msg.messageType, group, matchId: msg.data?.matchId };
      for (const item of group.oddsList ?? []) {
        rows++;
        statusValues.set(item.status, (statusValues.get(item.status) ?? 0) + 1);
        if (Number(item.status) !== 1) oddsSignals.suspendedRows++;
        else allSuspended = false;
      }
    }
    oddsSignals.rows += rows;
    if (rows > 0 && allSuspended) oddsSignals.allSuspendedFrames++;
    return;
  }

  if (msg.messageType !== 'match-info' && msg.messageType !== 'match-info-snapshot') return;
  infoSignals.frames++;
  const d = msg.data ?? {};
  if (!sampleInfo) sampleInfo = { messageType: msg.messageType, data: d };
  for (const k of Object.keys(d)) infoKeys.set(k, (infoKeys.get(k) ?? 0) + 1);
  infoSignals.hasOpenOdds.set(String(d.hasOpenOdds), (infoSignals.hasOpenOdds.get(String(d.hasOpenOdds)) ?? 0) + 1);
  if (d.hasOpenOdds === false) infoSignals.noOpenOdds++;
  const count = d.enabledOddsCount ?? '(absent)';
  infoSignals.enabledOddsCount.set(String(count), (infoSignals.enabledOddsCount.get(String(count)) ?? 0) + 1);
  infoSignals.feedStatus.set(String(d.status), (infoSignals.feedStatus.get(String(d.status)) ?? 0) + 1);
});

const show = (m) => (m.size ? [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ') : '(none)');

setTimeout(() => {
  clearInterval(timer);
  try {
    ws.close();
  } catch {
    /* ignore */
  }

  console.log(`\nodds frames=${oddsSignals.frames} rows=${oddsSignals.rows}`);
  console.log(`  item.status values:      ${show(statusValues)}`);
  console.log(`  rows with status != 1:   ${oddsSignals.suspendedRows}`);
  console.log(`  frames fully suspended:  ${oddsSignals.allSuspendedFrames}`);
  console.log(`\nmatch-info frames=${infoSignals.frames}`);
  console.log(`  hasOpenOdds:             ${show(infoSignals.hasOpenOdds)}`);
  console.log(`  enabledOddsCount:        ${show(infoSignals.enabledOddsCount)}`);
  console.log(`  status (feedStatus):     ${show(infoSignals.feedStatus)}`);
  console.log(`  frames with hasOpenOdds=false: ${infoSignals.noOpenOdds}`);
  console.log(`\nkeys seen on match-info:   ${[...infoKeys.keys()].sort().join(', ')}`);
  if (sampleInfo) console.log(`\nsample match-info:\n${JSON.stringify(sampleInfo).slice(0, 1200)}`);
  if (sampleGroup) console.log(`\nsample odds group:\n${JSON.stringify(sampleGroup).slice(0, 700)}`);
  process.exit(0);
}, seconds * 1000);

