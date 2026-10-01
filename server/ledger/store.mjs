/**
 * Ledger data access (users, money, tickets).
 *
 * Money always moves inside a transaction that locks the user row, and every movement
 * writes an app_transaction row carrying the resulting balance - so a balance can be
 * reconstructed from the ledger at any time.
 */
import { query, pool } from '../db.mjs';
import { LEDGER_SQL } from './schema.mjs';

export async function initLedgerSchema() {
  await query(LEDGER_SQL);
  ledgerReady = true;
}

/**
 * The board does not need the database, but the login/ledger endpoints do. Routes check
 * this so a missing ledger answers 503 with a clear reason instead of a 500 stack trace.
 */
let ledgerReady = false;
export const isLedgerReady = () => ledgerReady;

/** the only columns ever returned to clients - never the password hash */
const USER_COLUMNS = `u.id, u.username, u.role, u.status, u.balance, u.currency,
                      u.manager_id as "managerId", u.created_at, u.updated_at`;

export const publicUser = (row) =>
  row
    ? {
        id: row.id,
        username: row.username,
        role: row.role,
        status: row.status,
        balance: Number(row.balance ?? 0),
        currency: row.currency ?? 'LEK',
        managerId: row.managerId ?? null,
        manager: row.managerUsername ? { id: row.managerId, username: row.managerUsername } : null,
        _count: row.managedUsers !== undefined ? { managedUsers: Number(row.managedUsers) } : undefined,
        createdAt: row.created_at,
      }
    : null;

export async function findUserByUsername(username) {
  const res = await query('select * from app_user where username = $1', [username]);
  return res.rows[0] ?? null;
}

export async function getUserById(id) {
  const res = await query(`select ${USER_COLUMNS} from app_user u where u.id = $1`, [id]);
  return res.rows[0] ? publicUser(res.rows[0]) : null;
}

/** admin: everyone; manager: only the users they own */
export async function listUsers({ managerId = null, limit = 500 } = {}) {
  const res = await query(
    `select ${USER_COLUMNS},
            m.username as "managerUsername",
            (select count(*) from app_user c where c.manager_id = u.id) as "managedUsers"
       from app_user u
       left join app_user m on m.id = u.manager_id
      where ($1::uuid is null or u.manager_id = $1::uuid)
      order by u.created_at desc
      limit $2`,
    [managerId, Math.min(Number(limit) || 500, 2000)],
  );
  return res.rows.map(publicUser);
}

export async function createUser({
  username,
  passwordHash,
  role = 'PLAYER',
  status = 'ACTIVE',
  balance = 0,
  currency = 'LEK',
  managerId = null,
}) {
  const res = await query(
    `insert into app_user (username, password_hash, role, status, balance, currency, manager_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [username, passwordHash, role, status, balance, currency, managerId],
  );
  return getUserById(res.rows[0].id);
}

const EDITABLE = { role: 'role', status: 'status', currency: 'currency', managerId: 'manager_id' };

export async function updateUser(id, fields = {}) {
  const sets = [];
  const values = [id];
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) return getUserById(id);
  sets.push('updated_at = now()');
  await query(`update app_user set ${sets.join(', ')} where id = $1`, values);
  return getUserById(id);
}

/** deletes the login; tickets keep their history (user_id becomes null) */
export async function deleteUser(id) {
  const res = await query('delete from app_user where id = $1 returning id', [id]);
  return res.rows[0]?.id ?? null;
}

/**
 * Moves money and records it. `delta` may be negative (withdrawal, stake).
 * Returns { user, transaction }; throws when the balance would go negative.
 */
export async function moveMoney(userId, delta, { type = 'ADJUSTMENT', description = null, referenceId = null, allowNegative = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await client.query('select balance from app_user where id = $1 for update', [userId]);
    if (!locked.rows.length) throw new Error('user not found');

    const before = Number(locked.rows[0].balance);
    const amount = Number(delta);
    if (!Number.isFinite(amount) || amount === 0) throw new Error('amount must be a non-zero number');

    const after = Number((before + amount).toFixed(2));
    if (after < 0 && !allowNegative) {
      const err = new Error('insufficient balance');
      err.status = 400;
      throw err;
    }

    const tx = await client.query(
      `insert into app_transaction (user_id, amount, type, reference_id, balance_after, description)
       values ($1, $2, $3, $4, $5, $6)
       returning id, amount, type, balance_after as "balanceAfter", description, created_at as "createdAt"`,
      [userId, amount, type, referenceId, after, description],
    );
    await client.query('update app_user set balance = $2, updated_at = now() where id = $1', [userId, after]);
    await client.query('commit');

    return { user: await getUserById(userId), transaction: tx.rows[0] };
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function listTransactions(userId, limit = 100) {
  const res = await query(
    `select id, amount, type, balance_after as "balanceAfter", description, created_at as "createdAt"
       from app_transaction where user_id = $1 order by created_at desc limit $2`,
    [userId, Math.min(Number(limit) || 100, 500)],
  );
  return res.rows;
}

/** headline numbers for the admin/manager dashboards */
export async function ledgerStats(managerId = null) {
  const res = await query(
    `select
        count(*)::int                                   as users,
        count(*) filter (where role = 'PLAYER')::int     as players,
        count(*) filter (where status <> 'ACTIVE')::int  as blocked,
        coalesce(sum(balance), 0)                        as balance
       from app_user
      where ($1::uuid is null or manager_id = $1::uuid)`,
    [managerId],
  );
  const tickets = await query(
    `select count(*)::int as total,
            count(*) filter (where t.status = 'PENDING')::int as pending,
            coalesce(sum(t.stake) filter (where t.status = 'PENDING'), 0) as pending_stake
       from app_ticket t
      where ($1::uuid is null or t.user_id in (select id from app_user where manager_id = $1::uuid))`,
    [managerId],
  );
  const u = res.rows[0] ?? {};
  const t = tickets.rows[0] ?? {};
  return {
    users: u.users ?? 0,
    players: u.players ?? 0,
    blocked: u.blocked ?? 0,
    totalBalance: Number(u.balance ?? 0),
    tickets: t.total ?? 0,
    pendingTickets: t.pending ?? 0,
    pendingStake: Number(t.pending_stake ?? 0),
  };
}