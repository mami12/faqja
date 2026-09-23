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

const isTotalPair = (outcomes) =>
  outcomes.length > 0 && outcomes.every((o) => ['under', 'over', 'u', 'o'].includes(String(o).toLowerCase()));

/** /subgames/get-many?sportId=18 -> market family per subgame id (verified against the API) */
const SUBGAME_FAMILY = {
  2: 'result',   // Main
  3: 'total',    // Total
  6: 'other',    // Handicap
  11: 'other',   // Correct Score
  13: 'corners', // Corners
  174: 'cards',  // Cards/Penalties
};
// checked in this order, so "Corners. Odd/Even" ([3,13]) counts as corners
const SUBGAME_PRIORITY = ['13', '174', '3', '2'];

function columnFromSubgames(subgames = '') {
  const ids = String(subgames).split(',').map((s) => s.trim()).filter(Boolean);
  for (const want of SUBGAME_PRIORITY) if (ids.includes(want)) return SUBGAME_FAMILY[want];
  for (const id of ids) if (SUBGAME_FAMILY[id]) return SUBGAME_FAMILY[id];
  return null;
}

function columnFromName(name) {
  const s = String(name).toLowerCase();
  if (/corner/.test(s)) return 'corners';
  if (/card|booking|penalt|yellow|red/.test(s)) return 'cards';
  if (/1x2|1 ?x ?2|result|winner|double chance|moneyline|to win|to qualify/.test(s)) return 'result';
  if (/total|over\/?under|goals|handicap|asian|odd\/even/.test(s)) return 'total';
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

  if (name) return { column: subColumn ?? columnFromName(name), name };

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

  if (type === 'match-info') {
    const periods = Array.isArray(data.periodsScore) ? data.periodsScore : [];
    const home = periods.reduce((s, p) => s + (Number(p.t1) || 0), 0);
    const away = periods.reduce((s, p) => s + (Number(p.t2) || 0), 0);

    // per-team live statistics, e.g. {"87150":{"corners":"2","yellowCards":"1","redCards":"0"}, ...}
    const rawResults = data.scoreBoard?.results;
    let stats = null;
    if (rawResults && typeof rawResults === 'object') {
      stats = {};
      for (const [competitorId, r] of Object.entries(rawResults)) {
        if (!r || typeof r !== 'object') continue;
        const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
        stats[competitorId] = {
          corners: n(r.corners),
          yellow: n(r.yellowCards),
          red: n(r.redCards),
        };
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
        homeScore: periods.length ? home : null,
        awayScore: periods.length ? away : null,
        stats,
      },
    };
  }

  if (type === 'match-odds') {
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

      for (let i = 0; i < oddsList.length; i++) {
        const item = oddsList[i];
        const price = Number(item.cf);
        if (!Number.isFinite(price)) continue;

        const tuple = extractOddsTuple(item.id);
        const period = tuple?.period ?? 0;
        const rawLine = tuple ? (tuple.line ?? null) : null;
        const missingLine = rawLine === null || rawLine === undefined || rawLine === '';
        // ids from some providers carry no line, and one group then repeats
        // under/over for several lines -> keep a synthetic line so keys stay unique
        const repeats = outcomes.length > 0 && oddsList.length > outcomes.length;
        const line = missingLine ? (repeats ? `#${Math.floor(i / outcomes.length) + 1}` : '') : String(rawLine);

        // the feed usually tells us the outcome itself ("outcome":"1x", "name":"Iraq Or Draw")
        const outcomeKey =
          item.outcome !== null && item.outcome !== undefined
            ? String(item.outcome)
            : outcomes.length
              ? outcomes[i % outcomes.length]
              : `#${i + 1}`;
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
