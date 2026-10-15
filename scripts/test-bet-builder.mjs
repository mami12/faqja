import assert from 'node:assert/strict';
import { findLeg, builderId, parseBuilderId } from '../server/ledger/bet-builders.mjs';
import { gradeLine } from '../server/ledger/settler.mjs';

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
