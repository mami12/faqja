import assert from 'node:assert/strict';
import { findLeg, builderId, parseBuilderId } from '../server/ledger/bet-builders.mjs';
import { gradeLine } from '../server/ledger/settler.mjs';
import { isDecidedLiveMarket, isDecidedLiveOutcome } from '../server/ledger/decided-markets.mjs';

const market = (name, type, line, outcome, code, odds) => ({
  id: name, name, marketType: type, line, status: 'ACTIVE',
  outcomes: [{ id: name + ':' + code, name: outcome, code, odds, status: 'ACTIVE' }],
});
const match = { id:'123', markets: [
  market('1X2','1X2','','1','1',4.31),
  market('Both Teams to Score','OTHER','','Yes','Yes',2.41),
  market('Total','OVER_UNDER','2.5','Over','Over',1.9),
]};
const legs = [{market:'1X2',outcome:'1',line:''},{market:'BTTS',outcome:'Yes',line:''}];
const found = legs.map(l => findLeg(match,l));
assert.ok(found.every(Boolean));
assert.equal(Number(found.reduce((p,l)=>p*l.outcome.odds,1).toFixed(4)),10.3871);
assert.equal(findLeg(match,{market:'TOTAL',outcome:'Over',line:'3.5'}),null);
assert.ok(findLeg(match,{market:'TOTAL',outcome:'Over',line:'2.5'}));
// Underlying total is ACTIVE from a stale feed, but three goals have already
// decided the 2.5 line. No synthetic Bet Builder may keep offering it.
const late = {...match,status:'LIVE',homeScore:2,awayScore:1};
assert.equal(findLeg(late,{market:'TOTAL',outcome:'Over',line:'2.5'}),null);
assert.ok(findLeg({...late,homeScore:2,awayScore:0},{market:'TOTAL',outcome:'Over',line:'2.5'}));
assert.ok(findLeg(late,{market:'1X2',outcome:'1',line:''}), '1X2 leader is not final mid-match');
const bothScored = {...match,status:'LIVE',homeScore:1,awayScore:1};
assert.equal(findLeg(bothScored,{market:'BTTS',outcome:'Yes',line:''}),null);
assert.ok(findLeg({...bothScored,awayScore:0},{market:'BTTS',outcome:'Yes',line:''}));
const riskSuspended = structuredClone(match);
riskSuspended.markets[2].outcomes[0].status='SUSPENDED';
assert.equal(findLeg(riskSuspended,{market:'TOTAL',outcome:'Over',line:'2.5'}),null);
assert.equal(findLeg({...riskSuspended,markets:riskSuspended.markets.map(m=>({...m,status:'SUSPENDED'}))},
 {market:'TOTAL',outcome:'Over',line:'2.5'}),null);
// Use feed evidence before blocking a normal placement: absent raw score_at
// must not turn placeholder scores into confirmed completed markets.
const raw = {service:'LIVE',home_score:2,away_score:1,score_at:new Date().toISOString()};
assert.equal(isDecidedLiveMarket(raw,{name:'Total',line:'2.5'}),true);
assert.equal(isDecidedLiveMarket({...raw,score_at:null},{name:'Total',line:'2.5'}),false);
assert.equal(isDecidedLiveMarket(raw,{name:'Total Corners',line:'2.5'}),false);
assert.equal(isDecidedLiveMarket(raw,{name:'Total',line:'3.5'}),false);
assert.equal(isDecidedLiveMarket(raw,{name:'1X2',line:''}),false);
assert.equal(isDecidedLiveMarket({...raw,away_score:1},{name:'Both Teams To Score',line:''}),true);
assert.equal(isDecidedLiveMarket({...raw,away_score:0},{name:'Both Teams To Score',line:''}),false);
assert.equal(isDecidedLiveMarket({...raw,service:'PREMATCH'},{name:'Total',line:'2.5'}),false);
// Apply the same completed-contract rule to REAL provider combos at the
// placement boundary, not just to React filtering.
const selection = (marketName, outcomeName, line = '') => ({
  name: marketName, outcome_name: outcomeName, line, period:0,
});
assert.equal(isDecidedLiveOutcome(raw,selection('Result and Total','Draw And Under 2.5')),true);
assert.equal(isDecidedLiveOutcome(raw,selection('Result and Total','Home And Over 2.5')),true);
assert.equal(isDecidedLiveOutcome(raw,selection('Result and Total','Home And Over 3.5')),false);
assert.equal(isDecidedLiveOutcome(raw,selection('Total and both teams to score','Over 2.5 And Yes')),true);
assert.equal(isDecidedLiveOutcome({...raw,home_score:1,away_score:1},
  selection('Result and both teams to score','Home And No')),true);
assert.equal(isDecidedLiveOutcome({...raw,home_score:2,away_score:0},
  selection('Result and both teams to score','Home And No')),false);
assert.equal(isDecidedLiveOutcome(raw,selection('Double Chance & Total','X/2&P_2.5')),true);
assert.equal(isDecidedLiveOutcome({...raw,home_score:2,away_score:0},
  selection('Double Chance & Total','X/2&P_2.5')),false);
assert.equal(isDecidedLiveOutcome({...raw,home_score:1,away_score:1},
  selection('1X2 & BTTS','2&G/G')),true);
assert.equal(isDecidedLiveOutcome(raw,selection('G/G & Total','G/G&+2.5')),true);
assert.equal(isDecidedLiveOutcome({...raw,score_at:null},selection('Result and Total','Draw And Under 2.5')),false,
  'a score placeholder cannot void player choices');
assert.equal(isDecidedLiveOutcome({...raw,service:'PREMATCH'},selection('Result and Total','Home And Over 2.5')),false);
assert.equal(isDecidedLiveOutcome(raw,selection('Result and Total','Unknown selection')),false);
assert.equal(isDecidedLiveOutcome(raw,selection('1X2','1')),false);
assert.equal(isDecidedLiveOutcome(raw,selection('Total Corners','Over 2.5','2.5')),false);
assert.equal(isDecidedLiveOutcome({...raw,phase:'1H'},
  {...selection('1st Half Result and Total','Home And Over 2.5'), period:1}),true);
assert.equal(isDecidedLiveOutcome({...raw,phase:'1H',home_score:2,away_score:0},
  {...selection('1st Half Result and Total','Home And Over 2.5'), period:1}),false);
assert.equal(isDecidedLiveOutcome({...raw,service:'LIVE'},selection('Bet Builder: DC and Total',
 'DC X2 + TOTAL Under 2.5')),true);
const projected = {...late, scoreAt: null};
assert.ok(findLeg(projected,{market:'TOTAL',outcome:'Over',line:'2.5'}),
  'without provider-confirmed score, frontend synthetic quotes are not hidden by an inferred score');
assert.equal(findLeg({...projected,scoreAt:raw.score_at},{market:'TOTAL',outcome:'Over',line:'2.5'}),null);

const id=builderId('123','11111111-1111-4111-8111-111111111111');
assert.deepEqual(parseBuilderId(id),{matchId:'123',templateId:'11111111-1111-4111-8111-111111111111'});
assert.equal(parseBuilderId('123|1X2||1'),null);
const frozen = {builder_legs:[
  {market_name:'1X2',outcome_key:'1',outcome_name:'1',line:''},
  {market_name:'Both Teams to Score',outcome_key:'Yes',outcome_name:'Yes',line:''},
]};
const result = (home,away)=>({home_score:home,away_score:away,home_team:'Home',away_team:'Away'});
assert.equal(gradeLine(frozen,result(2,1)),'WON');
assert.equal(gradeLine(frozen,result(1,0)),'LOST');
assert.equal(gradeLine(frozen,result(1,2)),'LOST');
assert.equal(gradeLine({builder_legs:[...frozen.builder_legs,{market_name:'Unsupported',outcome_key:'X'}]},result(2,1)),'VOID');
console.log('Universal builder market matching and frozen settlement passed');
