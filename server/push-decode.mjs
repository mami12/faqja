/**
 * Decoder for the platform's push messages (captured from push-server-v2).
 *
 * Captured frame shapes:
 *   42["u",{"messageType":"match-info","data":{"matchId":40451752,"ts":…,
 *        "enabledOddsCount":30,"service":"LIVE","providerId":12}}, "<id>"]
 *   42["u",{"messageType":"match-odds","data":{"matchId":40451752,"oddsGroups":[
 *        {"baseOrder":0,"id":"53278","isBase":true,"order":0,
 *         "outcomes":["1","2"],"renderType":"cols-2","oddsList":[
 *            {"id":"12:L:18636614:[1,[],[0],1,0,[]]","ts":…,"cf":1.11,"status":1}, …]}, …]}}, "<id>"]
 *
 *  cf     = coefficient / price
 *  status = 1 active, anything else = suspended
 *  odds id = <providerId>:<kind>:<matchOddsId>:[<oddsType>,[line],[period],1,<outcomeIdx>,[]]
 *  outcomes[] aligns positionally with oddsList[] (repeating when several lines share one group)
 *
 * Market *names* are not in the payload and there is no REST lookup for them
 * (only /odds-groups/get-descriptions, which covers a handful of groups), so
 * names/columns come from market-map.json + heuristics — see market-map.example.json.
 */
import fs from 'node:fs';
import path from 'node:path';

const MAP_FILE = process.env.MARKET_MAP_FILE ?? 'market-map.json';

function loadMarketMap() {
  const defaults = {
    // odds type id (first element of the bracket tuple) -> market description
    types: {
      1: { column: 'result', name: 'Full Time Result' },
      264: { column: 'total', name: 'Total Goals' },
    },
    // odds group id -> market description (wins over types)
    groups: {},
  };
  try {
    const file = path.resolve(process.cwd(), MAP_FILE);
    if (fs.existsSync(file)) {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        types: { ...defaults.types, ...(json.types ?? {}) },
        groups: { ...defaults.groups, ...(json.groups ?? {}) },
      };
    }
  } catch (e) {
    console.warn('[push-decode] market map ignored:', e.message);
  }
  return defaults;
}

const MARKET_MAP = loadMarketMap();

/** parses "42[...]" / "43..." / "0{...}" into { packet, args } */
export function parsePushFrame(text) {
  const raw = String(text ?? '').trim();
  const packet = Number(raw.slice(0, 2)) || Number(raw.slice(0, 1));

  if (!raw.includes('[')) return { packet, args: null };

  const start = raw.indexOf('[');
  try {
    const args = JSON.parse(raw.slice(start));
    return { packet, args };
  } catch {
    return { packet, args: null };
  }
}

/** pulls type/line/period/outcome index out of an odds id */
export function extractOddsTuple(idStr) {
  const str = String(idStr ?? '');
  const start = str.indexOf('[');
  if (start < 0) return null;
  try {
    const arr = JSON.parse(str.slice(start));
    if (!Array.isArray(arr)) return null;
    const lineArr = Array.isArray(arr[1]) ? arr[1] : [];
    const periodArr = Array.isArray(arr[2]) ? arr[2] : [];
    return {
      typeId: arr[0] ?? null,
      line: lineArr.length ? lineArr[0] : null,
      period: periodArr.length ? periodArr[0] ?? 0 : 0,
      outcomeIdx: typeof arr[4] === 'number' ? arr[4] : null,
    };
  } catch {
    return null;
  }
}

const OUTCOME_NAMES = { '1': 'Home', x: 'Draw', '2': 'Away', under: 'Under', over: 'Over' };

export function outcomeLabel(key) {
  return OUTCOME_NAMES[String(key).toLowerCase()] ?? String(key);
}

/** "12:L:18636614:[…]" -> "12"; "10:53552314920213864:1" -> "10" */
export function providerOfOddsId(idStr) {
  const m = String(idStr ?? '').match(/^(\d+)\s*:/);
  return m ? m[1] : null;
}

/**
 * One odds group can repeat the same outcome pattern for several lines while its ids carry
 * no line at all. The synthetic `#n` line is derived from the position, so the order must be
 * stable: a partial or reordered frame would otherwise re-key the same selection (the old key
 * keeps its price and the new one gets the new price, which looks like a price that "jumps"
 * and later comes back). Chunks are ordered by their lowest odds id, which the feed keeps
 * stable per selection.
 */
function stableChunks(oddsList, size) {
  if (!oddsList || !(size > 1) || oddsList.length <= size) return oddsList;
  const chunks = [];
  for (let s = 0; s < oddsList.length; s += size) chunks.push(oddsList.slice(s, s + size));
  chunks.sort((a, b) => String(a[0]?.id ?? '').localeCompare(String(b[0]?.id ?? '')));
  return chunks.flat();
}

/**
 * Odds ids of a line-less repeated group ("10:…" with no vars) cannot say which line a price
 * belongs to. A complete frame can, so remember what we assigned per odds id and reuse it when
 * a later frame carries only part of the group - otherwise the price was written under an empty
 * line and showed up as a market of its own, with a price that looked absurd next to the real
 * lines. Bounded, and dropped wholesale if it ever grows too large.
 */
const SLOT_CACHE = new Map(); // `${matchId}|${groupId}|${oddsId}` -> { line, outcomeKey }
const SLOT_CACHE_MAX = 20000;

function rememberedSlot(matchId, groupId, oddsId) {
  return SLOT_CACHE.get(`${matchId}|${groupId}|${oddsId}`) ?? null;
}

function rememberSlot(matchId, groupId, oddsId, slot) {
  if (SLOT_CACHE.size >= SLOT_CACHE_MAX) SLOT_CACHE.clear();
  SLOT_CACHE.set(`${matchId}|${groupId}|${oddsId}`, slot);
}

const isTotalPair = (outcomes) =>
  outcomes.length > 0 && outcomes.every((o) => ['under', 'over', 'u', 'o'].includes(String(o).toLowerCase()));

/** /subgames/get-many?sportId=18 -> market family per subgame id (verified against the API) */
const SUBGAME_FAMILY = {
  3: 'total',    // Total
  6: 'other',    // Handicap
  11: 'other',   // Correct Score
  13: 'corners', // Corners
  174: 'cards',  // Cards/Penalties
};
// checked in this order, so "Corners. Odd/Even" ([3,13]) counts as corners.
// NOTE: subgame 2 ("Main") is a bucket marker present on most markets, so it is
// deliberately not mapped - otherwise everything lands in the 1X2 column.
const SUBGAME_PRIORITY = ['13', '174', '3', '6', '11'];

function columnFromSubgames(subgames = '') {
  const ids = String(subgames).split(',').map((s) => s.trim()).filter(Boolean);
  for (const want of SUBGAME_PRIORITY) if (ids.includes(want)) return SUBGAME_FAMILY[want];
  for (const id of ids) if (SUBGAME_FAMILY[id]) return SUBGAME_FAMILY[id];
  return null;
}

function columnFromName(name) {
  const s = String(name).toLowerCase();
  if (/corner/.test(s)) return 'corners';
  // word boundaries matter: "scored" must not match "red"
  if (/\bcards?\b|\bbookings?\b|penalt|yellow|\bred\b/.test(s)) return 'cards';
  if (/1x2|1 ?x ?2|full time result|match result|winner|double chance|moneyline|to win|to qualify/.test(s)) {
    return 'result';
  }
  if (/handicap|fora|asian/.test(s)) return 'other';
  if (/total|over\/?under|\bgoals?\b|odd\/even/.test(s)) return 'total';
  return 'other';
}

/**
 * Names/columns come from, in order: market-map.json -> the feed's own
 * `name` + `subgameIds` -> the odds type id -> heuristics.
 */
function describeMarket({ name, typeId, groupId, line, renderType, outcomes, subgames }) {
  const fromGroup = MARKET_MAP.groups[String(groupId)];
  if (fromGroup) return { column: fromGroup.column, name: fromGroup.name };

  const subColumn = columnFromSubgames(subgames);

  if (name) {
    // the feed's own market name is the most reliable signal; subgames only fill gaps
    const byName = columnFromName(name);
    return { column: byName !== 'other' ? byName : (subColumn ?? 'other'), name };
  }

  const fromType = MARKET_MAP.types[String(typeId)];
  if (fromType) return { column: subColumn ?? fromType.column, name: fromType.name };

  if (subColumn) {
    return { column: subColumn, name: subColumn === 'corners' ? 'Corners' : subColumn === 'cards' ? 'Cards' : 'Market' };
  }
  if (outcomes.some((o) => String(o).toLowerCase() === 'x')) {
    return { column: 'result', name: 'Full Time Result' };
  }
  if (isTotalPair(outcomes)) {
    const n = Number(line);
    if (Number.isFinite(n) && n >= 6.5) return { column: 'corners', name: 'Total Corners' };
    return { column: 'total', name: 'Total' };
  }
  if (renderType === 'fora-2') return { column: 'other', name: 'Handicap' };
  if (outcomes.length === 2 && renderType === 'cols-2') return { column: 'result', name: 'Match Result (2-way)' };
  return { column: 'other', name: String(renderType ?? 'market') };
}

/** one decoded push message: { kind: 'info' | 'odds' | 'unknown', ... } */
export function decodePushMessage(message) {
  const type = message?.messageType;
  const data = message?.data ?? {};

  if (type === 'match-info' || type === 'match-info-snapshot') {
    const periods = Array.isArray(data.periodsScore) ? data.periodsScore : [];
    const periodHome = periods.reduce((s, p) => s + (Number(p.t1) || 0), 0);
    const periodAway = periods.reduce((s, p) => s + (Number(p.t2) || 0), 0);

    // matchScore.t1/t2 is the current score ("1","0"); periodsScore is the per-period breakdown
    const hasScore = data.matchScore && data.matchScore.t1 !== undefined && data.matchScore.t2 !== undefined;
    const score = hasScore
      ? { home: Number(data.matchScore.t1), away: Number(data.matchScore.t2) }
      : periods.length
        ? { home: periodHome, away: periodAway }
        : null;

    // per-team live statistics, e.g. {"87150":{"corners":"2","yellowCards":"1","redCards":"0"}, ...}
    // parsed generically so a goals/score field would be picked up too
    const rawResults = data.scoreBoard?.results;
    let stats = null;
    if (rawResults && typeof rawResults === 'object') {
      stats = {};
      for (const [competitorId, r] of Object.entries(rawResults)) {
        if (!r || typeof r !== 'object') continue;
        const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
        const entry = {
          corners: n(r.corners),
          yellow: n(r.yellowCards),
          red: n(r.redCards),
        };
        for (const [k, v] of Object.entries(r)) {
          if (/^(corners|yellowCards|redCards)$/i.test(k)) continue;
          if (!/goal|score|point/i.test(k)) continue;
          const num = n(v);
          if (num !== null) entry[`goals:${k}`] = num;
        }
        stats[competitorId] = entry;
      }
    }

    return {
      kind: 'info',
      info: {
        matchId: Number(data.matchId),
        ts: data.ts ?? null,
        service: data.service ?? null,
        providerId: data.providerId ?? null,
        enabledOddsCount: data.enabledOddsCount ?? null,
        periodsScore: periods,
        homeScore: score ? score.home : null,
        awayScore: score ? score.away : null,
        // real clock + feed state
        matchTimeMs: Number.isFinite(Number(data.matchTime)) ? Number(data.matchTime) : null,
        feedStatus: typeof data.status === 'string' ? data.status : null,
        // keep an explicit false: "this match has no open odds" is what locks its prices
        hasOpenOdds: typeof data.hasOpenOdds === 'boolean' ? data.hasOpenOdds : null,
        broadcastUrl: typeof data.broadcast?.url === 'string' ? data.broadcast.url : null,
        stats,
      },
    };
  }

  if (type === 'match-odds' || type === 'match-odds-snapshot') {
    const matchId = Number(data.matchId);
    const rows = [];
    let groups = 0;

    for (const group of data.oddsGroups ?? []) {
      const oddsList = Array.isArray(group.oddsList) ? group.oddsList : [];
      if (!oddsList.length) continue;
      groups++;

      const outcomes = (Array.isArray(group.outcomes) ? group.outcomes : []).map(String);
      const renderType = group.renderType ?? 'cols-2';
      const groupName = typeof group.name === 'string' && group.name.trim() ? group.name.trim() : null;
      const subgames = Array.isArray(group.subgameIds) ? group.subgameIds.join(',') : '';

      // The ids of some provider groups carry no line at all while the group repeats one
      // outcome pattern per line, so the synthetic `#n` line comes from the position. Derive
      // that position from a stable ordering (see stableChunks) so a partial or reordered
      // frame cannot re-key a selection the board already shows.
      const groupHasLine = oddsList.some((it) => {
        const t = extractOddsTuple(it.id);
        if (t && t.line !== null && t.line !== undefined) return true;
        return !!(it.vars && Object.values(it.vars).some((v) => /^-?\d+(\.\d+)?$/.test(String(v))));
      });
      const repeats = outcomes.length > 0 && oddsList.length > outcomes.length;
      const ordered = !groupHasLine && repeats ? stableChunks(oddsList, outcomes.length) : oddsList;

      for (let i = 0; i < ordered.length; i++) {
        const item = ordered[i];
        const price = Number(item.cf);
        if (!Number.isFinite(price)) continue;

        const tuple = extractOddsTuple(item.id);
        const period = tuple?.period ?? 0;
        // provider-10 ids carry no line in the bracket, but the price object does
        // ("vars":{"v1":"1.5"}); fall back to it before inventing a synthetic line
        const varsLine = item.vars
          ? Object.values(item.vars).find((v) => /^-?\d+(\.\d+)?$/.test(String(v)))
          : null;
        const rawLine = tuple && tuple.line !== null && tuple.line !== undefined
          ? tuple.line
          : varsLine !== undefined && varsLine !== null
            ? Number(varsLine)
            : null;
        const missingLine = rawLine === null || rawLine === undefined || rawLine === '';
        // A frame that does not carry whole outcome chunks cannot say which line its prices
        // belong to (the ids have no line and they repeat the same outcomes). Reuse what a
        // complete frame already told us for these exact odds ids instead of inventing an
        // empty line, which used to land the price on a phantom market of its own.
        const remembered = missingLine && !repeats ? rememberedSlot(matchId, group.id, item.id) : null;
        const line = !missingLine
          ? String(rawLine)
          : repeats
            ? `#${Math.floor(i / outcomes.length) + 1}`
            : remembered?.line ?? '';

        // the feed usually tells us the outcome itself ("outcome":"1x", "name":"Iraq Or Draw")
        const positionalOutcome = outcomes.length ? outcomes[i % outcomes.length] : `#${i + 1}`;
        const outcomeKey =
          item.outcome !== null && item.outcome !== undefined
            ? String(item.outcome)
            : remembered?.outcomeKey ?? positionalOutcome;

        // only a frame carrying whole outcome chunks can be trusted to say which line a price
        // belongs to, so that is the only thing we remember for later partial frames
        if (missingLine && repeats && outcomes.length > 0 && oddsList.length % outcomes.length === 0) {
          rememberSlot(matchId, group.id, item.id, { line, outcomeKey });
        }
        const outcomeName = item.name !== null && item.name !== undefined ? String(item.name) : outcomeLabel(outcomeKey);

        const { column, name } = describeMarket({
          name: groupName,
          subgames,
          typeId: tuple?.typeId ?? null,
          groupId: group.id,
          line: missingLine ? '' : rawLine,
          renderType,
          outcomes,
        });

        rows.push({
          matchId,
          marketKey: `g${group.id}${period ? `p${period}` : ''}`,
          marketName: name,
          line,
          outcomeKey,
          outcomeName,
          price,
          suspended: Number(item.status) !== 1,
          // the frame's odds id is prefixed with the book that priced it ("12:L:…", "10:…");
          // the odds store uses this so two books cannot overwrite each other
          providerId: providerOfOddsId(item.id),
          column,
          period,
          groupId: String(group.id),
          renderType,
          subgames,
          isBase: group.isBase === true,
          order: Number.isFinite(Number(group.order)) ? Number(group.order) : 0,
          baseOrder: Number.isFinite(Number(group.baseOrder)) ? Number(group.baseOrder) : 0,
        });
      }
    }
    return { kind: 'odds', matchId, groups, rows };
  }

  return { kind: 'unknown', message };
}

/**
 * Accepts anything: raw frame text, ["u", {...}] args, the inner message object,
 * or an array of any of those. Returns { infos, odds, unknown, frames }.
 */
export function decodePushBatch(input) {
  const items = Array.isArray(input) ? input : [input];
  const infos = [];
  const odds = [];
  const unknown = [];
  let frames = 0;

  const handleMessage = (msg) => {
    if (!msg || typeof msg !== 'object') return false;
    if (!msg.messageType) return false;
    const decoded = decodePushMessage(msg);
    if (decoded.kind === 'info') infos.push(decoded.info);
    else if (decoded.kind === 'odds') odds.push(decoded);
    else unknown.push(msg);
    return true;
  };

  for (const item of items) {
    if (typeof item === 'string') {
      frames++;
      const { args } = parsePushFrame(item);
      if (!args) {
        unknown.push({ text: item.slice(0, 200) });
        continue;
      }
      const payload = Array.isArray(args) && args.length > 1 && typeof args[1] === 'object' ? args[1] : args;
      if (handleMessage(payload)) continue;
      if (Array.isArray(payload)) for (const p of payload) handleMessage(p);
      else unknown.push(payload);
      continue;
    }

    if (Array.isArray(item)) {
      // ["u", {messageType,data}, id]
      if (item.length > 1 && typeof item[1] === 'object' && item[1]?.messageType) handleMessage(item[1]);
      else for (const p of item) handleMessage(p);
      continue;
    }

    if (typeof item === 'object') {
      if (!handleMessage(item)) unknown.push(item);
    }
  }

  return { infos, odds, unknown, frames };
}
