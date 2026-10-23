import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { LEDGER_SQL } from '../server/ledger/schema.mjs';
import { createColumnsPlacer, toClientTicket, revertTicket, placeBet } from '../server/ledger/bets.mjs';
import { recalcTicket, gradeLine } from '../server/ledger/settler.mjs';
import { DEFAULT_LIVE_RISK_SETTINGS } from '../server/live-risk-settings.mjs';
import { upsert } from '../server/match-store.mjs';

// Production transaction + manager/player controls run against a fresh embedded
// PostgreSQL database. The bootstrap prevents all production database connections.
const sql = new PGlite();
await sql.exec(LEDGER_SQL);
await sql.query('insert into app_live_risk_settings(id,settings) values(1,$1::jsonb)', [JSON.stringify(DEFAULT_LIVE_RISK_SETTINGS)]);
upsert([1497, 6983].map(match_id => ({ match_id, home: 'Home', away: 'Away', service: 'PREMATCH', start_at: new Date(Date.now() + 3600000) })));
let queue = Promise.resolve();
const database = { async connect() {
  let release;
  const next = new Promise(resolve => { release = resolve; }), before = queue;
  queue = next; await before;
  return { query: (...args) => sql.query(...args), release };
} };
const runQuery = async (...args) => { const client = await database.connect(); try { return await client.query(...args); } finally { client.release(); } };
const getTicket = async id => {
  const client = await database.connect();
  try {
    const ticket = (await client.query('select * from app_ticket where id=$1', [id])).rows[0];
    const lines = (await client.query('select * from app_ticket_line where ticket_id=$1 order by id', [id])).rows;
    return toClientTicket(ticket, lines);
  } finally { client.release(); }
};
const managerId = randomUUID();
await sql.query('insert into app_user(id,username,password_hash,role,balance) values($1::uuid,$1::text,$2,\'MANAGER\',10000)', [managerId, 'test-only']);
async function player(balance = 1000) {
  const id = randomUUID();
  await sql.query('insert into app_user(id,username,password_hash,role,balance,manager_id) values($1::uuid,$1::text,$2,\'PLAYER\',$3,$4)', [id, 'test-only', balance, managerId]);
  return { id, role: 'PLAYER', status: 'ACTIVE' };
}
const balance = async id => Number((await sql.query('select balance from app_user where id=$1', [id])).rows[0].balance);
const count = async table => Number((await sql.query(`select count(*) n from ${table}`)).rows[0].n);
const source = new Map([
  ['1497|result||1', { matchId: '1497', marketKey: 'result', line: '', outcomeKey: '1', outcomeName: 'Home', marketName: '1X2', matchName: 'Al Arabi vs Al Nejmeh', price: 5 }],
  ['1497|total|3.5|over', { matchId: '1497', marketKey: 'total', line: '3.5', outcomeKey: 'over', outcomeName: 'Over', marketName: 'Total Goals', matchName: 'Al Arabi vs Al Nejmeh', price: 2.1 }],
  ['6983|result||1', { matchId: '6983', marketKey: 'result', line: '', outcomeKey: '1', outcomeName: 'Home', marketName: '1X2', matchName: 'Saturn vs Rodina', price: 15.18 }],
  ['1497|result||x', { matchId: '1497', marketKey: 'result', line: '', outcomeKey: 'x', outcomeName: 'Draw', marketName: '1X2', matchName: 'Al Arabi vs Al Nejmeh', price: 3.2 }],
]);
let failResolution = null, resolveCalls = 0;
const resolve = async pick => {
  resolveCalls++;
  if (pick.outcomeId === failResolution?.id) throw Object.assign(new Error(failResolution.message), { status: 400, code: failResolution.code });
  const line = source.get(pick.outcomeId); assert.ok(line, 'test fixture selection exists'); return { ...line };
};
const place = createColumnsPlacer({ database, runQuery, getTicket, resolve });
const selections = [...source.keys()].slice(0, 3).map(outcomeId => ({ outcomeId, oddsAtPlacement: source.get(outcomeId).price }));
const input = user => ({ user, totalStake: 100, selections, clientRequestId: randomUUID() });
try {
  const user = await player(100), request = input(user), managerBefore = await balance(managerId);
  const [batch, replay] = await Promise.all([place(request), place(request)]);
  assert.deepEqual(batch, replay);
  assert.equal(resolveCalls, 9, 'each request resolves unique picks once; only the committing request rechecks under lock');
  assert.deepEqual(batch.stakes, [50, 50]);
  assert.equal(batch.totalStake, 100); assert.equal(batch.columnCount, 2);
  assert.equal(await balance(user.id), 0, '100 total is accepted with only 100 available');
  assert.equal(await count('app_ticket'), 2); assert.equal(await count('app_ticket_batch'), 1);
  assert.deepEqual(batch.tickets.map(t => t.potentialPayout), [3795, 1593.9]);
  assert.deepEqual(batch.tickets.map(t => t.lines.length), [2, 2]);
  assert.deepEqual(batch.tickets.map(t => t.ticketType), ['SYSTEM', 'SYSTEM']);
  assert.deepEqual(batch.tickets.map(t => t.systemType), ['AUTO:1/2', 'AUTO:2/2']);
  assert.equal(await balance(managerId), managerBefore - 5, 'commission charges actual 50 stakes once');
  const placed = (await sql.query("select amount,balance_after from app_transaction where user_id=$1 and type='BET_PLACED' order by balance_after desc", [user.id])).rows;
  assert.deepEqual(placed.map(t => Number(t.amount)), [-50, -50]);
  assert.deepEqual(placed.map(t => Number(t.balance_after)), [50, 0]);
  // Replay survives feed suspension and still cannot debit twice.
  failResolution = { id: selections[0].outcomeId, message: 'suspended' };
  assert.deepEqual(await place(request), batch); failResolution = null;
  await assert.rejects(place({ ...request, totalStake: 101 }), error => error.status === 409);
  await assert.rejects(place({ ...request, clientRequestId: randomUUID() }), /Bilanci/);
  assert.equal(await count('app_ticket'), 2);

  // Both alternative columns may win. Their payouts add, exactly once.
  for (const ticket of batch.tickets) {
    const rawLines = (await sql.query('select * from app_ticket_line where ticket_id=$1', [ticket.id])).rows;
    for (const line of rawLines) {
      const result = { home_score: line.match_id == 1497 ? 4 : 1, away_score: 0, home_team: 'Home', away_team: 'Away' };
      await sql.query('update app_ticket_line set status=$2 where id=$1', [line.id, gradeLine(line, result)]);
    }
  }
  for (const ticket of batch.tickets) {
    assert.equal((await recalcTicket(ticket.id, { database })).status, 'WON');
    assert.equal(await recalcTicket(ticket.id, { database }), null);
  }
  assert.equal(await balance(user.id), 5388.9);
  assert.equal(Number((await sql.query("select count(*) n from app_transaction where user_id=$1 and type='BET_WON'", [user.id])).rows[0].n), 2);

  const poor = await player(99.99);
  await assert.rejects(place(input(poor)), /Bilanci/); assert.equal(await balance(poor.id), 99.99);
  const controls = await player(100);
  await sql.query('insert into app_player_controls(user_id,daily_limit) values($1,100)', [controls.id]);
  const capped = await place(input(controls)); assert.equal(capped.tickets.length, 2, 'period cap applies total100 once');
  await assert.rejects(place(input(controls)), /kufi|kufir/i);
  const excluded = await player();
  await sql.query("insert into app_player_controls(user_id,self_excluded_until) values($1,now()+interval '1 day')", [excluded.id]);
  await assert.rejects(place(input(excluded)), /vetëpërjashtim/);

  for (const rejection of [{ message: 'suspended', code: 'MARKET_SUSPENDED' }, { message: 'odds changed', code: 'ODDS_CHANGED' }]) {
    const user = await player(), beforeCount = await count('app_ticket');
    failResolution = { id: selections[1].outcomeId, ...rejection };
    await assert.rejects(place(input(user)), error => error.code === rejection.code);
    assert.equal(await balance(user.id), 1000); assert.equal(await count('app_ticket'), beforeCount);
  }
  failResolution = null;
  // Fail on the second ticket insert after the first ticket and commission exist:
  // the real SQL rollback must remove all rows and restore both balances.
  const failingUser = await player(); let inserts = 0;
  const failingDatabase = { async connect() {
    const client = await database.connect();
    return { release: client.release, query: (text, params) => {
      if (/insert into app_ticket \(/.test(text) && ++inserts === 2) throw new Error('injected second-column write failure');
      return client.query(text, params);
    } };
  } };
  const failingPlace = createColumnsPlacer({ database: failingDatabase, runQuery, getTicket, resolve });
  const beforeTickets = await count('app_ticket'), beforeTransactions = await count('app_transaction'), beforeManager = await balance(managerId);
  await assert.rejects(failingPlace(input(failingUser)), /injected/);
  assert.equal(await count('app_ticket'), beforeTickets); assert.equal(await count('app_transaction'), beforeTransactions);
  assert.equal(await balance(failingUser.id), 1000); assert.equal(await balance(managerId), beforeManager);

  const threeUser = await player(100);
  const three = await place({ ...input(threeUser), selections: [selections[0], selections[1], { outcomeId: '1497|result||x', oddsAtPlacement: 3.2 }] });
  assert.deepEqual(three.tickets.map(t => t.stake), [33.34, 33.33, 33.33]);
  // One win, one loss, one void: settlement and void refund are independent.
  for (let i = 0; i < three.tickets.length; i++) {
    await sql.query('update app_ticket_line set status=$2 where ticket_id=$1', [three.tickets[i].id, ['WON', 'LOST', 'VOID'][i]]);
    const done = await recalcTicket(three.tickets[i].id, { database });
    assert.equal(done.status, ['WON', 'LOST', 'VOID'][i]);
    assert.equal(await recalcTicket(three.tickets[i].id, { database }), null);
  }
  assert.equal(await balance(threeUser.id), 200.03); //33.34*5 +33.33 refund

  const cancelUser = await player(100), cancelManager = await balance(managerId);
  const cancel = await place(input(cancelUser));
  for (const ticket of cancel.tickets) {
    assert.equal((await revertTicket(ticket.id, null, { database })).refunded, 50);
    await assert.rejects(revertTicket(ticket.id, null, { database }), /only pending/);
    assert.equal(await recalcTicket(ticket.id, { database }), null);
  }
  assert.equal(await balance(cancelUser.id), 100); assert.equal(await balance(managerId), cancelManager);

  // Preserve the price contract accepted by legacy tickets. With a removed VOID
  // leg, recompute using only the surviving frozen price instead.
  const legacyUser = await player(100), legacy = await place(input(legacyUser));
  await sql.query('update app_ticket set potential_payout=3794.99 where id=$1', [legacy.tickets[0].id]);
  await sql.query("update app_ticket_line set status='WON' where ticket_id=$1", [legacy.tickets[0].id]);
  assert.equal((await recalcTicket(legacy.tickets[0].id, { database })).payout, 3794.99);
  await sql.query("update app_ticket_line set status=case when match_id=6983 then 'VOID' else 'WON' end where ticket_id=$1", [legacy.tickets[1].id]);
  assert.equal((await recalcTicket(legacy.tickets[1].id, { database })).payout, 105);
  assert.equal(await balance(legacyUser.id), 3899.99);
  for (const ticket of legacy.tickets) assert.equal(await recalcTicket(ticket.id, { database }), null);

  // Forged structures, duplicate picks/columns, and partial Cartesian products.
  const forged = await player();
  await assert.rejects(place({ ...input(forged), selections: [selections[0], selections[0]] }), /përsëritura/);
  await assert.rejects(place({ ...input(forged), columns: [[selections[0], selections[2]], [selections[0], selections[2]]] }), /përputhen/);
  await assert.rejects(place({ ...input(forged), columns: [[selections[0], selections[1]], [selections[1], selections[2]]] }), /përputhen/);
  await assert.rejects(place({ ...input(forged), selections: undefined, columns: [[selections[0], selections[2]]] }), /kolonash/);
  await assert.rejects(place({ ...input(forged), totalStake: 99.99 }), /minimale totale/);
  assert.equal(await balance(forged.id), 1000);
  await assert.rejects(place({ user: forged, stake: 100, columns: [[selections[0], selections[2]], [selections[1], selections[2]]], clientRequestId: randomUUID() }), /Rifresko faqen/);
  assert.equal(await balance(forged.id), 1000, 'old per-column client cannot silently place a differently priced slip');
  const regular = request => placeBet(request, { database, runQuery, getTicket, resolve });
  await assert.rejects(regular({ user, stake: 100, selections: [selections[0]], clientRequestId: request.clientRequestId }), error => error.status === 409);
  const singleUser = await player(), singleId = randomUUID();
  await regular({ user: singleUser, stake: 100, selections: [selections[0]], clientRequestId: singleId });
  await assert.rejects(place({ ...input(singleUser), clientRequestId: singleId }), error => error.status === 409);
  assert.equal(await balance(singleUser.id), 900);
  // The key is shared across ordinary and system endpoints under the same wallet lock.
  const racing = await player(), sharedId = randomUUID();
  const race = await Promise.allSettled([
    regular({ user: racing, stake: 100, selections: [selections[0]], clientRequestId: sharedId }),
    place({ ...input(racing), clientRequestId: sharedId }),
  ]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(race.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(await balance(racing.id), 900);
  for (const invalid of [Infinity, NaN, -1, 99.99, 100.001]) await assert.rejects(regular({ user: racing, stake: invalid, selections: [selections[0]] }));
  await assert.rejects(regular({ user: racing, stake: 100, selections: [selections[0], selections[1]] }), /njëjta ndeshje/);
  // Global LIVE limits see the total slip100, rather than accidentally counting200.
  upsert([1497, 6983].map(match_id => ({ match_id, home: 'Home', away: 'Away', service: 'LIVE' })));
  const riskUser = await player();
  const riskSettings = { ...DEFAULT_LIVE_RISK_SETTINGS, limits: { ...DEFAULT_LIVE_RISK_SETTINGS.limits, maxLiveStake: 100, maxMatchExposure: null } };
  await sql.query('update app_live_risk_settings set settings=$1::jsonb where id=1', [JSON.stringify(riskSettings)]);
  const riskBatch = await place(input(riskUser)); assert.equal(riskBatch.totalStake, 100);
  const riskRejected = await player();
  await assert.rejects(place({ ...input(riskRejected), totalStake: 100.01 }), error => error.code === 'LIVE_RISK_LIMIT');
  assert.equal(await balance(riskRejected.id), 1000);
  await sql.query('update app_live_risk_settings set settings=$1::jsonb where id=1', [JSON.stringify(DEFAULT_LIVE_RISK_SETTINGS)]);
  console.log('PASS system SQL ledger: total minimum100, exact50/33.34 split, server Cartesian validation, idempotent race/retry, atomic rollback, manager commissions, exclusions/limits, cancellation, additive wins/losses/VOID and no double credits');
} finally { await sql.close(); }
