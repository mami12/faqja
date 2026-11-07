import assert from 'node:assert/strict';
import {aggregateOutcomeFamily,gradeAggregateOutcome,hasAggregateOutcomeEvidence}
 from '../server/ledger/aggregate-outcomes.mjs';

const result={home_team:'Home FC',away_team:'Away FC',
 home_score:2,away_score:1,half_home_score:1,half_away_score:0,
 corners_home:6,corners_away:4,cards_home:2,cards_away:1,
 statistics:{shots:{home:10,away:7},shotsOnTarget:{home:5,away:3},
  fouls:{home:11,away:13}}};
const line=(market_name,outcome_name,line='')=>({market_name,outcome_name,line});
const examples=[
 ['2nd Half Result','X','WON'],
 ['2nd Half Result','1','LOST'],
 ['2nd Half Double Chance','1X','WON'],
 ['2nd Half BTTS','Yes','WON'],
 ['2nd Half Total Goals','Over 1.5','WON'],
 ['2nd Half Total Goals','Under 2.0','VOID'],
 ['2nd Half Correct Score','1:1','WON'],
 ['First Half Correct Score','1:0','WON'],
 ['Home Team Clean Sheet','No','WON'],
 ['Away Team to Win to Nil','Yes','LOST'],
 ['Win to Nil','Home','LOST'],
 ['Winning Margin','Home by 1','WON'],
 ['Winning Margin','Away by 1','LOST'],
 ['Winning Margin','Home by 1+','WON'],
 ['Total Goals (Bands)','1-3','WON'],
 ['Total Goals (Exact)','3','WON'],
 ['Total Goals (Exact)','2','LOST'],
 ['Corners 1X2','Home','WON'],
 ['Corners 1X2','Draw','LOST'],
 ['Total Corners (Exact)','10','WON'],
 ['Total Corners (Bands)','9-11','WON'],
 ['Total Corners Odd/Even','Even','WON'],
 ['Total Cards (Bands)','2-4','WON'],
 ['Total Cards Odd/Even','Odd','WON'],
 ['Total Shots on Target (Exact)','8','WON'],
 ['Home Shots on Target (Bands)','4-6','WON'],
 ['Fouls (Bands)','23-25','WON'],
 ['Shots 1x2','Home','WON'],
 ['Fouls Odd/Even','Even','WON']
];
for (const [name,label,expected] of examples) {
 const wager=line(name,label);
 assert.ok(aggregateOutcomeFamily(name),'explicit market identified: '+name);
 assert.equal(hasAggregateOutcomeEvidence(wager,result),true,'evidence: '+name);
 assert.equal(gradeAggregateOutcome(wager,result),expected,name+': '+label);
}
const missing=[
 [line('2nd Half Result','X'),{...result,half_home_score:null}],
 [line('Total Corners (Bands)','2-4'),{...result,corners_home:null}],
 [line('Total Shots on Target (Exact)','8'),{...result,statistics:{}}],
 [line('2nd Half Correct Score','1:1'),{...result,half_away_score:null}]
];
for(const [wager,partial] of missing){
 assert.equal(hasAggregateOutcomeEvidence(wager,partial),false);
 assert.equal(gradeAggregateOutcome(wager,partial),null,'missing evidence must stay PENDING');
}
for (const name of [
 '2nd Half Goals 10-20 Minutes','Next Corner','Race to 5 Corners',
 'Player to Score 3+ Goals','Early Payout Win to Nil','Asian Corners',
 'First Half Fouls (Exact)','Penalty Shots 1x2','Winning Margin Extra Time',
 'Winning Margin','Total Corners (Exact) First Half'
]){
 const family=aggregateOutcomeFamily(name);
 if(name==='Winning Margin')assert.equal(family,'WINNING_MARGIN');
 else assert.equal(family,null,'must refuse ambiguous market: '+name);
}
assert.equal(gradeAggregateOutcome(line('Winning Margin','Other'),result),null);
assert.equal(gradeAggregateOutcome(line('Total Goals (Bands)','Other'),result),null);
assert.equal(gradeAggregateOutcome(line('Win to Nil','Draw'),result),null);
console.log('PASS verified aggregate outcomes: '+examples.length+' examples, missing-data and unsupported protections');
