/**
 * Exercise the production TypeScript UI-expiry policy without duplicating it.
 * TypeScript is already installed by the sportsbook CI workflow.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const file = readFileSync(new URL('../web/src/utils/marketExpiry.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(file, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { isMarketExpired, filterDecidedOutcomes, isMarketVisible } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const outcome = (name, code = name, odds = 1.8) =>
  ({ name, code, id: name, odds, status: 'ACTIVE' });
const twoWay = (name, line = '', opts = {}) =>
  ({ name, line, status: 'ACTIVE', marketType: 'OVER_UNDER',
    outcomes: [outcome('Over'), outcome('Under')], ...opts });
const btts = (name = 'Both Teams to Score') =>
  ({ name, status: 'ACTIVE', marketType: 'OTHER',
    outcomes: [outcome('Yes'), outcome('No')] });
const match = (h, a, options = {}) =>
  ({ status: 'LIVE', period: '1H', currentMinute: 30,
    homeScore: h, awayScore: a, corners: null, cards: null, ...options });
const expired = (m, market) => isMarketExpired(m, market);
const visible = (m, market) => isMarketVisible(m, market);
const open = (m, market) => assert.equal(visible(m, market), true, market.name + ' must remain');
const closed = (m, market) => assert.equal(visible(m, market), false, market.name + ' must be hidden');

// Goals: 2-0 irrevocably settles both Over 0.5 and Under 0.5,
// but not over/under 2.5 or the eventual match winner.
for (const line of ['0.5', '1.5']) closed(match(2,0), twoWay('Total',line));
open(match(2,0),twoWay('Total','2.5'));
open(match(2,0),twoWay('Total','2.0'));
closed(match(2,0),twoWay('Total Goals 1.5'));
open(match(2,0),twoWay('Total Goals 2.5'));
open(match(2,0),{ name:'1X2',marketType:'1X2',outcomes:[outcome('1'),outcome('X'),outcome('2')] });
open(match(2,0),{ name:'Double Chance',outcomes:[outcome('1X')] });

// BTTS is terminal once each side scores, even though the 1X2 result can change.
closed(match(1,1),btts());
closed(match(1,2),btts('BTTS'));
open(match(2,0),btts());
open(match(0,0),btts());
closed(match(1,1),btts('1st Half Both Teams to Score'));
open(match(1,1,{period:'2H',currentMinute:65}),btts('2nd Half Both Teams to Score'));
open(match(1,1),{name:'1X2&BTTS',outcomes:[outcome('1&Yes'),outcome('X&No')]});

// Corners/cards use their own stats, NOT goals.
closed(match(0,0,{corners:{home:4,away:1}}), twoWay('Total Corners','3.5',{marketType:'CORNERS'}));
open(match(0,0,{corners:{home:4,away:1}}), twoWay('Total Corners','5.5',{marketType:'CORNERS'}));
closed(match(0,0,{cards:{home:2,away:1}}), twoWay('Total Cards','1.5',{marketType:'CARDS'}));
open(match(2,2,{cards:null}),twoWay('Total Cards','1.5',{marketType:'CARDS'}));
closed(match(0,0,{corners:{home:4,away:0}}),twoWay('Home Team Total Corners','2.5',{marketType:'CORNERS'}));
open(match(0,0,{corners:{home:4,away:0}}),twoWay('Away Team Total Corners','2.5',{marketType:'CORNERS'}));
open(match(0,0,{corners:null}),twoWay('Total Corners','0.5',{marketType:'CORNERS'}));

// First/second half rules: don't use full-match goals for a second-half line.
closed(match(2,0,{period:'HT',currentMinute:45}),twoWay('First Half Total','1.5',{period:1}));
closed(match(2,0,{period:'HT',currentMinute:45}),{name:'Halftime/Fulltime',outcomes:[outcome('1/1')]});
closed(match(2,0,{period:'2H',currentMinute:65}),twoWay('1st Half Total','4.5',{period:1}));
open(match(2,0,{period:'2H',currentMinute:65}),twoWay('2nd Half Total','0.5',{period:2}));
closed(match(2,0,{period:'1H',currentMinute:27}),twoWay('1st Half Total','1.5',{period:1}));

// First/ordinal events, races and elapsed time windows.
closed(match(1,0),{name:'First Goal',outcomes:[outcome('Home'),outcome('Away')]});
closed(match(1,0),{name:'Time of First Goal',outcomes:[outcome('1-10'),outcome('11-20')]});
open(match(1,0),{name:'Next Goal',outcomes:[outcome('Home'),outcome('Away')]});
closed(match(2,1),{name:'3rd Goal',outcomes:[outcome('Home')]});
closed(match(3,0),{name:'Race to 3 Goals',outcomes:[outcome('Home')]});
closed(match(0,0,{corners:{home:3,away:1}}),{name:'Race to 3 Corners',outcomes:[outcome('Home')]});
closed(match(0,0,{corners:{home:1,away:0}}),{name:'First Corner',outcomes:[outcome('Home')]});
closed(match(0,0,{currentMinute:21}),{name:'Goal before 20 minutes',outcomes:[outcome('Yes')]});
open(match(0,0,{currentMinute:19}),{name:'Goal before 20 minutes',outcomes:[outcome('Yes')]});

// Scoring-once contracts, but not anytime/next-goalscorer propositions.
closed(match(1,0),btts('Home Team to Score'));
open(match(1,0),btts('Away Team to Score'));
open(match(1,0),{name:'Player to Score Anytime',outcomes:[outcome('Player A')]});

// Impossible exact scores/goals disappear *individually*, not the entire market.
const correct = {name:'Correct Score',outcomes:[
  outcome('0:0'), outcome('1:0'), outcome('2:0'), outcome('2:1'),
  outcome('3:0'), outcome('Other')
]};
const scores = filterDecidedOutcomes(correct.outcomes,correct,match(2,0)).map(o=>o.name);
assert.deepEqual(scores,['2:0','2:1','3:0','Other']);
const exact = {name:'Number of Goals',outcomes:[outcome('0'),outcome('1'),outcome('2'),outcome('3')]};
assert.deepEqual(filterDecidedOutcomes(exact.outcomes,exact,match(2,0)).map(o=>o.name),['2','3']);
open(match(2,0),correct);

// No guessing: unknown markets, absent stats, and prematch must stay visible.
open(match(3,3),{name:'Player Shots on Target',outcomes:[outcome('Over')]});
open(match(3,3),{name:'Other Market',outcomes:[outcome('Yes')]});
open({status:'PREMATCH',homeScore:2,awayScore:2}, btts());
closed({status:'ENDED',homeScore:1,awayScore:0},btts());
assert.equal(expired(match(2,0),twoWay('Total','1.5')),true);
assert.equal(expired(match(2,0),twoWay('Total','3.5')),false);

console.log('Decided live market visibility tests passed');
