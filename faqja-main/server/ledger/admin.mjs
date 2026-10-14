/**
 * Admin and manager panels.
 *
 * Same endpoints the UI already calls, with the original behaviour: admins see everything,
 * a manager only ever sees the players they own. Match control is implemented as overrides
 * (see overrides.mjs) because the feed would otherwise overwrite any edit on the next frame.
 */
import express from 'express';
import { requireAuth, hashPassword } from './auth.mjs';
import * as ledger from './store.mjs';
import * as bets from './bets.mjs';
import * as overrides from './overrides.mjs';
import { settleMatch, settleAll } from './settler.mjs';
import { recentResults, storeResult } from './results.mjs';
import { query } from '../db.mjs';
import { getMatches as getMatchRows } from '../matches.mjs';
import { withOdds } from '../collector.mjs';
import { toClientMatches } from './view.mjs';

export const adminRouter = express.Router();

const guard = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    const status = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500;
    if (status >= 500) console.error('[app api]', req.method, req.originalUrl, '-', e?.message);
    res.status(status).json({ message: e?.message ?? 'error', error: e?.message ?? 'error' });
  });

const requireLedger = (req, res, next) =>
  ledger.isLedgerReady() ? next() : res.status(503).json({ message: 'ledger database unavailable' });

const deny = (res, what) => res.status(403).json({ message: `${what} only` });

/** admin-only routes */
const admin = [
  requireLedger,
  requireAuth,
  (req, res, next) => (req.user?.role === 'ADMIN' ? next() : deny(res, 'admin')),
];
/** manager-only routes */
const manager = [
  requireLedger,
  requireAuth,
  (req, res, next) => (req.user?.role === 'MANAGER' ? next() : deny(res, 'manager')),
];
/** both, each scoped to what they may touch */
const staff = [
  requireLedger,
  requireAuth,
  (req, res, next) => (req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER' ? next() : deny(res, 'staff')),
];

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const asAmount = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw badRequest('amount must be a positive number');
  return Number(n.toFixed(2));
};

/** a manager may only touch the players they own */
async function assertOwned(req, userId) {
  const target = await ledger.getUserById(userId);
  if (!target) throw Object.assign(new Error('user not found'), { status: 404 });
  if (req.user.role === 'MANAGER' && target.managerId !== req.user.id) {
    throw Object.assign(new Error('this user belongs to another manager'), { status: 403 });
  }
  return target;
}

/* ------------------------------------------------------------------- stats */

/** dashboard numbers in the shape the admin screen expects */
adminRouter.get(
  '/admin/stats',
  ...admin,
  guard(async (_req, res) => {
    const base = await ledger.ledgerStats(null);
    const money = await query(
      `select
         coalesce(sum(stake) filter (where status = 'PENDING'), 0)          as open_stake,
         coalesce(sum(stake) filter (where status = 'LOST'), 0)            as lost_stake,
         coalesce(sum(potential_payout) filter (where status = 'WON'), 0)  as paid_out
       from app_ticket`,
    );
    const row = money.rows[0] ?? {};
    res.json({
      users: base.users,
      activeBets: base.pendingTickets,
      totalStake: Number(row.open_stake ?? 0),
      revenue: Number(Number(row.lost_stake ?? 0) - Number(row.paid_out ?? 0)),
      blocked: base.blocked,
      tickets: base.tickets,
      totalBalance: base.totalBalance,
    });
  }),
);

/** the same view for a manager, scoped to the players they own */
adminRouter.get(
  '/manager/stats',
  ...manager,
  guard(async (req, res) => {
    const base = await ledger.ledgerStats(req.user.id);
    res.json({
      users: base.users,
      activeBets: base.pendingTickets,
      totalStake: base.pendingStake,
      revenue: 0,
      balance: req.user.balance,
      tickets: base.tickets,
      blocked: base.blocked,
    });
  }),
);

/* ------------------------------------------------------------------- users */

const publicUsers = (rows) => rows;

adminRouter.get(
  '/admin/users',
  ...admin,
  guard(async (_req, res) => res.json(publicUsers(await ledger.listUsers({})))),
);

adminRouter.get(
  '/manager/users',
  ...manager,
  guard(async (req, res) => res.json(publicUsers(await ledger.listUsers({ managerId: req.user.id })))),
);

/**
 * Creates a login. An admin picks the role (ADMIN / MANAGER / PLAYER) and, for players, who
 * owns them; a manager can only create their own players. Any starting balance is written as
 * a real DEPOSIT so the ledger stays consistent.
 */
const createUser = (resolveRole) =>
  guard(async (req, res) => {
    const { username, password, initialBalance = 0, managerId = null } = req.body ?? {};
    if (!username || !password) throw badRequest('username and password are required');
    if (String(password).length < 4) throw badRequest('password must be at least 4 characters');

    const name = String(username).trim();
    if (await ledger.findUserByUsername(name)) throw badRequest('this username is already taken');

    const role = resolveRole(req);
    const owner = role !== 'PLAYER' ? null : req.user.role === 'MANAGER' ? req.user.id : managerId || null;

    const user = await ledger.createUser({ username: name, passwordHash: hashPassword(password), role, managerId: owner });

    const opening = Number(initialBalance) || 0;
    if (opening > 0) {
      await ledger.moveMoney(user.id, opening, {
        type: 'DEPOSIT',
        description: 'Bilanci fillestar',
        allowNegative: true,
      });
    }

    res.json(await ledger.getUserById(user.id));
  });

adminRouter.post('/admin/users', ...admin, createUser((req) => {
  const role = String(req.body?.role ?? 'PLAYER').toUpperCase();
  return ['ADMIN', 'MANAGER', 'PLAYER'].includes(role) ? role : 'PLAYER';
}));
adminRouter.post('/manager/users', ...manager, createUser(() => 'PLAYER'));

/** edit username / password (admin), and the role (admin only) */
adminRouter.patch(
  '/admin/users/:id',
  ...admin,
  guard(async (req, res) => {
    const id = req.params.id;
    const { username, password, role } = req.body ?? {};

    if (username) {
      const taken = await ledger.findUserByUsername(String(username).trim());
      if (taken && taken.id !== id) throw badRequest('this username is already taken');
      await query('update app_user set username = $2, updated_at = now() where id = $1', [id, String(username).trim()]);
    }
    if (password) {
      await query('update app_user set password_hash = $2, updated_at = now() where id = $1', [id, hashPassword(password)]);
    }
    if (role) await ledger.updateUser(id, { role: String(role).toUpperCase() });

    res.json(await ledger.getUserById(id));
  }),
);

adminRouter.patch(
  '/manager/users/:id',
  ...manager,
  guard(async (req, res) => {
    const id = req.params.id;
    await assertOwned(req, id);
    const { username, password } = req.body ?? {};

    if (username) {
      const taken = await ledger.findUserByUsername(String(username).trim());
      if (taken && taken.id !== id) throw badRequest('this username is already taken');
      await query('update app_user set username = $2, updated_at = now() where id = $1', [id, String(username).trim()]);
    }
    if (password) {
      await query('update app_user set password_hash = $2, updated_at = now() where id = $1', [id, hashPassword(password)]);
    }

    res.json(await ledger.getUserById(id));
  }),
);

/** freeze / ban / reactivate */
const setStatus = (checkOwnership) =>
  guard(async (req, res) => {
    const id = req.params.id;
    if (checkOwnership) await assertOwned(req, id);

    const status = String(req.body?.status ?? '').toUpperCase();
    if (!['ACTIVE', 'FROZEN', 'BANNED'].includes(status)) throw badRequest('status must be ACTIVE, FROZEN or BANNED');
    if (id === req.user.id) throw badRequest('you cannot change your own status');

    res.json(await ledger.updateUser(id, { status }));
  });

adminRouter.patch('/admin/users/:id/status', ...admin, setStatus(false));
adminRouter.patch('/manager/users/:id/status', ...manager, setStatus(true));

/** delete a login (tickets keep their history) */
const removeUser = (checkOwnership) =>
  guard(async (req, res) => {
    const id = req.params.id;
    if (checkOwnership) await assertOwned(req, id);
    if (id === req.user.id) throw badRequest('you cannot delete your own account');

    const deleted = await ledger.deleteUser(id);
    if (!deleted) throw Object.assign(new Error('user not found'), { status: 404 });
    res.json({ success: true, id: deleted });
  });

adminRouter.delete('/admin/users/:id', ...admin, removeUser(false));
adminRouter.delete('/manager/users/:id', ...manager, removeUser(true));

/* ------------------------------------------------------------------- money */

/** deposit / withdraw, recorded in the ledger with the resulting balance */
const moveBalance = (sign, type, checkOwnership) =>
  guard(async (req, res) => {
    const id = req.params.id;
    if (checkOwnership) await assertOwned(req, id);

    const amount = asAmount(req.body?.amount);
    const { user, transaction } = await ledger.moveMoney(id, sign * amount, {
      type,
      description: type === 'DEPOSIT' ? 'Depozitim nga paneli' : 'Tërheqje nga paneli',
    });
    res.json({ ...user, transaction });
  });

adminRouter.post('/admin/users/:id/deposit', ...admin, moveBalance(1, 'DEPOSIT', false));
adminRouter.post('/admin/users/:id/withdraw', ...admin, moveBalance(-1, 'WITHDRAWAL', false));
adminRouter.post('/manager/users/:id/deposit', ...manager, moveBalance(1, 'DEPOSIT', true));
adminRouter.post('/manager/users/:id/withdraw', ...manager, moveBalance(-1, 'WITHDRAWAL', true));

/* ----------------------------------------------------------------- tickets */

const listTickets = (scoped) =>
  guard(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const params = [];
    let where = '';
    if (scoped) {
      params.push(req.user.id);
      where = 'where t.user_id in (select id from app_user where manager_id = $1)';
    }
    const { rows } = await query(
      `select t.id from app_ticket t ${where} order by t.placed_at desc limit ${limit}`,
      params,
    );
    const tickets = [];
    for (const row of rows) tickets.push(await bets.getTicketWithLines(row.id));
    res.json(tickets);
  });

adminRouter.get('/admin/tickets', ...admin, listTickets(false));
adminRouter.get('/manager/tickets', ...manager, listTickets(true));

/**
 * Revert a ticket: refund the stake, void the lines and close it as REVERTED - the original
 * admin behaviour. Only open tickets can be reverted.
 */
const revertTicket = (scoped) =>
  guard(async (req, res) => {
    const id = req.params.id;
    const found = await query('select * from app_ticket where id = $1', [id]);
    const ticket = found.rows[0];
    if (!ticket) throw Object.assign(new Error('ticket not found'), { status: 404 });
    if (ticket.status !== 'PENDING') throw badRequest('only pending tickets can be reverted');
    if (!ticket.user_id) throw badRequest('a booked (guest) ticket has no stake to refund');

    if (scoped) {
      const owner = await query('select manager_id from app_user where id = $1', [ticket.user_id]);
      if (owner.rows[0]?.manager_id !== req.user.id) throw Object.assign(new Error('this ticket belongs to another manager'), { status: 403 });
    }

    const stake = Number(ticket.stake);
    await query(`update app_ticket set status = 'REVERTED', settled_at = now() where id = $1`, [id]);
    await query(`update app_ticket_line set status = 'VOID' where ticket_id = $1`, [id]);
    await ledger.moveMoney(ticket.user_id, stake, {
      type: 'TICKET_REVERT',
      referenceId: id,
      description: 'Bileta u anulua nga paneli',
      allowNegative: true,
    });

    res.json({ success: true, refunded: stake, ticket: await bets.getTicketWithLines(id) });
  });

adminRouter.post('/admin/tickets/:id/revert', ...admin, revertTicket(false));
adminRouter.post('/manager/tickets/:id/revert', ...manager, revertTicket(true));

/* --------------------------------------------------- match control (overrides) */

const matchList = guard(async (req, res) => {
  const rows = await getMatchRows({
    service: req.query.status === 'LIVE' ? 'LIVE' : null,
    q: req.query.q ? String(req.query.q) : null,
    limit: Math.min(Number(req.query.limit) || 200, 2000),
    includeEnded: true,
  });
  const withPrices = await withOdds(rows);
  res.json({ items: toClientMatches(withPrices), overrides: await overrides.list() });
});

adminRouter.get('/admin/matches', ...admin, matchList);
adminRouter.get('/manager/matches', ...manager, matchList);

/** the toggle the UI sends is `isSuspended`; a market/outcome sends `status` */
const wantsSuspend = (body = {}) =>
  body.isSuspended !== undefined ? body.isSuspended === true : String(body.status ?? '').toUpperCase() === 'SUSPENDED';

adminRouter.patch(
  '/admin/matches/:id/suspend',
  ...admin,
  guard(async (req, res) => {
    const suspended = wantsSuspend(req.body);
    const list = await overrides.upsert('match', String(req.params.id), { suspended });
    res.json({ success: true, suspended, overrides: list });
  }),
);

/** marketId from the UI is `matchId|marketKey|line` */
adminRouter.patch(
  '/admin/markets/:id/suspend',
  ...admin,
  guard(async (req, res) => {
    const suspended = wantsSuspend(req.body);
    res.json({ success: true, suspended, overrides: await overrides.upsert('market', req.params.id, { suspended }) });
  }),
);

/**
 * Pin a price. The feed keeps sending its own price, so the override wins in the board view
 * and in bet validation until it is cleared - that is what makes the admin edit meaningful.
 */
adminRouter.patch(
  '/admin/outcomes/:id/odds',
  ...admin,
  guard(async (req, res) => {
    const price = Number(req.body?.odds ?? req.body?.price);
    if (!Number.isFinite(price) || price <= 1) throw badRequest('odds must be a number greater than 1');
    res.json({ success: true, overrides: await overrides.upsert('outcome', req.params.id, { price: Number(price.toFixed(3)) }) });
  }),
);

/** also accepted, matching the original route names */
adminRouter.patch(
  '/admin/markets/:id/odds-adjust',
  ...admin,
  guard(async (req, res) => {
    const price = Number(req.body?.odds ?? req.body?.price);
    if (!Number.isFinite(price) || price <= 1) throw badRequest('odds must be a number greater than 1');
    res.json({ success: true, overrides: await overrides.upsert('outcome', req.params.id, { price: Number(price.toFixed(3)) }) });
  }),
);
adminRouter.patch(
  '/admin/outcomes/:id/suspend',
  ...admin,
  guard(async (req, res) => {
    const suspended = wantsSuspend(req.body);
    res.json({ success: true, suspended, overrides: await overrides.upsert('outcome', req.params.id, { suspended }) });
  }),
);

/** clear one override (or every override when no ref is given) */
adminRouter.delete(
  '/admin/overrides',
  ...admin,
  guard(async (req, res) => {
    const { kind, ref } = req.query;
    if (kind && ref) return res.json({ success: true, overrides: await overrides.clear(String(kind), String(ref)) });
    if (kind) {
      await query('delete from app_feed_override where kind = $1', [String(kind)]);
      await overrides.refresh(true);
      return res.json({ success: true, overrides: await overrides.list() });
    }
    await query('delete from app_feed_override');
    await overrides.refresh(true);
    return res.json({ success: true, overrides: await overrides.list() });
  }),
);

/** what the admin screen shows on its feed-status card */
adminRouter.get(
  '/admin/feed-status',
  ...staff,
  guard(async (_req, res) => {
    const { matchStats } = await import('../matches.mjs');
    res.json({
      matches: matchStats(),
      overrides: (await overrides.list()).length,
      lastPass: null,
    });
  }),
);

/* --------------------------------------------------------------- settlement */

/** stored results plus a settlement pass (safe: idempotent) */
adminRouter.get(
  '/admin/settlement',
  ...admin,
  guard(async (_req, res) => {
    const lastPass = await settleAll();
    res.json({ results: await recentResults(50), lastPass });
  }),
);

/** settle, or correct, a match by hand: stores the score, then recalculates every ticket */
adminRouter.post(
  '/admin/matches/:id/settle',
  ...admin,
  guard(async (req, res) => {
    const matchId = Number(req.params.id);
    const body = req.body ?? {};
    const homeScore = Number(body.homeScore ?? body.home_score ?? NaN);
    const awayScore = Number(body.awayScore ?? body.away_score ?? NaN);

    if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
      await storeResult(matchId, homeScore, awayScore, { homeTeam: body.homeTeam, awayTeam: body.awayTeam });
    }

    res.json({ ...(await settleMatch(matchId)), ok: true });
  }),
);