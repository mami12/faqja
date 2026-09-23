/**
 * Server-side subscription to the push channel (the one the browser uses).
 *
 * Verified protocol:
 *   <- 0{"sid":…}                         engine.io open
 *   -> 40                                 open the namespace
 *   <- 40{"sid":…,"pid":…}
 *   -> 42["subscribe",{"messageType":"subscribe-match-odds","data":{"matchIds":[ids…],"isBaseOddsGroups":true|false}}]
 *   -> 42["subscribe",{"messageType":"subscribe-match-info","data":{"matchIds":[ids…]}}]
 *   <- 42["u",{"messageType":"match-odds-snapshot"|"match-odds"|"match-info-snapshot"|"match-info",…},id]
 *   <- 2 / -> 3                           heartbeat every ~25s
 *
 * Subscriptions must be repeated every ~20s; ids are chunked by 50.
 */
import WebSocket from 'ws';
import { config } from './config.mjs';
import { decodePushBatch } from './push-decode.mjs';

const CHUNK = 50;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const HEADERS = {
  'user-agent': UA,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://bitgames6205.com',
  referer: 'https://bitgames6205.com/',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export function startPusher({
  getIds,
  onOdds,
  onInfo,
  onStatus,
  fullMarkets = false,
  fullMarketsLiveLimit = 60,
  resubscribeMs = 20000,
  verbose = true,
} = {}) {
  const url = `wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=${encodeURIComponent(
    config.lang,
  )}&externalPartnerId=${encodeURIComponent(config.partnerId)}&EIO=4&transport=websocket`;

  let ws = null;
  let closed = false;
  let attempt = 0;
  let timer = null;
  const counts = { connect: 0, frames: 0, oddsMessages: 0, infoMessages: 0, subscribedIds: 0 };

  const subscribe = async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const { live = [], prematch = [] } = (await getIds?.()) ?? {};

      const send = (messageType, ids, isBaseOddsGroups) => {
        for (const part of chunk(ids, CHUNK)) {
          const data = { matchIds: part };
          if (messageType === 'subscribe-match-odds') data.isBaseOddsGroups = isBaseOddsGroups;
          ws.send(`42["subscribe",${JSON.stringify({ messageType, data })}]`);
        }
      };

      // full market list for the first N live matches (corners, cards, ...),
      // base markets (1X2 / handicap / total) for everything else
      const fullLive = fullMarkets ? live.slice(0, fullMarketsLiveLimit) : [];
      const baseLive = fullMarkets ? live.slice(fullMarketsLiveLimit) : live;

      send('subscribe-match-odds', fullLive, false);
      send('subscribe-match-odds', baseLive, true);
      send('subscribe-match-info', live);
      const near = prematch.slice(0, 100);
      send('subscribe-match-odds', near, true);
      send('subscribe-match-info', near.slice(0, 25));
      for (const frame of config.subscribeFrames) ws.send(frame);

      counts.subscribedIds = live.length + near.length;
      counts.fullMarketsIds = fullLive.length;
      if (verbose) {
        console.log(
          `[pusher] subscribed live=${live.length} (full markets ${fullLive.length}) prematch=${near.length}`,
        );
      }
    } catch (e) {
      console.error('[pusher] subscribe failed:', e.message);
    }
  };

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(url, { headers: HEADERS, handshakeTimeout: 20000 });

    ws.on('open', () => {
      attempt = 0;
      counts.connect++;
      onStatus?.({ connected: true });
      console.log('[pusher] socket open');
    });

    ws.on('message', (data) => {
      const text = data.toString();

      if (text === '2') {
        ws.send('3');
        return;
      }
      if (text.startsWith('0')) {
        ws.send('40');
        return;
      }
      if (text.startsWith('40')) {
        subscribe();
        clearInterval(timer);
        timer = setInterval(subscribe, resubscribeMs);
        return;
      }
      if (!text.startsWith('42')) return;

      counts.frames++;
      const { infos, odds } = decodePushBatch([text]);
      for (const o of odds) {
        counts.oddsMessages++;
        onOdds?.(o.rows);
      }
      for (const i of infos) {
        counts.infoMessages++;
        onInfo?.(i);
      }
    });

    ws.on('error', (e) => onStatus?.({ connected: false, error: e.message }));
    ws.on('close', () => {
      clearInterval(timer);
      onStatus?.({ connected: false });
      if (closed) return;
      const delay = Math.min(30000, 3000 * 2 ** attempt++);
      console.log(`[pusher] closed, reconnecting in ${Math.round(delay / 1000)}s`);
      setTimeout(connect, delay);
    });
  };

  connect();

  return {
    stats: () => ({ ...counts }),
    close() {
      closed = true;
      clearInterval(timer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
