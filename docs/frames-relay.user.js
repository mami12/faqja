// ==UserScript==
// @name         Odds frames relay (faqja)
// @namespace    faqja
// @version      1.1
// @description  Forwards the site's push-server-v2 frames to your own backend so real odds/score reach your board. No account data is sent - only the odds/score messages the page already receives.
// @match        https://bitgames6205.com/*
// @match        https://*.bitgames6205.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  'use strict';

  /* ------------------------------- settings ------------------------------ */
  const API_BASE = 'https://YOUR-SERVICE.up.railway.app'; // <- your Railway URL
  const TOKEN = 'YOUR_INGEST_TOKEN';                       // <- INGEST_TOKEN
  const SOCKET_RE = /push-server-v2|v4\/socket\.io/;       // only these sockets
  const RELAY_OUTGOING = true;                             // archive subscription frames too
  const FLUSH_MS = 400;
  const MAX_BATCH = 200;
  /* ---------------------------------------------------------------------- */

  if (API_BASE.includes('YOUR-SERVICE')) {
    console.warn('[relay] set API_BASE and TOKEN inside the script first');
    return;
  }

  let incoming = [];
  let outgoing = [];
  let sent = 0;
  let failed = 0;

  const post = (frames, direction) => {
    if (!frames.length) return;
    const url = `${API_BASE}/ingest/frames${direction === 'out' ? '?direction=out' : ''}`;
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ingest-token': TOKEN },
      body: JSON.stringify({ frames }),
      keepalive: true,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        sent += frames.length;
      })
      .catch(() => {
        failed += frames.length;
        if (direction === 'in') incoming = frames.concat(incoming); // retry next tick
      });
  };

  setInterval(() => {
    if (incoming.length) {
      const batch = incoming.slice(0, MAX_BATCH);
      incoming = incoming.slice(batch.length);
      post(batch, 'in');
    }
    if (RELAY_OUTGOING && outgoing.length) {
      const batch = outgoing.slice(0, MAX_BATCH);
      outgoing = outgoing.slice(batch.length);
      post(batch, 'out');
    }
  }, FLUSH_MS);

  setInterval(() => {
    if (sent || failed) console.log(`[relay] forwarded=${sent} failed=${failed} queued=${incoming.length}`);
  }, 30000);

  const hooked = new WeakSet();
  const proto = window.WebSocket.prototype;
  const origAddEventListener = proto.addEventListener;
  const origSend = proto.send;

  function hook(ws) {
    if (hooked.has(ws)) return;
    hooked.add(ws);
    try {
      if (!SOCKET_RE.test(String(ws.url))) return;
      origAddEventListener.call(ws, 'message', (ev) => {
        const data = typeof ev.data === 'string' ? ev.data : null;
        if (data && data.includes('"messageType"')) incoming.push(data);
      });
      console.log('[relay] hooked', ws.url.slice(0, 60));
    } catch (e) {
      console.warn('[relay] hook failed', e.message);
    }
  }

  // socket.io assigns onmessage; wrap the accessor so its own handler still runs
  const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  if (desc && desc.set) {
    Object.defineProperty(proto, 'onmessage', {
      configurable: true,
      get: desc.get,
      set(fn) {
        hook(this);
        return desc.set.call(this, fn);
      },
    });
  }

  proto.addEventListener = function (type, listener, options) {
    if (type === 'message') hook(this);
    return origAddEventListener.call(this, type, listener, options);
  };

  if (RELAY_OUTGOING) {
    proto.send = function (data) {
      try {
        if (hooked.has(this) && typeof data === 'string' && data.length < 4000) outgoing.push(data);
      } catch (e) {
        /* ignore */
      }
      return origSend.call(this, data);
    };
  }

  // hook sockets created before this script ran (rare with @run-at document-start)
  for (const ws of performance.getEntriesByType?.('resource') || []) void ws;
})();
