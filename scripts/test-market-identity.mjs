import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { decodePushMessage, describeMarket } from '../server/push-decode.mjs';
import { isIdentifiedMarketName, buildMarkets } from '../server/collector.mjs';
import { isHandicapOfferMarket } from '../server/market-policy.mjs';

// A descriptive name from upstream is authoritative, even if the backend
// assigns marketType OTHER or the title is as brief as "Total" or "Corners".
for (const [raw, expectedColumn] of [
  ['Total', 'total'],
  ['Corners', 'corners'],
  ['Cards', 'cards'],
  ['Result', 'result'],
  ['Correct score', 'other'],
  ['Corners. Result', 'corners'],
  ['Corners. Double chance', 'corners'],
  ['Yellow cards. Total', 'cards'],
]) {
  const market = describeMarket({ name: raw, typeId: null, groupId: 90000 });
  assert.equal(market?.name, raw, 'raw provider title must not be translated/rewritten: ' + raw);
  assert.equal(market?.column, expectedColumn, raw);
}
assert.deepEqual(describeMarket({ name: 'Total', typeId: null, groupId: 6379 }), {
  name: 'Total', column: 'total',
}, 'g6379 preserves the exact provider name');
assert.equal(describeMarket({ name: null, typeId: 777, groupId: 9898 }), null,
  'truly nameless + unmapped markets must not be guessed');
assert.equal(describeMarket({ name: null, typeId: 320, groupId: 9898 })?.name, 'Total Corners',
  'a known type may provide its mapped English title in an unnamed delta');
assert.equal(describeMarket({ name: null, groupId: 6379 })?.name, 'Total Goals',
  'a verified group map can supply a title only when the provider does not send one');

const group = (id, name, typeId) => ({
  id: String(id),
  ...(name === null ? {} : { name }),
  renderType: 'total-2',
  outcomes: ['under', 'over'],
  oddsList: [
    { id: '12:L:markettest:[' + typeId + ',[9.5],[0],1,4,[]]', cf: 1.87, status: 1 },
    { id: '12:L:markettest:[' + typeId + ',[9.5],[0],1,5,[]]', cf: 1.93, status: 1 },
  ],
});
const decoded = decodePushMessage({
  messageType: 'match-odds',
  data: {
    matchId: 987654321,
    oddsGroups: [
      group(99001, null, 777),
      group(99002, 'Corners', 777),
      group(99003, 'Corners. Result', 777),
      group(99004, null, 320),
    ],
  },
});
assert.equal(decoded.kind, 'odds');
assert.equal(decoded.rows.length, 6, 'all three named/mapped groups are included');
assert.deepEqual(new Set(decoded.rows.map(x => x.marketName)),
  new Set(['Corners', 'Corners. Result', 'Total Corners']));
assert.equal(decoded.rows.every(x => x.price > 0 && x.line === '9.5'), true);

for (const name of ['Market', 'Unknown', 'cols-2', 'Unverified market (g999)']) {
  assert.equal(isIdentifiedMarketName(name), false, name);
}
for (const name of ['Total', 'Correct score', 'Corners', 'Cards', 'Result', 'Match Result (2-way)']) {
  assert.equal(isIdentifiedMarketName(name), true, name);
}
for (const name of ['Handicap', 'Asian Handicap', 'Corners. Handicap', 'Asian Corners', 'European Handicap']) {
  assert.equal(isHandicapOfferMarket({ name }), true, name + ' must not appear in any market API response');
}
for (const name of ['Asian Total', 'Total', 'Corners. Result', 'Yellow cards. Total', 'Correct score']) {
  assert.equal(isHandicapOfferMarket({ name }), false, name + ' is not a handicap');
}

// buildMarkets supplies the API, so it must include named groups but exclude
// handicap contracts, even if the client accidentally fails to filter them.
const rows = [
  ['Unverified market (g1)', 'g1'],
  ['Total', 'g6379'],
  ['Correct score', 'g6371'],
  ['Corners', 'g100'],
  ['Corners. Result', 'g6481'],
  ['Yellow cards. Total', 'g200'],
  ['Handicap', 'g6344'],
  ['Asian Corners', 'g321'],
  ['Asian Total', 'g322'],
].map(([marketName, marketKey]) => ({
  market_key: marketKey, market_name: marketName, line: '',
  outcome_key: '1', outcome_name: 'Home', price: 1.8,
  board_column: marketName.toLowerCase().includes('corner') ? 'corners' : 'total',
}));
const named = buildMarkets(rows).map(x => x.name);
assert.deepEqual(new Set(named),
  new Set(['Total', 'Correct score', 'Corners', 'Corners. Result', 'Yellow cards. Total', 'Asian Total']));

const require = createRequire(import.meta.url);
const ts = require('../web/node_modules/typescript/lib/typescript.js');
const source = readFileSync(new URL('../web/src/utils/marketCatalog.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', compiled)(mod.exports, require, mod);
const ui = mod.exports;
const mk = (name, line = '', period = 0, marketType = 'OTHER', extId = '') =>
  ({ id: 'test-' + extId + name + line, name, line, period, marketType, extId });

for (const name of ['Total', 'Correct score', 'Corners', 'Cards', 'Result']) {
  assert.equal(ui.isIdentifiedMarket(mk(name)), true, name + ' is a real upstream name');
  assert.equal(ui.marketDisplayTitle(mk(name), 'al'), name, name + ' must stay English');
}
assert.equal(ui.isIdentifiedMarket(mk('Unverified market')), false);
assert.equal(ui.marketDisplayTitle(mk('Total', '4.5', 0, 'OVER_UNDER', 'g6379'), 'al', true), 'Total (4.5)');
assert.equal(ui.marketDisplayTitle(mk('Corners. Result'), 'al'), 'Corners. Result');
assert.equal(ui.marketDisplayTitle(mk('Yellow cards. Total'), 'al'), 'Yellow cards. Total');
assert.equal(ui.marketDisplayTitle(mk('Total Corners', '9.5'), 'al', true), 'Total Corners (9.5)');
assert.equal(ui.marketCategoryOf(mk('Corners. Double chance')), 'corners');
assert.equal(ui.marketCategoryOf(mk('Corners. Result', '', 0, '1X2')), 'corners');
assert.equal(ui.marketCategoryOf(mk('Yellow cards. Result')), 'cards');
assert.equal(ui.marketCategoryOf(mk('Correct score')), 'goals');
assert.equal(ui.marketCategoryOf(mk('Result and total')), 'mixed');
assert.equal(ui.marketSelectionLabel('Over 9.5', 'al'), 'Over 9.5');
assert.equal(ui.marketSelectionLabel('Draw', 'al'), 'Draw');
assert.equal(ui.marketCategoryLabel('corners', 'en'), 'Corners');
assert.equal(ui.marketGroupKey(mk('Total Corners', '9.5', 0, 'CORNERS', 'g320')),
  ui.marketGroupKey(mk('Total Corners', '10.5', 0, 'CORNERS', 'g320')));
assert.notEqual(ui.marketGroupKey(mk('Total Corners', '9.5', 0, 'CORNERS', 'g320')),
  ui.marketGroupKey(mk('Total Corners', '9.5', 0, 'CORNERS', 'g900')),
  'different provider group IDs must never merge');
for (const name of ['Handicap', 'Asian Handicap', 'Corners. Handicap', 'Asian Corners']) {
  assert.equal(ui.isHandicapMarket(mk(name)), true, name);
}
assert.equal(ui.isHandicapMarket(mk('Asian Total')), false);
assert.equal(ui.isHandicapMarket(mk('Total')), false);

console.log('Provider names, category grouping and handicap exclusions passed');
