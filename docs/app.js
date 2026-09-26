'use strict';

const CFG = window.APP_CONFIG || {};
const API = (CFG.API_BASE || '').replace(/\/$/, '');

const state = {
  service: 'live',
  league: '',
  q: '',
  limit: CFG.DEFAULT_LIMIT || 300,
  matches: new Map(),                        // id -> match object for the current tab
  order: [],                                 // ids in display order
  liveCache: { map: new Map(), order: [] },  // live matches pushed over the socket
  selectedId: null,                          // row expanded to show every market
  counts: null,
  socketState: 'connecting',
  lastMeta: null,
};

const prevPrices = new Map(); // "matchId|market|line|outcome" -> last rendered price

const RESULT_KEYS = [['1', 'home', 'w1', 'team1'], ['x', 'draw', 'tie'], ['2', 'away', 'w2', 'team2']];
const OVER_KEYS = ['over', 'o', 'more'];
const UNDER_KEYS = ['under', 'u', 'less'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function markets(m, column) {
  // the board columns show full-match markets only (period 0)
  return (m.markets || []).filter((x) => x.column === column && (x.period ?? 0) === 0);
}

const periodLabel = (p) => (p === 1 ? '1st half' : p === 2 ? '2nd half' : p ? `period ${p}` : '');

/** every market the feed has sent for this match (all periods, base first) */
function detailHtml(m) {
  const list = m.markets || [];
  const st = m.stats;
  const statsLine = st
    ? `<div class="dim">live stats — corners ${st.home?.corners ?? '–'}-${st.away?.corners ?? '–'} ·
        yellow ${st.home?.yellow ?? '–'}-${st.away?.yellow ?? '–'} · red ${st.home?.red ?? '–'}-${st.away?.red ?? '–'}
        ${m.score ? `· score ${m.score.home}-${m.score.away}` : ''}</div>`
    : '';
  const head = `<div class="detail-head">
      <b>${esc(m.home)} – ${esc(m.away)}</b>
      <span class="dim">${list.length} market${list.length === 1 ? '' : 's'}${
        m.oddsCount ? ` · feed reports ${m.oddsCount} enabled odds` : ''
      }</span>
      <button class="close-detail" data-close="1">close</button>
    </div>${statsLine}`;

  if (!list.length) {
    return `<tr class="detail"><td colspan="12">${head}<div class="dim">no odds received yet for this match (relay the frames while this match is open on the site)</div></td></tr>`;
  }

  const rows = list
    .map((mk) => {
      const outs = mk.outcomes
        .map(
          (o) =>
            `<span class="odds${o.suspended || mk.suspended ? ' susp' : ''}">${esc(o.name)}${
              o.price === null || o.price === undefined ? '' : ' ' + o.price.toFixed(2)
            }</span>`,
        )
        .join(' ');
      const meta = [mk.isBase ? 'base' : '', periodLabel(mk.period), mk.renderType || ''].filter(Boolean).join(' · ');
      return `<tr>
          <td class="d-name">${esc(mk.name)}${mk.line ? ' <b>' + esc(mk.line) + '</b>' : ''}</td>
          <td class="d-meta">${esc(meta)}</td>
          <td class="d-outs">${mk.suspended ? '<b class="susp-tag">SUSPENDED</b> ' : ''}${outs}</td>
        </tr>`;
    })
    .join('');

  return `<tr class="detail"><td colspan="12">${head}<table class="detail-table">${rows}</table></td></tr>`;
}

/** for the 1X2 column prefer a real "full time result" market */
function resultMarket(m) {
  const list = markets(m, 'result');
  return list.find((x) => /full time result|1 ?x ?2/i.test(x.name || '')) ?? pickLine(list, 0);
}

function pickLine(list, target) {
  let best = null;
  let bestDist = Infinity;
  for (const mkt of list) {
    const n = parseFloat(mkt.line);
    const d = Number.isFinite(n) ? Math.abs(n - target) : 99;
    if (d < bestDist) {
      bestDist = d;
      best = mkt;
    }
  }
  return best;
}

function outcomeByKey(mkt, keys) {
  if (!mkt) return null;
  return mkt.outcomes.find((o) => keys.includes(String(o.key).toLowerCase())) || null;
}

function priceCell(matchId, mkt, outcome) {
  if (!mkt || !outcome) return '<span class="odds empty">–</span>';
  const price = outcome.price;
  if (price === null || price === undefined) return '<span class="odds empty">–</span>';

  const key = `${matchId}|${mkt.key}|${mkt.line}|${outcome.key}`;
  const prev = prevPrices.get(key);
  prevPrices.set(key, price);

  const suspended = mkt.suspended || outcome.suspended;
  const trend = prev !== undefined && Number(prev) !== Number(price) ? (Number(price) > Number(prev) ? ' up' : ' down') : '';
  const title = `${mkt.name}${mkt.line ? ' ' + mkt.line : ''} — ${outcome.name}${suspended ? ' (suspended)' : ''}`;

  return `<span class="odds${suspended ? ' susp' : trend}" title="${esc(title)}">${price.toFixed(2)}</span>`;
}

function timeCell(m) {
  if (m.live) {
    if (m.phase === 'HT') return '<span class="time-ht">HT</span>';
    if (m.status === 'ended' || m.phase === 'FT') return '<span class="time-pre">FT</span>';
    return `<span class="time-live">${m.minute != null ? m.minute + "'" : 'LIVE'}</span>`;
  }
  const d = new Date(m.startAt);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const label = sameDay ? `${hh}:${mm}` : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hh}:${mm}`;
  return `<span class="time-pre">${label}</span>`;
}

function rowHtml(m) {
  const resultMkt = resultMarket(m);
  const totalMkt = pickLine(markets(m, 'total'), 2.5);
  const cornersMkt = pickLine(markets(m, 'corners'), 9.5);
  const cardsMkt = pickLine(markets(m, 'cards'), 3.5);

  const cls = m.suspended ? ' class="suspended"' : m.status === 'ended' ? ' class="ended"' : '';
  const tour = m.tournament && m.tournament.name ? `<span class="tour"> · ${esc(m.tournament.name)}</span>` : '';
  const score = m.score ? ` <b class="score">${esc(m.score.home)}-${esc(m.score.away)}</b>` : '';
  const mkts = m.marketCount ? `<span class="mkts">${m.marketCount} mkts</span>` : '';
  const st = m.stats;
  const stats = st
    ? `<span class="stats">corners ${st.home?.corners ?? '–'}-${st.away?.corners ?? '–'}` +
      ` · cards ${(st.home?.yellow ?? 0) + (st.home?.red ?? 0)}-${(st.away?.yellow ?? 0) + (st.away?.red ?? 0)}` +
      (st.home?.red || st.away?.red ? ' (red!)' : '') +
      `</span>`
    : '';

  return `<tr${cls} data-id="${m.id}">
    <td class="c-time">${timeCell(m)}</td>
    <td class="c-league"><span class="league">${esc(m.league.name || m.league.slug || '')}</span></td>
    <td class="c-match"><span class="match">${esc(m.home)} – ${esc(m.away)}</span>${score}${tour}${mkts}${stats}</td>
    ${RESULT_KEYS.map((keys) => `<td class="c-num">${priceCell(m.id, resultMkt, outcomeByKey(resultMkt, keys))}</td>`).join('')}
    <td class="c-num">${priceCell(m.id, totalMkt, outcomeByKey(totalMkt, OVER_KEYS))}</td>
    <td class="c-num">${priceCell(m.id, totalMkt, outcomeByKey(totalMkt, UNDER_KEYS))}</td>
    <td class="c-num">${priceCell(m.id, cornersMkt, outcomeByKey(cornersMkt, OVER_KEYS))}</td>
    <td class="c-num">${priceCell(m.id, cornersMkt, outcomeByKey(cornersMkt, UNDER_KEYS))}</td>
    <td class="c-num">${priceCell(m.id, cardsMkt, outcomeByKey(cardsMkt, OVER_KEYS))}</td>
    <td class="c-num">${priceCell(m.id, cardsMkt, outcomeByKey(cardsMkt, UNDER_KEYS))}</td>
  </tr>`;
}

function visibleMatches() {
  const list = state.order.map((id) => state.matches.get(id)).filter(Boolean);
  const q = state.q.trim().toLowerCase();
  return list.filter((m) => {
    if (state.league && m.league.slug !== state.league) return false;
    if (!q) return true;
    return `${m.home} ${m.away} ${m.league.name || ''} ${m.league.slug || ''} ${m.tournament?.name || ''}`
      .toLowerCase()
      .includes(q);
  });
}

function render() {
  const list = visibleMatches();
  const html = [];
  for (const m of list) {
    html.push(rowHtml(m));
    if (state.selectedId === m.id) html.push(detailHtml(m));
  }
  document.getElementById('rows').innerHTML = html.join('');
  document.getElementById('empty').textContent = list.length ? '' : 'no matches';
  document.getElementById('counts').textContent = state.counts
    ? `live ${state.counts.live} / prematch ${state.counts.prematch}`
    : 'live – / prematch –';
  const dot = document.getElementById('status');
  dot.dataset.state = state.socketState === 'connected' ? 'on' : 'off';
  dot.textContent = state.socketState === 'connected' ? 'realtime on' : 'realtime off';
  document.getElementById('stamp').textContent = state.lastMeta?.at
    ? `updated ${new Date(state.lastMeta.at).toLocaleTimeString()}`
    : 'updated –';
}

function mergeMarkets(matchId, incoming) {
  const apply = (m) => {
    if (!m) return;
    const list = Array.isArray(m.markets) ? [...m.markets] : [];
    for (const inc of incoming) {
      const idx = list.findIndex((x) => x.key === inc.key && (x.line ?? '') === (inc.line ?? ''));
      if (idx >= 0) list[idx] = inc;
      else list.push(inc);
    }
    m.markets = list;
    m.suspended = m.markets.length > 0 && m.markets.every((x) => x.suspended);
    m.hasSuspended = m.markets.some((x) => x.suspended);
  };
  apply(state.matches.get(matchId));
  apply(state.liveCache.map.get(matchId));
}

async function loadLeagues() {
  try {
    const res = await fetch(`${API}/api/leagues`);
    const json = await res.json();
    const sel = document.getElementById('league');
    const current = sel.value;
    sel.innerHTML =
      '<option value="">all leagues</option>' +
      json.items
        .map((l) => `<option value="${esc(l.slug)}">${esc(l.name || l.slug)} (${Number(l.live) + Number(l.prematch)})</option>`)
        .join('');
    sel.value = current;
  } catch (e) {
    console.warn('leagues failed', e);
  }
}

async function loadMatches() {
  document.getElementById('empty').textContent = 'loading…';
  try {
    const params = new URLSearchParams({ service: state.service, limit: String(state.limit) });
    const res = await fetch(`${API}/api/matches?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    state.matches = new Map(json.items.map((m) => [m.id, m]));
    state.order = json.items.map((m) => m.id);
    state.counts = json.counts;
    state.lastMeta = { at: new Date().toISOString() };
    render();
  } catch (e) {
    document.getElementById('empty').textContent = `failed to load: ${e.message}`;
  }
}

function connectSocket() {
  if (typeof io !== 'function') {
    state.socketState = 'off';
    render();
    return;
  }

  // with API_BASE empty the socket targets the page origin; that only works when
  // the backend serves this folder (local dev). On GitHub Pages set API_BASE.
  const socket = io(API || undefined, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    state.socketState = 'connected';
    render();
  });
  socket.on('disconnect', () => {
    state.socketState = 'off';
    render();
  });
  socket.on('hello', (h) => {
    document.getElementById('foot-note').textContent =
      `live minute is derived from kickoff (1H 0-45, HT, 2H 46-90). backend refresh ${Math.round((h.pollMs || 10000) / 1000)}s.`;
  });
  socket.on('meta', (meta) => {
    state.counts = { live: meta.live, prematch: meta.prematch };
    state.lastMeta = meta;
    render();
  });
  socket.on('matches:live', (payload) => {
    const map = new Map((payload.matches || []).map((m) => [m.id, m]));
    state.liveCache = { map, order: (payload.matches || []).map((m) => m.id) };
    if (payload.counts) state.counts = payload.counts;
    if (state.service === 'live') {
      state.matches = map;
      state.order = state.liveCache.order;
    }
    render();
  });
  socket.on('odds:update', ({ matchId, markets }) => {
    mergeMarkets(matchId, markets || []);
    render();
  });
  socket.on('match:info', (info) => {
    const apply = (m) => {
      if (!m || m.id !== info.match_id) return;
      if (info.home_score !== null && info.home_score !== undefined) {
        m.score = { home: info.home_score, away: info.away_score };
      }
      if (info.periods_score) m.periodsScore = info.periods_score;
      if (info.odds_count) m.oddsCount = info.odds_count;
      if (info.stats) m.stats = info.stats;
    };
    apply(state.matches.get(info.match_id));
    apply(state.liveCache.map.get(info.match_id));
    render();
  });
  socket.on('odds:socket', (s) => {
    console.log('[odds socket]', s);
  });
}

function switchService(service) {
  if (state.service === service) return;
  state.service = service;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.service === service));
  if (service === 'live' && state.liveCache.map.size) {
    state.matches = state.liveCache.map;
    state.order = state.liveCache.order;
    render();
    loadMatches(); // confirm with the server anyway
  } else {
    loadMatches();
  }
}

/* ------------------------------------------------------------------- wiring */

document.querySelectorAll('.tab').forEach((btn) =>
  btn.addEventListener('click', () => switchService(btn.dataset.service)),
);
document.getElementById('league').addEventListener('change', (e) => {
  state.league = e.target.value;
  render();
});
let searchTimer = null;
document.getElementById('q').addEventListener('input', (e) => {
  state.q = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 120);
});
document.getElementById('limit').addEventListener('change', (e) => {
  state.limit = Number(e.target.value);
  loadMatches();
});
document.getElementById('reload').addEventListener('click', () => {
  loadLeagues();
  loadMatches();
});

// click a row to open/close the full market list for that match
document.getElementById('rows').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) {
    state.selectedId = null;
    render();
    return;
  }
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const id = Number(tr.dataset.id);
  state.selectedId = state.selectedId === id ? null : id;
  render();
});

setInterval(() => {
  if (document.hidden) return;
  loadMatches();
}, state.service === 'live' ? CFG.LIVE_REFRESH_MS || 60000 : CFG.PREMATCH_REFRESH_MS || 120000);

setInterval(loadLeagues, 300000);

(async function init() {
  if (!API && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    document.getElementById('foot-note').textContent =
      'API_BASE is empty in config.js — set it to your Railway URL before deploying.';
  }
  await loadLeagues();
  await loadMatches();
  connectSocket();
})();
