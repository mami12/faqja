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

console.log('Sportsbook label translation checks passed');
