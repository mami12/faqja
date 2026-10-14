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


// Result + Both Teams To Score remains ONE bet, with six valid outcomes.
// Left/right Po/Jo refer to home/away scoring; 1/X/2 is the match result.
const mixedMarket = 'Result and Both Teams to Score';
const mixedExamples = [
  ['1/Yes', 'Po/Po&1'],
  ['1/No', 'Po/Jo&1'],
  ['X/Yes', 'Po/Po&X'],
  ['X/No', 'Jo/Jo&X'],
  ['2/Yes', 'Po/Po&2'],
  ['2/No', 'Jo/Po&2'],
  ['Arsenal & No', 'Po/Jo&1'],
  ['Chelsea & No', 'Jo/Po&2'],
  ['Both Teams Not to Score and Draw', 'Jo/Jo&X'],
  ['Draw and Both Teams Not to Score', 'Jo/Jo&X'],
  ['Both Teams to Score and Draw', 'Po/Po&X'],
];
for (const [input, expected] of mixedExamples) {
  assert.equal(
    module.exports.translateOutcomeName(input, translate, mixedMarket, fixture),
    expected,
    'MIKSE outcome: ' + input,
  );
  assert.equal(
    module.exports.formatTicketSelection(input, mixedMarket, fixture, translate),
    expected,
    'MIKSE saved ticket: ' + input,
  );
}
assert.equal(
  module.exports.translateOutcomeName('Unrecognized', translate, mixedMarket, fixture, 'X/No'),
  'Jo/Jo&X',
  'Use verified provider code if its descriptive name is unknown',
);
assert.equal(
  module.exports.translateOutcomeName('1/Yes', translate, mixedMarket, fixture, 'X/No'),
  '1/Yes',
  'Keep original label visible if provider fields contradict each other',
);
assert.equal(
  module.exports.translateOutcomeName('No', translate, mixedMarket, fixture),
  'No',
  'Never invent a result from plain BTTS No',
);
assert.equal(module.exports.isResultBttsMarket('Both Teams to Score'), false);
assert.equal(module.exports.isResultBttsMarket(mixedMarket), true);


const timeExamples = [
  ['Time of Scoring', '20', 'Yes', 'Koha e shënimit të golit · min. 20\' · Po'],
  ['Time of Scoring', '45', 'No', 'Koha e shënimit të golit · min. 45\' · Jo'],
  ['Goal before minute 20', '', 'Yes', 'Gol para minutës 20 · Po'],
  ['Goal after minute 60', '', 'No', 'Gol pas minutës 60 · Jo'],
];
for (const [market, line, selection, expected] of timeExamples) {
  assert.equal(
    module.exports.formatOddsButtonLabel(selection, market, line, translate, fixture),
    expected,
    'Minute on odds button: ' + market + ' ' + line,
  );
}
assert.equal(
  module.exports.formatOddsButtonLabel('Over', 'Over/Under 2.5', '2.5', translate, fixture),
  translate('outcomes.over'),
  'Unrelated odds buttons must remain unchanged',
);
assert.equal(module.exports.translateMarketName('Time of Scoring', translate), 'Koha e shënimit të golit');
assert.equal(module.exports.translateOutcomeName('Before minute 20', translate), 'Para minutës 20');
assert.equal(module.exports.translateOutcomeName('After minute 60', translate), 'Pas minutës 60');

const universalOutcomeExamples = [
  ['Arsenal', '1'],
  ['Chelsea', '2'],
  ['Draw', 'X'],
  ['Barazim', 'X'],
  ['Home', '1'],
  ['Vendas', '1'],
  ['Away', '2'],
  ['Udhëtues', '2'],
  ['First Goal Arsenal', 'Goli i parë: 1'],
  ['Team to Score Chelsea', 'Ekipi që shënon: 2'],
  ['Arsenal to score', '1 shënon gol'],
  ['Chelsea scores first', 'Goli i parë: 2'],
  ['Arsenal / Draw', '1 / X'],
  ['Home or Draw', '1 or X'],
];
for (const [input, expected] of universalOutcomeExamples) {
  assert.equal(module.exports.translateOutcomeName(input, translate, 'First Goal', fixture), expected, input);
  assert.equal(module.exports.formatTicketSelection(input, 'First Goal', fixture, translate), expected, 'Ticket: ' + input);
}
assert.equal(module.exports.compactOutcomeTeams('Arsenal Women', fixture), 'Arsenal Women', 'Do not replace partial team names');
assert.equal(module.exports.translateOutcomeName('Over 2.5', translate, 'Total Goals', fixture), 'Lart 2.5');

const ordinalExamples = [
  ['Next Goal', '2', '1 2', '1'],
  ['Next Goal', '2', 'X 2', 'X'],
  ['Next Goal', '2', '2 2', '2'],
  ['Next Corner', '9', '1 9', '1'],
  ['Next Corner', '9', 'X 9', 'X'],
  ['Next Corner', '9', '2 9', '2'],
  ['Next Goal 2', '', 'Chelsea 2', '2'],
  ['Next Corner 9', '', 'Home 9', '1'],
];
for (const [market, line, outcome, expected] of ordinalExamples) {
  assert.equal(module.exports.formatOddsButtonLabel(outcome, market, line, translate, fixture), expected, market + ': ' + outcome);
}
assert.equal(module.exports.formatOrdinalOutcomeLabel('1 9', 'Total Corners', '9', fixture), null);
assert.equal(module.exports.formatOddsButtonLabel('1 9', 'Total Corners', '9', translate, fixture), '1 9');

console.log('Sportsbook label translation checks passed');
