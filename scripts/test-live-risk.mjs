import assert from 'node:assert/strict';
import { config } from '../server/config.mjs';
import {
  liveRiskReason, riskMinute, isFullTimeWinnerMarket, isLeaderWinChoice,
} from '../server/live-risk.mjs';
import {
  DEFAULT_LIVE_RISK_SETTINGS, liveRiskSettings, setLiveRiskSettings, validateLiveRiskSettings,
} from '../server/live-risk-settings.mjs';

const now = Date.now();
const match = (minute, home, away, options = {}) => ({
  service: 'LIVE',
  match_time_ms: minute * 60000,
  clock_at: new Date(now).toISOString(),
  home_score: home,
  away_score: away,
  score_at: new Date(now).toISOString(),
  ...options,
});
const result = (side, price, options = {}) => ({
  marketName: 'Full Time Result',
  marketKey: '1x2',
  outcomeKey: side,
  price,
  ...options,
});
const check = (m, o) => liveRiskReason(m, o, now);

assert.equal(isFullTimeWinnerMarket('Full Time Result', 'g6321'), true);
for (const name of ['Next Goal','Corners Result','Half Time Result','Correct Score','Double Chance']) {
  assert.equal(isFullTimeWinnerMarket(name, '1x2'), false);
}
assert.equal(isLeaderWinChoice('1','Home','home'),true);
assert.equal(isLeaderWinChoice('2','Away','home'),false);
assert.equal(riskMinute(match(60,0,3),now),60);

// Milan 0-3 at minute 60: block only the away leader priced <=1.60.
assert.equal(check(match(59,0,3), result('2',1.50)),null);
assert.equal(check(match(60,0,3), result('2',1.60)),'leader_low_odds');
assert.equal(check(match(60,0,3), result('2',1.61)),null);
assert.equal(check(match(60,0,3), result('1',1.60)),null);
assert.equal(check(match(60,0,3), result('X',1.60)),null);
assert.equal(check(match(60,2,0), result('1',1.50)),null);
assert.equal(check(match(65,2,0), result('1',1.40)),'leader_low_odds');
assert.equal(check(match(65,2,0), result('1',1.41)),null);
assert.equal(check(match(70,2,0), result('1',1.60)),'leader_low_odds');
assert.equal(check(match(70,2,0), result('1',1.61)),null);
assert.equal(check(match(72,2,1), result('1',1.40)),null);
assert.equal(check(match(85,1,0), result('1',1.10)),'low_live_odds');

// Across all markets, including X, corners, cards, and totals.
for (const name of ['Full Time Result','Total Corners','Total Cards','Total Goals','Both Teams to Score']) {
  assert.equal(check(match(60,0,0),{marketName:name,outcomeKey:'X',price:1.05}),'low_live_odds');
  assert.equal(check(match(60,0,0),{marketName:name,outcomeKey:'X',price:1.06}),null);
  assert.equal(check(match(70,0,0),{marketName:name,outcomeKey:'X',price:1.10}),'low_live_odds');
  assert.equal(check(match(80,0,0),{marketName:name,outcomeKey:'X',price:1.20}),'low_live_odds');
  assert.equal(check(match(80,0,0),{marketName:name,outcomeKey:'X',price:1.21}),null);
}
assert.equal(check(match(70,0,0,{service:'PREMATCH'}), result('X',1.05)),null);

// Provider evidence is required for the leader rule.
assert.equal(check(match(65,3,0,{score_at:null}),result('1',1.40)),null);
assert.equal(check(match(60,3,0,{match_time_ms:null,live_minute:null}),result('1',1.40)),null);
const halftime=match(45,2,0,{phase:'HT',clock_at:new Date(now-45*60000).toISOString()});
assert.equal(riskMinute(halftime,now),45);

// Both master and admin switches are reversible.
const enabled=config.liveRiskEnabled;
config.liveRiskEnabled=false;
try {assert.equal(check(match(70,3,0),result('1',1.20)),null);}
finally {config.liveRiskEnabled=enabled;}
assert.equal(check(match(70,3,0),result('1',1.20)),'leader_low_odds');
const saved=structuredClone(liveRiskSettings());
try {
  setLiveRiskSettings({...saved,enabled:false});
  assert.equal(check(match(70,3,0),result('1',1.20)),null);
  setLiveRiskSettings({...saved,lowOddsRules:[{minute:45,maxOdds:1.25}]});
  assert.equal(check(match(46,0,0),result('X',1.25)),'low_live_odds');
} finally {setLiveRiskSettings(saved);}

// Admin validation: no malformed settings may reach the database.
assert.equal(validateLiveRiskSettings(DEFAULT_LIVE_RISK_SETTINGS).limits.maxLiveStake,10000);
for(const invalid of [
  {...saved,leaderRules:[{minute:-1,goals:2,maxOdds:1.6}]},
  {...saved,lowOddsRules:[{minute:70,maxOdds:1.1},{minute:70,maxOdds:1.2}]},
  {...saved,limits:{...saved.limits,maxLiveStake:Infinity}},
  {...saved,limits:{...saved.limits,maxMatchExposure:0}},
]) assert.throws(()=>validateLiveRiskSettings(invalid),e=>e.status===400);
console.log('Admin-configured live risk policy checks passed');
