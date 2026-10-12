import assert from 'node:assert/strict';
import { assertBetWithinLimits, planLimitChanges } from '../server/ledger/player-control-policy.mjs';

const now = Date.parse('2026-10-12T12:00:00.000Z');
const current = {
  dailyLimit: 100,
  weeklyLimit: 500,
  monthlyLimit: 1000,
  pendingLimits: null,
  limitsEffectiveAt: null,
};

const reduction = planLimitChanges(current, { dailyLimit: 50 }, now);
assert.equal(reduction.immediate.dailyLimit, 50, 'a lower cap applies immediately');
assert.equal(reduction.effectiveAt, null);

const increase = planLimitChanges(current, { dailyLimit: 150 }, now);
assert.equal(increase.immediate.dailyLimit, undefined);
assert.equal(increase.pending.dailyLimit, 150);
assert.equal(increase.effectiveAt.getTime(), now + 7 * 24 * 60 * 60 * 1000, 'a cap increase has a seven-day delay');

const removal = planLimitChanges(current, { dailyLimit: null }, now);
assert.equal(removal.pending.dailyLimit, null, 'removing a cap is also delayed');

const used = { daily_used: 40, weekly_used: 490, monthly_used: 990 };
assert.doesNotThrow(() => assertBetWithinLimits({ stake: 10, controls: current, used, now }));
assert.throws(
  () => assertBetWithinLimits({ stake: 10.01, controls: current, used, now }),
  /kufirin javor/,
  'a bet above any configured period cap is refused',
);
assert.throws(
  () => assertBetWithinLimits({
    stake: 1,
    controls: { ...current, selfExcludedUntil: new Date(now + 1000).toISOString() },
    used,
    now,
  }),
  (error) => error.status === 403 && /vetëpërjashtim/.test(error.message),
);

console.log('Player control policy checks passed');
