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
assert.equal(module.exports.translateOutcomeName('Arsenal/Draw', translate, 'Full Time Result', fixture), '1/X');
assert.equal(module.exports.parseHalfTimeFullTimeOutcome('Arsenal/Draw', fixture, '2/2'), null, 'conflicting provider code not misrepresented');
assert.equal(module.exports.translateOutcomeName('Arsenal/Draw', translate, htftMarket, fixture, '2/2'), 'Arsenal/Draw');


// Result + Both Teams To Score remains ONE bet, with six valid outcomes.
// Left/right Po/Jo refer to home/away scoring; 1/X/2 is the match result.
const mixedMarket = 'Result and Both Teams to Score';
const mixedExamples = [
  ['1/Yes', '1 & Po'],
  ['1/No', '1 & Jo'],
  ['X/Yes', 'X & Po'],
  ['X/No', 'X & Jo'],
  ['2/Yes', '2 & Po'],
  ['2/No', '2 & Jo'],
  ['1/Nil', '1 & Jo'],
  ['X/Nil', 'X & Jo'],
  ['2/Nil', '2 & Jo'],
  ['Nil/1', '1 & Jo'],
  ['Arsenal & No', '1 & Jo'],
  ['Chelsea & No', '2 & Jo'],
  ['Both Teams Not to Score and Draw', 'X & Jo'],
  ['Draw and Both Teams Not to Score', 'X & Jo'],
  ['Both Teams to Score and Draw', 'X & Po'],
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
  'X & Jo',
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
assert.equal(module.exports.translateOutcomeName('Nil', translate, mixedMarket, fixture), 'Jo', 'Display Nil in Albanian without inventing the result');
assert.equal(module.exports.translateOutcomeName('Nil', translate, 'Both Teams to Score', fixture), 'Jo', 'Translate standalone provider Nil to Jo');
assert.equal(module.exports.translateOutcomeName('2/Nil', translate, mixedMarket, fixture), '2 & Jo', 'Translate Nil mixed combination');
assert.equal(module.exports.isResultBttsMarket('Both Teams to Score'), false);
assert.equal(module.exports.isResultBttsMarket(mixedMarket), true);
assert.equal(module.exports.translateMarketName(mixedMarket, translate), 'Rezultati & Gol/Gol');
assert.equal(module.exports.translateMarketName('1st half. Result and both teams to score', translate), 'Pjesa e Parë: Rezultati & Gol/Gol');
assert.equal(module.exports.translateMarketName('Result and total', translate), 'Rezultati & Totali i Golave');
assert.equal(module.exports.translateMarketName('Total and both teams to score', translate), 'Totali i Golave & Gol/Gol');


// Feed-defined BTTS + goals-total combinations belong in MIKSE, not plain BTTS.
for (const title of [
  'Both Teams to Score & Total Goals Over/Under 2.5',
  'BTTS + Total Goals 2.5',
  'GG/NG & Over/Under 2.5',
  'Total Goals Over/Under & Both Teams to Score',
]) {
  assert.equal(module.exports.isBttsGoalsComboMarket(title), true, title);
  assert.equal(module.exports.translateMarketName(title, translate), 'Totali i Golave & Gol/Gol', title);
}
assert.equal(module.exports.isBttsGoalsComboMarket('Both Teams to Score'), false);
assert.equal(module.exports.isBttsGoalsComboMarket('Total Goals 2.5'), false);
assert.equal(module.exports.isBttsGoalsComboMarket('Corners and BTTS Total Goals'), false);

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

// The number belongs to the market, never to the 1/X/2 odds-button label.
const numberedExamples = [
  ['Next Goal', '2', '1 2', '1'],
  ['Next Goal', '2', 'X 2', 'X'],
  ['Next Goal', '2', '2 2', '2'],
  ['Next Corner', '9', '1 9', '1'],
  ['Next Corner', '9', 'X 9', 'X'],
  ['Next Corner', '9', '2 9', '2'],
  ['Next Goal 2', '', 'Chelsea 2', '2'],
  ['Next Corner 9', '', 'Home 9', '1'],
  ['Next Goal', '0', '1 0', '1'],
  ['Next Goal', '10000000000', 'X 10000000000', 'X'],
  ['Next Corner', '2.5', '1 2.5', '1'],
  ['Next Corner', '2.5', 'X 2,5', 'X'],
  ['Next Corner', '2,5', '2 2.5', '2'],
  ['Next Goal', '1000.25', '1/1000,25', '1'],
  ['Next Goal', '10.50', '10,5 / X', 'X'],
  ['Next Corner', '0.0', 'X 0', 'X'],
  ['Next Corner 12.5', '', '12,5 2', '2'],
  ['Team Total Corners', '17.5', 'Away 17,5', '2'],
  ['Any Other Market', '1234.567', 'Draw 1234.567', 'X'],
];
for (const [market, line, outcome, expected] of numberedExamples) {
  assert.equal(module.exports.formatOddsButtonLabel(outcome, market, line, translate, fixture), expected, market + ': ' + outcome);
  assert.equal(module.exports.formatTicketSelection(outcome, market, fixture, translate, undefined, line), expected, 'Ticket: ' + market + ': ' + outcome);
}
assert.equal(module.exports.formatOrdinalOutcomeLabel('1 9', 'Total Corners', '9', fixture), '1');
assert.equal(module.exports.formatOddsButtonLabel('1 9', 'Total Corners', '9', translate, fixture), '1');
assert.equal(module.exports.formatOddsButtonLabel('1 8', 'Next Corner', '9', translate, fixture), '1 8', 'Never remove a nonmatching number');
assert.equal(module.exports.formatOddsButtonLabel('1 2.5', 'Next Corner', '', translate, fixture), '1 2.5', 'Never guess a missing market line');
assert.equal(module.exports.formatOddsButtonLabel('1-0', 'Correct Score', '0', translate, fixture), '1-0', 'Do not damage correct scores');
assert.equal(module.exports.formatOddsButtonLabel('Over 2.5', 'Total Goals', '2.5', translate, fixture), 'Lart 2.5', 'Do not turn totals into 1/X/2');
assert.equal(module.exports.formatOddsButtonLabel('1/X', 'Half Time / Full Time', '1', translate, fixture), '1/X', 'Keep HT/FT combinations');
assert.equal(module.exports.formatMarketSelectionLabel('Next Corner', '9', translate).includes('9'), true, 'The market heading still carries its line');

console.log('Sportsbook label translation checks passed');

const filtersSource = readFileSync(new URL('../web/src/utils/sportsbookFilters.ts', import.meta.url), 'utf8');
const filterCompiled = ts.transpileModule(filtersSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const filtersModule = { exports: {} };
new Function('exports', 'require', 'module', filterCompiled)(filtersModule.exports, require, filtersModule);
const filter1X2 = filtersModule.exports.filterRedundantMatchResultMarkets;
const mockMarket = (name, period = 0, status = 'ACTIVE') => ({
  name, period, outcomes: [{ odds: 2.1, status }],
});
const fulltime = mockMarket('Full Time Result');
const genericWinner = mockMarket('Match Winner');
const genericResult = mockMarket('Match Result');
const firstHalf = mockMarket('1st Half Result', 1);
const combined = mockMarket('Result and both teams to score');
assert.deepEqual(
  filter1X2([fulltime, genericWinner, genericResult, firstHalf, combined]),
  [fulltime, firstHalf, combined],
  'When Full Time Result exists, hide only duplicated generic Match Winner / Match Result',
);
assert.deepEqual(
  filter1X2([genericWinner, genericResult, firstHalf]),
  [genericWinner, genericResult, firstHalf],
  'Never remove the only remaining result markets',
);
assert.deepEqual(
  filter1X2([mockMarket('Full Time Result', 0, 'SUSPENDED'), genericWinner]),
  [mockMarket('Full Time Result', 0, 'SUSPENDED'), genericWinner],
  'Do not hide live available result market when canonical odds are suspended',
);

const comboCases = [
  ['Result and total', 'Lyon And Over 2.5', '1 & Mbi 2.5'],
  ['Result and total', 'Crystal Palace And Under 2.5', '2 & Nën 2.5'],
  ['Result and total', 'Draw And Over 2.5', 'X & Mbi 2.5'],
  ['Total and both teams to score', 'Over 2.5 And No', 'Mbi 2.5 & Jo'],
  ['Total and both teams to score', 'Under 2.5 And Yes', 'Nën 2.5 & Po'],
  ['Result and both teams to score', 'Lyon To Nil', '1 & Jo'],
  ['Result and both teams to score', 'Crystal Palace And Both To Score', '2 & Po'],
  ['1st half. Result and both teams to score', 'Both Teams Not To Score and Draw', 'X & Jo'],
];
for (const [market, outcome, expected] of comboCases) {
  assert.equal(module.exports.translateOutcomeName(outcome, translate, market, 'Lyon vs Crystal Palace'), expected, outcome);
  assert.equal(module.exports.formatTicketSelection(outcome, market, 'Lyon vs Crystal Palace', translate), expected, 'Ticket ' + outcome);
}

const matchDetailSource = readFileSync(new URL('../web/src/components/Sports/MatchDetail.tsx', import.meta.url), 'utf8');
assert.match(
  matchDetailSource,
  /category:\s*getGroupCategory\(marketList\[0\]\.name\)/,
  'Categorize match detail groups by the original market name, never by composite type:period:name keys',
);
for (const providerMarket of [
  'Result and total',
  'Total and both teams to score',
  'Result and both teams to score',
  '1st half. Result and both teams to score',
]) {
  assert.equal(module.exports.isAnyMixedMarket(providerMarket), true, providerMarket + ' must be in MIKSE');
}

const alt1X2 = [
  mockMarket('Match Winner (3-way)'),
  mockMarket('Match Result (1X2)'),
  mockMarket('1X2'),
  mockMarket('Match Winner'),
  mockMarket('Match Result'),
];
assert.deepEqual(filter1X2([fulltime, ...alt1X2]), [fulltime], 'Hide every redundant generic three-way 1X2 alias');
const retainedDistinctMarkets = [
  mockMarket('Match Winner (2-way)'),
  mockMarket('1st half. Result', 1),
  mockMarket('2nd half. Result', 2),
  mockMarket('Half Time / Full Time'),
  mockMarket('Result and total'),
  mockMarket('Match Winner', 1),
];
assert.deepEqual(
  filter1X2([fulltime, ...retainedDistinctMarkets]),
  [fulltime, ...retainedDistinctMarkets],
  'Other-period, 2-way and mixed contracts must not be removed',
);
assert.deepEqual(
  filter1X2([mockMarket('Full time result'), ...alt1X2]),
  [mockMarket('Full time result')],
  'Canonical title capitalization must not matter',
);
