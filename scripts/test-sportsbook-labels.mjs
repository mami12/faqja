import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('../web/node_modules/typescript/lib/typescript.js');
const source = readFileSync(new URL('../web/src/utils/sportsbookLabels.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'require', 'module', compiled)(module.exports, require, module);

const translations = {
  'markets.match_result': 'Rezultati i ndeshjes (1X2)',
  'markets.totals': 'Totali i golave',
  'markets.over_under': 'Lart / Poshtë',
  'outcomes.over': 'Lart',
  'outcomes.under': 'Poshtë',
  'outcomes.home': 'Vendas',
  'outcomes.draw': 'Barazim',
  'outcomes.away': 'Mysafir',
  'outcomes.yes': 'Po',
  'outcomes.no': 'Jo',
};
const translate = (key) => translations[key] ?? key;
const expectedExactGoals = 'Numri i saktë i golave të shënuar nga Balestier Khalsa';

assert.equal(
  module.exports.translateMarketName('Balestier Khalsa exact number of Golat scored', translate),
  expectedExactGoals,
);
assert.equal(
  module.exports.translateMarketName('Exact number of goals scored by Balestier Khalsa', translate),
  expectedExactGoals,
);
assert.equal(
  module.exports.translateOutcomeName('Balestier Khalsa exact number of goals scored', translate),
  expectedExactGoals,
);
assert.equal(
  module.exports.translateMarketName('Exact number of goals scored', translate),
  'Numri i saktë i golave të shënuar',
);
assert.equal(
  module.exports.translateMarketName('Over/Under 2.5', translate),
  'Lart / Poshtë 2.5',
);


const htftMarket = 'Half Time / Full Time';
const fixture = 'Arsenal vs Chelsea';
const htftExamples = [
  ['Arsenal / Arsenal', '1/1'],
  ['Arsenal/Draw', '1/X'],
  ['Arsenal / Chelsea', '1/2'],
  ['Draw / Arsenal', 'X/1'],
  ['Draw / Draw', 'X/X'],
  ['Draw / Chelsea', 'X/2'],
  ['Chelsea / Arsenal', '2/1'],
  ['Chelsea / Draw', '2/X'],
  ['Chelsea / Chelsea', '2/2'],
  ['Home/Draw', '1/X'],
  ['Away / Home', '2/1'],
  ['HH', '1/1'],
  ['HD', '1/X'],
  ['DA', 'X/2'],
  ['2/X', '2/X'],
];
for (const [input, expected] of htftExamples) {
  assert.equal(
    module.exports.translateOutcomeName(input, translate, htftMarket, fixture),
    expected,
    'HT/FT outcome: ' + input,
  );
  assert.equal(
    module.exports.formatTicketSelection(input, htftMarket, fixture, translate),
    expected,
    'HT/FT ticket: ' + input,
  );
}
assert.equal(module.exports.translateOutcomeName('Arsenal/Draw', translate, 'Full Time Result', fixture), 'Arsenal/Draw');
assert.equal(module.exports.parseHalfTimeFullTimeOutcome('Arsenal/Draw', fixture, '2/2'), null, 'conflicting provider code not misrepresented');
assert.equal(module.exports.translateOutcomeName('Arsenal/Draw', translate, htftMarket, fixture, '2/2'), 'Arsenal/Draw');

console.log('Sportsbook label translation checks passed');
