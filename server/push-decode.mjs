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

/**
 * Names/columns are guessed; market-map.json (types / groups) wins when present.
 * Football heuristic: an under/over line >= 6.5 is almost never total goals.
 */
function describeMarket({ typeId, groupId, line, renderType, outcomes }) {
  const fromGroup = MARKET_MAP.groups[String(groupId)];
  if (fromGroup) return { column: fromGroup.column, name: fromGroup.name };

  const fromType = MARKET_MAP.types[String(typeId)];
  if (fromType) return { column: fromType.column, name: fromType.name };

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

        const outcomeKey = outcomes.length ? outcomes[i % outcomes.length] : String(i);
        const { column, name } = describeMarket({
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
          outcomeName: outcomeLabel(outcomeKey),
          price,
          suspended: Number(item.status) !== 1,
          column,
          period,
          groupId: String(group.id),
          renderType,
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
