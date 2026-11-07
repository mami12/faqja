import test from 'node:test';
import assert from 'node:assert/strict';
import {basicOutcomeFamily,gradeBasicOutcome,isProvenDrawNoBetPush} from '../server/ledger/basic-outcomes.mjs';

const match={home_score:2,away_score:1,half_home_score:1,half_away_score:0,
  home_team:'Home FC',away_team:'Away FC'};
const line=(market_name,outcome_name,outcome_key='')=>({market_name,outcome_name,outcome_key});

test('Correct Score: wins only with the exact verified full-time score',()=>{
  assert.equal(gradeBasicOutcome(line('Correct Score','2:1'),match),'WON');
  assert.equal(gradeBasicOutcome(line('Exact Score','2-0'),match),'LOST');
  assert.equal(gradeBasicOutcome(line('Correct Score','Other'),match),null);
  assert.equal(basicOutcomeFamily('First Half Correct Score'),null);
  assert.equal(gradeBasicOutcome(line('Correct Score','2:1'),{home_score:null,away_score:1}),null);
});
test('Odd/Even includes goalless draws as even',()=>{
  assert.equal(gradeBasicOutcome(line('Odd/Even','Even'),{home_score:0,away_score:0}),'WON');
  assert.equal(gradeBasicOutcome(line('Total Goals Odd/Even','Odd'),match),'WON');
  assert.equal(gradeBasicOutcome(line('Odd/Even','Even'),match),'LOST');
});
test('DNB refunds only an explicitly parsed selection when the FT score is tied',()=>{
  const draw={...match,home_score:1,away_score:1};
  assert.equal(gradeBasicOutcome(line('Draw No Bet','Home FC'),draw),'VOID');
  assert.equal(isProvenDrawNoBetPush(line('Draw No Bet','Home FC'),draw),true);
  assert.equal(isProvenDrawNoBetPush(line('Correct Score','1:1'),draw),false);
  assert.equal(gradeBasicOutcome(line('DNB','Home FC'),match),'WON');
  assert.equal(gradeBasicOutcome(line('DNB','Away FC'),match),'LOST');
  assert.equal(gradeBasicOutcome(line('DNB','Unidentified'),draw),null);
});
test('HT/FT requires verified first half and final scores',()=>{
  assert.equal(gradeBasicOutcome(line('HT/FT','1/1'),match),'WON');
  assert.equal(gradeBasicOutcome(line('Half Time/Full Time','X/1'),match),'LOST');
  assert.equal(gradeBasicOutcome(line('HT/FT','1/1'),{...match,half_home_score:null}),null);
  assert.equal(gradeBasicOutcome(line('HT/FT','unverified'),match),null);
});
test('Double Chance and BTTS are two simultaneous conditions',()=>{
  assert.equal(gradeBasicOutcome(line('Double Chance And Both To Score','1X & Yes'),match),'WON');
  assert.equal(gradeBasicOutcome(line('Double Chance & BTTS','X2/Yes'),match),'LOST');
  assert.equal(gradeBasicOutcome(line('Double Chance & BTTS','12 & No'),match),'LOST');
  assert.equal(gradeBasicOutcome(line('Double Chance & BTTS','12 & Yes'),match),'WON');
  assert.equal(gradeBasicOutcome(line('Double Chance & BTTS','1X'),match),null);
});
test('Do not misclassify incident or period markets as full-time markets',()=>{
  for (const market of ['Next Goal','Race to 5 Corners','1st Half Odd/Even',
    'Correct Score 10-20 minutes','Early Payout - Correct Score']) {
    assert.equal(basicOutcomeFamily(market),null,market);
  }
});
