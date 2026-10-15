import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { decodePushMessage, describeMarket } from '../server/push-decode.mjs';
import { isIdentifiedMarketName, buildMarkets } from '../server/collector.mjs';

// No numerical guesswork: a total line of 9.5 could mean goals,
// corners, cards, or something else without an identifying group/type.
assert.equal(describeMarket({ name: null, typeId: 777, groupId: 9898, line: 9.5, outcomes: ['under', 'over'] }), null);
assert.equal(describeMarket({ name: 'Corners', typeId: 777, groupId: 9898, subgames: '13' }), null);
assert.equal(describeMarket({ name: 'Total', typeId: 777, groupId: 9898 }), null);
assert.equal(describeMarket({ name: 'Total', typeId: 777, groupId: 9898, subgames: '3' }).name, 'Total Goals');
assert.deepEqual(describeMarket({ name: 'Corners. Result', typeId: null, groupId: 6481, subgames: '13' }), {
  column: 'corners', name: 'Corners. Result',
});
assert.deepEqual(describeMarket({ name: 'Yellow cards. Total', typeId: null, groupId: 7840, subgames: '174' }), {
  column: 'cards', name: 'Yellow cards. Total',
});
assert.deepEqual(describeMarket({ name: null, typeId: 320, groupId: 9998 }), {
  column: 'corners', name: 'Total Corners',
});

const mkGroup = (id, name, typeId, opts = {}) => ({
  id: String(id), ...(name === null ? {} : { name }),
  renderType: 'total-2', outcomes: ['under', 'over'],
  oddsList: [
    { id: '12:L:example:[' + typeId + ',[9.5],[0],1,4,[]]', cf: 1.87, status: 1 },
    { id: '12:L:example:[' + typeId + ',[9.5],[0],1,5,[]]', cf: 1.93, status: 1 },
  ],
  ...opts,
});
const frame = (groups) => ({
  messageType: 'match-odds', data: { matchId: 987654321, oddsGroups: groups },
});
const decoded = decodePushMessage(frame([
  mkGroup(99001, null, 777),
  mkGroup(99002, 'Corners', 777, { subgameIds: [13] }),
  mkGroup(99003, 'Corners. Result', 777),
  mkGroup(99004, null, 320),
]));
assert.equal(decoded.kind, 'odds');
assert.equal(decoded.rows.length, 4, 'only identified groups emit their prices');
assert.deepEqual(new Set(decoded.rows.map(row => row.marketName)), new Set(['Corners. Result', 'Total Corners']));
assert.equal(decoded.rows.filter(row => row.marketName === 'Total Corners')[0].line, '9.5');
assert.equal(decoded.rows.every(row => row.price > 0), true);

// Old cached prices with placeholders must not show even if a client receives them.
for (const name of ['Market', 'Unknown', 'Corners', 'Cards', 'Total', 'cols-2', 'Unverified market (g999)', 'Match Result (2-way)']) {
  assert.equal(isIdentifiedMarketName(name), false, name);
}
assert.equal(isIdentifiedMarketName('Total', '3'), true, 'known goal-total subgame still usable on the backend');
for (const name of ['Corners. Result', 'Corners. Odd/Even', 'Yellow cards. Total', 'Total Goals', 'Result and total']) {
  assert.equal(isIdentifiedMarketName(name), true, name);
}
const odds = [
  ['Unverified market (g1)', 'g1'],
  ['Corners', 'g2'],
  ['Corners. Result', 'g3'],
].map(([name, id]) => ({
  market_key: id, market_name: name, line: '', outcome_key: '1',
  outcome_name: 'Home', price: 1.8, board_column: 'corners',
}));
const shown = buildMarkets(odds);
assert.equal(shown.length, 1);
assert.equal(shown[0].name, 'Corners. Result');

// Test the UI catalog without browser/runtime, using the same TS transpiler
// already installed and used by test-sportsbook-labels.mjs.
const require = createRequire(import.meta.url);
const ts = require('../web/node_modules/typescript/lib/typescript.js');
const source = readFileSync(new URL('../web/src/utils/marketCatalog.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', compiled)(mod.exports, require, mod);
const ui = mod.exports;
const mk = (name, line = '', period = 0, marketType = 'OTHER') =>
  ({ id: 'test-' + name, name, line, period, marketType });
assert.equal(ui.isIdentifiedMarket(mk('Corners')), false);
assert.equal(ui.isIdentifiedMarket(mk('Unverified market')), false);
assert.equal(ui.isIdentifiedMarket(mk('Corners. Double chance')), true);
assert.equal(ui.marketCategoryOf(mk('Corners. Double chance')), 'corners');
assert.equal(ui.marketCategoryOf(mk('Yellow cards. Result')), 'cards');
assert.equal(ui.marketCategoryOf(mk('Result and total')), 'mixed');
assert.equal(ui.marketDisplayTitle(mk('Corners. Result'), 'al'), 'Kornet: Rezultati (1X2)');
assert.equal(ui.marketDisplayTitle(mk('Corners. Double chance'), 'al'), 'Kornet: Shansi i dyfishtë (1X / 12 / X2)');
assert.equal(ui.marketDisplayTitle(mk('Corners. Odd/Even'), 'en'), 'Corners. Odd/Even');
assert.equal(ui.marketDisplayTitle(mk('Total Corners', '9.5'), 'al', true), 'Kornet: Totali (Mbi/Nën) (9.5)');
assert.equal(ui.marketCategoryLabel('corners', 'al'), 'Kornet');
assert.equal(ui.marketSelectionLabel('Over 9.5', 'al'), 'Mbi 9.5');
assert.equal(ui.marketSelectionLabel('Iraq', 'al'), 'Iraq');
assert.equal(ui.marketGroupKey(mk('Total Corners', '9.5')), ui.marketGroupKey(mk('Total Corners', '10.5')));
assert.notEqual(ui.marketGroupKey(mk('Corners. Result')), ui.marketGroupKey(mk('Corners. Odd/Even')));

console.log('Market identity, grouping, language and unidentified-market tests passed');
