/**
 * Regression: a result with first-half scores used to supply 11 values to
 * a SQL INSERT with nine placeholders. Every settlement pass failed and
 * finished players' tickets remained PENDING.
 *
 * These tests are pure; they never touch a live database or real balances.
 */
import assert from 'node:assert/strict';
import { isFinished, FINISHED_RESULT_INSERT, finishedResultParameters, verifiedFirstHalf } from '../server/ledger/results.mjs';
import { isStillOnBoard } from '../server/ledger/settler.mjs';
import { playerBetStatuses } from '../server/ledger/bets.mjs';
import { LEDGER_SQL } from '../server/ledger/schema.mjs';

const scoreAt = new Date().toISOString();
const fulltime = {
  match_id: 123, service: 'LIVE', status: 'ended', feed_status: 'FT',
  score_at: scoreAt, home_score: 2, away_score: 1,
  home: 'Home', away: 'Away',
  periods_score: [{t1:1,t2:0},{t1:1,t2:1}],
  stats: {
    home: {corners:6,yellow:2,red:0},
    away: {corners:4,yellow:1,red:0},
  },
};

assert.equal(isFinished(fulltime), true);
assert.equal(isFinished({...fulltime,status:'live',feed_status:'1H'}), false,
  'do not settle live matches just because a timer passed 110 minutes');
assert.equal(isFinished({...fulltime,service:'PREMATCH'}), false,
  'missing actual live play must not be treated as a finished match');
assert.equal(isFinished({...fulltime,score_at:null}), false,
  'never settle a default-score placeholder');
assert.equal(isFinished({...fulltime,home_score:null}), false);
assert.equal(isFinished({...fulltime,home_score:-1}), false);
assert.equal(isFinished({...fulltime,status:'live',feed_status:'full time'}), false,
  'only recognized provider final-status evidence is authoritative');
assert.equal(isFinished({...fulltime,status:'live',feed_status:'FT'}), true);
assert.deepEqual(verifiedFirstHalf(fulltime.periods_score),{home:1,away:0});

const params = finishedResultParameters(fulltime);
const matches = [...FINISHED_RESULT_INSERT.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));
const maxPlaceholder = Math.max(...matches);
assert.equal(maxPlaceholder,11,'all stored match+half statistics must have placeholders');
assert.equal(new Set(matches).size,11,'no skipped parameter indexes');
assert.equal(params.length,maxPlaceholder,'PostgreSQL bind count must match SQL');
assert.deepEqual(params,[123,'Home','Away',2,1,6,4,2,1,1,0]);
assert.match(FINISHED_RESULT_INSERT,/half_home_score\s*=\s*coalesce\(/i);
assert.match(FINISHED_RESULT_INSERT,/half_away_score\s*=\s*coalesce\(/i);

const withoutStats = finishedResultParameters({...fulltime,stats:null,periods_score:null});
assert.equal(withoutStats.length,11);
assert.deepEqual(withoutStats.slice(5),[null,null,null,null,null,null]);

// Inactive match rows remain retrievable by ID. They are no longer
// "on the board" and may be refunded after the existing 72h limit.
assert.equal(isStillOnBoard({active:true,status:'live'}),true);
assert.equal(isStillOnBoard({active:false,status:'ended'}),false);
assert.equal(isStillOnBoard({active:true,status:'ended'}),false);
assert.equal(isStillOnBoard(null),false);

for(const filter of ['ALL','WON','LOST','PENDING','CANCELLED','REJECTED']) {
  assert.equal(playerBetStatuses(filter).key,filter);
}
assert.deepEqual(playerBetStatuses('CANCELLED').statuses,['CANCELLED','REVERTED','VOID']);
assert.deepEqual(playerBetStatuses('REJECTED').statuses,[]);
assert.throws(()=>playerBetStatuses('WHATEVER'),e=>e.status===400);
assert.match(LEDGER_SQL,/create table if not exists app_bet_rejection\s*\(/i);
assert.match(LEDGER_SQL,/create unique index if not exists app_bet_rejection_idempotency_idx/i);

console.log('Automatic settlement SQL, final-score evidence, refunds and player bet-status filters passed');
