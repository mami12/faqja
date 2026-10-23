import { moneyCents } from './system-columns.mjs';

export const DEFAULT_COMMISSION_RATES = Object.freeze({ single: 3, double: 5, multi: 7 });

export async function getManagerCommissionRates(executor) {
  const runQuery = typeof executor === 'function' ? executor : executor.query.bind(executor);
  const result = await runQuery(
    `select single_pct as single, double_pct as double, multi_pct as multi
       from app_commission_config where id = 1`,
  );
  const row = result.rows[0];
  if (!row) return { ...DEFAULT_COMMISSION_RATES };
  return {
    single: Number(row.single),
    double: Number(row.double),
    multi: Number(row.multi),
  };
}

export function managerCommissionRate(selectionCount, rates = DEFAULT_COMMISSION_RATES) {
  const tier = selectionCount <= 1 ? 'single' : selectionCount === 2 ? 'double' : 'multi';
  return Number(rates[tier]) / 100;
}

export function managerCommission(stake, selectionCount, rates = DEFAULT_COMMISSION_RATES) {
  const tier = selectionCount <= 1 ? 'single' : selectionCount === 2 ? 'double' : 'multi';
  // Rates are persisted to two decimals. Round the actual column stake once,
  // using decimal half-up arithmetic (25.10 * 5% is 1.26, never 1.25).
  const stakeCents = BigInt(moneyCents(stake));
  const rateHundredths = BigInt(moneyCents(rates[tier]));
  return Number((stakeCents * rateHundredths + 5000n) / 10000n) / 100;
}

export function managerCommissionPercent(selectionCount, rates = DEFAULT_COMMISSION_RATES) {
  const tier = selectionCount <= 1 ? 'single' : selectionCount === 2 ? 'double' : 'multi';
  return Number(rates[tier]);
}

/** Charges each managed player's ticket once, at placement (or for legacy tickets at settlement). */
export async function chargeManagerCommission(client, { managerId, ticketId, username, stake, selectionCount }) {
  if (!managerId) return 0;

  const existing = await client.query(
    `select amount from app_transaction
      where user_id = $1 and reference_id = $2 and type = 'MANAGER_COMMISSION_DEBIT'
      limit 1`,
    [managerId, ticketId],
  );
  if (existing.rows.length) return Number(-existing.rows[0].amount);

  const rates = await getManagerCommissionRates(client);
  const commission = managerCommission(stake, selectionCount, rates);
  if (!commission) return 0;
  const manager = await client.query('select balance from app_user where id = $1 for update', [managerId]);
  if (!manager.rows.length) throw new Error(`Manager account ${managerId} not found while charging ticket commission`);

  const balanceAfter = Number((Number(manager.rows[0].balance) - commission).toFixed(2));
  await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [managerId, balanceAfter]);
  await client.query(
    `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
     values ($1, $2, 'MANAGER_COMMISSION_DEBIT', $3, $4, $5)`,
    [
      managerId,
      -commission,
      ticketId,
      balanceAfter,
      `Komision ${managerCommissionPercent(selectionCount, rates)}% për biletën e lojtarit ${username}`,
    ],
  );
  return commission;
}

/** Reverses a charged commission once when a ticket is voided or reverted. */
export async function refundManagerCommission(client, { managerId, ticketId, username }) {
  if (!managerId) return 0;

  const transactions = await client.query(
    `select type, amount from app_transaction
      where user_id = $1 and reference_id = $2
        and type in ('MANAGER_COMMISSION_DEBIT', 'MANAGER_COMMISSION_REFUND')`,
    [managerId, ticketId],
  );
  const debit = transactions.rows.find((transaction) => transaction.type === 'MANAGER_COMMISSION_DEBIT');
  const alreadyRefunded = transactions.rows.some((transaction) => transaction.type === 'MANAGER_COMMISSION_REFUND');
  if (!debit || alreadyRefunded) return 0;

  const commission = Number(-debit.amount);
  if (commission <= 0) return 0;

  const manager = await client.query('select balance from app_user where id = $1 for update', [managerId]);
  if (!manager.rows.length) throw new Error(`Manager account ${managerId} not found while refunding ticket commission`);
  const balanceAfter = Number((Number(manager.rows[0].balance) + commission).toFixed(2));
  await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [managerId, balanceAfter]);
  await client.query(
    `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
     values ($1, $2, 'MANAGER_COMMISSION_REFUND', $3, $4, $5)`,
    [managerId, commission, ticketId, balanceAfter, `Kthim komisioni për biletën e anuluar të lojtarit ${username}`],
  );
  return commission;
}
