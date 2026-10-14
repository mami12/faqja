import assert from 'node:assert/strict';
import { config } from '../server/config.mjs';
import {
  liveRiskReason, riskMinute, isFullTimeWinnerMarket, isLeaderWinChoice,
} from '../server/live-risk.mjs';

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
assert.equal(isFullTimeWinnerMarket('Next Goal', '1x2'), false);
assert.equal(isFullTimeWinnerMarket('Corners Result', '1x2'), false);
assert.equal(isFullTimeWinnerMarket('Half Time Result', '1x2'), false);
assert.equal(isFullTimeWinnerMarket('Correct Score', '1x2'), false);
assert.equal(isLeaderWinChoice('1', 'Home', 'home'), true);
assert.equal(isLeaderWinChoice('2', 'Away', 'home'), false);
assert.equal(riskMinute(match(90, 1, 0), now), 90);

// The user's 90th-minute 1.01 case: never accept a very short live price.
assert.equal(check(match(90, 1, 0), result('1', 1.01)), 'ultra_low_late_price');
assert.equal(check(match(90, 0, 1), result('2', 1.01)), 'ultra_low_late_price');
assert.equal(check(match(90, 0, 0), result('X', 1.01)), 'ultra_low_late_price');

// Two-goal lead from 75': suspend the leader if the price is <= 1.50.
assert.equal(check(match(75, 2, 0), result('1', 1.50)), 'large_lead_low_price');
assert.equal(check(match(75, 0, 2), result('2', 1.40)), 'large_lead_low_price');
assert.equal(check(match(76, 2, 0), result('1', 1.51)), null);
assert.equal(check(match(75, 2, 0), result('2', 1.40)), null);
assert.equal(check(match(74, 2, 0), result('1', 1.40)), null);

// Score narrows: the risk-only lock must reopen when no longer warranted.
assert.equal(check(match(76, 2, 1), result('1', 1.40)), null);
assert.equal(check(match(85, 2, 1), result('1', 1.10)), 'late_leader_low_price');
assert.equal(check(match(85, 2, 1), result('1', 1.11)), null);
assert.equal(check(match(86, 1, 2), result('2', 1.08)), 'late_leader_low_price');

// Every market is protected against ultra-short prices at 85+.
assert.equal(check(match(85, 1, 0), { marketName: 'Total Corners', outcomeKey: 'Over', price: 1.04 }), 'ultra_low_late_price');
assert.equal(check(match(75, 2, 0), { marketName: 'Total Corners', outcomeKey: 'Over', price: 1.40 }), null);
assert.equal(check(match(85, 2, 0), { marketName: 'Next Goal', outcomeKey: '1', price: 1.09 }), null);

// No fake score: the win/lead rule needs a real provider score frame.
assert.equal(check(match(75, 2, 0, { score_at: null }), result('1', 1.40)), null);
assert.equal(check(match(90, 2, 0, { score_at: null }), result('1', 1.01)), 'ultra_low_late_price');
assert.equal(check(match(90, 2, 0, { service: 'PREMATCH' }), result('1', 1.01)), null);
assert.equal(check(match(90, 2, 0, { match_time_ms: null, live_minute: null }), result('1', 1.01)), null);

// Explicit operator override can disable automation without touching provider locks.
const enabled = config.liveRiskEnabled;
config.liveRiskEnabled = false;
try {
  assert.equal(check(match(90, 2, 0), result('1', 1.01)), null);
} finally {
  config.liveRiskEnabled = enabled;
}

assert.equal(check(match(90, 1, 0), result('1', 1.00)), 'ultra_low_late_price');
const halfTime = match(45, 2, 0, {
  phase: 'HT',
  clock_at: new Date(now - 45 * 60000).toISOString(),
});
assert.equal(riskMinute(halfTime, now), 45, 'Do not drift the clock during halftime');
assert.equal(check(halfTime, result('1', 1.01)), null);

console.log('Live risk policy checks passed');
