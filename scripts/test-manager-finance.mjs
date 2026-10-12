import assert from 'node:assert/strict';
import {
  chargeManagerCommission,
  managerCommission,
  managerCommissionPercent,
  refundManagerCommission,
} from '../server/ledger/manager-finance.mjs';

const managerId = 'manager-1';
const transactions = [];
let balance = 1000;
let configuredRates = { single: 3, double: 5, multi: 7 };
const client = {
  async query(sql, values = []) {
    if (sql.includes('from app_commission_config')) {
      return { rows: [configuredRates] };
    }
    if (sql.includes("type = 'MANAGER_COMMISSION_DEBIT'")) {
      return {
        rows: transactions
          .filter((transaction) => transaction.userId === values[0] && transaction.referenceId === values[1] && transaction.type === 'MANAGER_COMMISSION_DEBIT')
          .map((transaction) => ({ amount: transaction.amount })),
      };
    }
    if (sql.includes("type in ('MANAGER_COMMISSION_DEBIT', 'MANAGER_COMMISSION_REFUND')")) {
      return {
        rows: transactions
          .filter((transaction) => transaction.userId === values[0] && transaction.referenceId === values[1])
          .map(({ type, amount }) => ({ type, amount })),
      };
    }
    if (sql.startsWith('select balance from app_user')) return { rows: [{ balance }] };
    if (sql.startsWith('update app_user set balance')) {
      balance = values[1];
      return { rows: [] };
    }
    if (sql.startsWith('insert into app_transaction')) {
      const type = sql.includes("'MANAGER_COMMISSION_DEBIT'") ? 'MANAGER_COMMISSION_DEBIT' : 'MANAGER_COMMISSION_REFUND';
      transactions.push({ userId: values[0], amount: values[1], referenceId: values[2], type });
      return { rows: [] };
    }
    throw new Error(`Unexpected test query: ${sql}`);
  },
};

assert.equal(managerCommissionPercent(1), 3);
assert.equal(managerCommissionPercent(2), 5);
assert.equal(managerCommissionPercent(3), 7);
assert.equal(managerCommissionPercent(8), 7);
assert.equal(managerCommission(150, 1), 4.5);
assert.equal(managerCommission(100, 1, { single: 4, double: 6, multi: 8 }), 4);
assert.equal(managerCommissionPercent(2, { single: 4, double: 6, multi: 8 }), 6);

assert.equal(await chargeManagerCommission(client, { managerId, ticketId: 'single', username: 'p', stake: 100, selectionCount: 1 }), 3);
assert.equal(balance, 997);
assert.equal(await chargeManagerCommission(client, { managerId, ticketId: 'single', username: 'p', stake: 100, selectionCount: 1 }), 3);
assert.equal(transactions.length, 1, 'the same ticket is charged only once');

assert.equal(await chargeManagerCommission(client, { managerId, ticketId: 'double', username: 'p', stake: 100, selectionCount: 2 }), 5);
assert.equal(await chargeManagerCommission(client, { managerId, ticketId: 'multi', username: 'p', stake: 100, selectionCount: 3 }), 7);
assert.equal(balance, 985);

assert.equal(await refundManagerCommission(client, { managerId, ticketId: 'single', username: 'p' }), 3);
assert.equal(balance, 988);
assert.equal(await refundManagerCommission(client, { managerId, ticketId: 'single', username: 'p' }), 0);
assert.equal(balance, 988, 'the same ticket commission is refunded only once');

configuredRates = { single: 4, double: 6, multi: 8 };
assert.equal(await chargeManagerCommission(client, { managerId, ticketId: 'config-change', username: 'p', stake: 100, selectionCount: 1 }), 4);
assert.equal(balance, 984, 'the configured manager rate is used for newly placed tickets');

console.log('Manager finance checks passed');
