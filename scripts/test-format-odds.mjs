import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url), ts = require('typescript');
const source = readFileSync(new URL('../web/src/utils/formatOdds.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'require', 'module', compiled)(module.exports, require, module);
const { formatOdds } = module.exports;
for (const [value, expected] of [
  [1, '1.00'], [3, '3.00'], [75.9, '75.90'], [3.96, '3.96'], [3.9601, '3.9601'],
  [8.189, '8.189'], [8.1890, '8.189'], [4.31 * 1.9, '8.189'], [2.1000, '2.10'],
  [2.1001, '2.1001'], [2.1010, '2.101'], [15.18, '15.18'], [0, '0.00'],
  [12.123456, '12.1235'], [null, '—'], [undefined, '—'], [NaN, '—'], [Infinity, '—'],
]) assert.equal(formatOdds(value), expected, String(value));
assert.notEqual(formatOdds(3.96), formatOdds(3.9601), 'a four-decimal quote change stays visible');
assert.equal((100 * 8.189).toFixed(2), '818.90', 'odds display must not round the quote used for monetary payout');
console.log('PASS odds formatter: two minimum/four maximum decimals, exact displayed quote changes and unchanged two-decimal money');
