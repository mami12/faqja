/**
 * Proves the two ways a price used to "change and then change back" are gone.
 *
 *  1) Two books price the same selection (odds ids carry the prefix: "10:…" and "12:L:…").
 *     Only one of them may reach the board, and the book the site itself reports (match-info
 *     providerId) is the one that wins - that is what made our prices differ from the source.
 *  2) A group whose ids carry no line repeats one outcome pattern per line, so the synthetic
 *     "#n" line is derived from the order. It must not depend on the order the feed sends the
 *     prices in, and a frame carrying only part of the group must reuse what a complete frame
 *     already told us (otherwise the price lands on a phantom market of its own).
 *
 * Offline: no server, no database, no network.
 * Run: node scripts/test-provider-pin.mjs
 */
import { decodePushMessage } from '../server/push-decode.mjs';
import * as store from '../server/odds-store.mjs';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!ok) failures++;
};

const oddsMessage = (matchId, groups) => ({ messageType: 'match-odds', data: { matchId, oddsGroups: groups } });
const resultGroup = (list) => ({ id: '6257', outcomes: ['1', 'x', '2'], renderType: 'cols-3', isBase: true, order: 0, oddsList: list });

const priceOf = (matchId, marketKey, line, outcomeKey) =>
  store
    .getOddsForMatches([matchId])
    .find((r) => r.market_key === marketKey && r.line === (line ?? '') && r.outcome_key === outcomeKey)?.price;

const MARKET_777001 = 777001;
const MARKET_777002 = 777002;

/* ------------------------------------------------- 1) two books, one selection -------- */

const from10 = decodePushMessage(
  oddsMessage(MARKET_777001, [resultGroup([{ id: '10:53552314920213864:1', cf: 2.1, status: 1 }])]),
);
const from12 = decodePushMessage(
  oddsMessage(MARKET_777001, [resultGroup([{ id: '12:L:9001:[1,[],[0],1,0,[]]', cf: 1.85, status: 1 }])]),
);

check(
  'decoded rows name the book that priced them',
  from10.rows[0].providerId === '10' && from12.rows[0].providerId === '12',
  `${from10.rows[0].providerId}/${from12.rows[0].providerId}`,
);

store.applyRows(from10.rows);
store.applyRows(from12.rows);
check('the second book cannot overwrite the first', priceOf(MARKET_777001, 'g6257', '', '1') === 2.1, `price=${priceOf(MARKET_777001, 'g6257', '', '1')}`);

store.setProvider(MARKET_777001, '12'); // match-info: this is the book the site itself sells from
store.applyRows(from12.rows);
check('the book the site reports takes the selection over', priceOf(MARKET_777001, 'g6257', '', '1') === 1.85, `price=${priceOf(MARKET_777001, 'g6257', '', '1')}`);

store.applyRows(from10.rows);
check('and the other book cannot take it back', priceOf(MARKET_777001, 'g6257', '', '1') === 1.85, `price=${priceOf(MARKET_777001, 'g6257', '', '1')}`);

const report = store.providerReport();
check('the disagreement is counted for /health', report.conflicts > 0 && report.recent.length > 0, JSON.stringify(report.recent[0] ?? {}));

/* ------------------------------- 2) a line-less group that repeats under/over --------- */

const lineLess = (entries) => ({
  id: '6499',
  outcomes: ['under', 'over'],
  renderType: 'total-2',
  isBase: false,
  order: 40,
  oddsList: entries.map(([n, price]) => ({ id: `10:53552314920213864:${n}`, cf: price, status: 1 })),
});

// three lines of under/over, sent in two different orders
const forward = lineLess([[100, 1.9], [101, 2.0], [200, 3.1], [201, 1.4], [300, 5.5], [301, 1.15]]);
const shuffled = lineLess([[300, 5.5], [301, 1.15], [100, 1.9], [101, 2.0], [200, 3.1], [201, 1.4]]);

const asMap = (rows) =>
  rows.map((r) => `${r.marketKey}|${r.line}|${r.outcomeKey}=${r.price}`).sort().join(' ');

const firstOrder = decodePushMessage(oddsMessage(MARKET_777002, [forward]));
const secondOrder = decodePushMessage(oddsMessage(MARKET_777002, [shuffled]));
check(
  'a reordered line-less group keeps the same lines and prices',
  asMap(firstOrder.rows) === asMap(secondOrder.rows),
  asMap(secondOrder.rows),
);

// only one line of the same group arrives -> it must reuse the line a complete frame gave it
const partial = decodePushMessage(oddsMessage(MARKET_777002, [lineLess([[200, 3.1], [201, 1.4]])]));
const partialRow = partial.rows[0];
check(
  'a partial frame reuses the line of the complete frame (no phantom market)',
  partialRow.line === '#2' && partialRow.outcomeKey === 'under',
  `line=${JSON.stringify(partialRow.line)} outcome=${partialRow.outcomeKey}`,
);

store.applyRows(firstOrder.rows);
store.applyRows(partial.rows);
check('the partial price lands on the line it belongs to', priceOf(MARKET_777002, 'g6499', '#2', 'under') === 3.1, `price=${priceOf(MARKET_777002, 'g6499', '#2', 'under')}`);
check(
  'no phantom market is created for it',
  store.getOddsForMatches([MARKET_777002]).every((r) => r.line !== ''),
  JSON.stringify(store.getOddsForMatches([MARKET_777002]).map((r) => r.line)),
);

/* ---------------------------------------------------------------- 3) housekeeping ------ */

check('clearMatch also drops the pin state', store.clearMatch(MARKET_777001) === true && store.getProvider(MARKET_777001) === null);

console.log(`\nstats: ${JSON.stringify(store.stats())}`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
