import express from 'express';
import { pool, query } from '../db.mjs';
import { requireAuth } from '../ledger/auth.mjs';
import { isLedgerReady } from '../ledger/store.mjs';
import { assertPlayerCanBet } from '../ledger/player-controls.mjs';
import { randomGrid, gradeGrid, symbolMatrix } from './sizzling-demo.mjs';

// Real-money mode requires BOTH a deployment flag and an audited admin switch.
// The included game math is an UNVERIFIED adapter, not certified provider software.
export const casinoWalletRouter = express.Router();
const deploymentEnabled = () => process.env.CASINO_REAL_MONEY_ENABLED === 'true';
const money = value => Number(Number(value).toFixed(2));
const fault = (status, message) => Object.assign(new Error(message), { status });
const safe = handler => (req, res) => Promise.resolve(handler(req, res)).catch(error => {
  if (!error.status || error.status >= 500) console.error('[casino wallet]', error);
  return res.status(error.status || 500).json({ message: error.status ? error.message : 'Casino service unavailable' });
});
const access = [requireAuth, (req, res, next) => isLedgerReady()
  ? next() : res.status(503).json({ message: 'Ledger database unavailable' })];
const isAdmin = (req, res, next) => req.user.role === 'ADMIN'
  ? next() : res.status(403).json({ message: 'Administrator only' });
async function getSettings(executor = query) {
  const { rows } = await executor('select enabled, profile from app_casino_settings where id = 1');
  const setting = rows[0] || { enabled: false, profile: 'SIZZLING_STANDARD_V1' };
  return {
    enabled: Boolean(setting.enabled), deploymentEnabled: deploymentEnabled(),
    realMoneyAvailable: Boolean(setting.enabled) && deploymentEnabled(),
    profile: setting.profile, certified: false, theoreticalRtp: null,
    warning: 'Uncertified game mathematics. Monetary play requires licensing, independent validation and production QA.',
  };
}

casinoWalletRouter.get('/casino/status', ...access, safe(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...await getSettings(), balance: req.user.balance });
}));

casinoWalletRouter.post('/casino/spin', ...access, safe(async (req, res) => {
  if (req.user.role !== 'PLAYER' || req.user.status !== 'ACTIVE') throw fault(403, 'Account cannot play casino');
  if (!deploymentEnabled()) throw fault(403, 'Real-money casino is disabled by deployment');
  const requestId = String(req.body?.clientRequestId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
    throw fault(400, 'Unique UUID request ID required');
  const bet = Number(req.body?.bet), denomination = Number(req.body?.denomination), lines = Number(req.body?.lines);
  if (![1,2,3,5,10,20,30,50,100].includes(bet) || ![0.5,1,2,5,10].includes(denomination) || lines !== 5)
    throw fault(400, 'Invalid stake, lines or denomination');
  const stake = money(bet * lines * denomination);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const userResult = await client.query('select role,status,balance from app_user where id=$1 for update', [req.user.id]);
    const user = userResult.rows[0];
    if (!user || user.role !== 'PLAYER' || user.status !== 'ACTIVE') throw fault(403, 'Account unavailable');
    const config = await client.query('select enabled from app_casino_settings where id=1 for share');
    if (!config.rows[0]?.enabled) throw fault(403, 'Casino play is disabled');
    const previous = await client.query('select * from app_casino_round where user_id=$1 and client_request_id=$2', [req.user.id,requestId]);
    if (previous.rows.length) {
      const r = previous.rows[0];
      if (Number(r.bet)!==bet || Number(r.denomination)!==denomination || Number(r.lines)!==lines)
        throw fault(409, 'Request ID already used with another stake');
      await client.query('commit');
      return res.json({ roundId:r.id, stake:Number(r.stake), payout:Number(r.payout),
        balance:Number(r.balance_after), result:r.result, replayed:true });
    }
    if (Number(user.balance) < stake) throw fault(400, 'Not enough funds');
    await assertPlayerCanBet(client, req.user.id, stake);
    const grid = randomGrid();
    const win = gradeGrid(grid, bet, denomination);
    const payout = money(win.total), afterDebit = money(Number(user.balance)-stake);
    const after = money(afterDebit+payout);
    const outcome = { symbols:symbolMatrix(grid), line_wins:win.line_wins, total:payout.toFixed(2) };
    const round = await client.query(
      "insert into app_casino_round (user_id, client_request_id, game_id, game_version, bet, denomination, lines, stake, payout, balance_after, result) values ($1,$2,'sizzling','SIZZLING_STANDARD_V1',$3,$4,$5,$6,$7,$8,$9::jsonb) returning id",
      [req.user.id,requestId,bet,denomination,lines,stake,payout,after,JSON.stringify(outcome)]);
    const roundId = round.rows[0].id;
    await client.query(
      "insert into app_transaction (user_id,amount,type,reference_id,balance_after,description) values ($1,$2,'CASINO_SPIN',$3,$4,'Sizzling Hot Deluxe - spin')",
      [req.user.id,-stake,roundId,afterDebit]);
    if (payout > 0) await client.query(
      "insert into app_transaction (user_id,amount,type,reference_id,balance_after,description) values ($1,$2,'CASINO_WIN',$3,$4,'Sizzling Hot Deluxe - payout')",
      [req.user.id,payout,roundId,after]);
    await client.query('update app_user set balance=$2,updated_at=now() where id=$1', [req.user.id,after]);
    await client.query('commit');
    res.set('Cache-Control','no-store');
    res.json({roundId,stake,payout,balance:after,result:outcome,replayed:false});
  } catch(error) {
    await client.query('rollback').catch(()=>{});
    throw error;
  } finally { client.release(); }
}));

casinoWalletRouter.get('/admin/casino/settings', ...access, isAdmin, safe(async (_req,res) => res.json(await getSettings())));
casinoWalletRouter.patch('/admin/casino/settings', ...access, isAdmin, safe(async(req,res)=>{
  if(typeof req.body?.enabled !== 'boolean') throw fault(400, 'enabled must be boolean');
  if(req.body.enabled && !deploymentEnabled()) throw fault(409,'Deployment flag CASINO_REAL_MONEY_ENABLED is off');
  const client=await pool.connect();
  try {
    await client.query('begin');
    const update=await client.query('update app_casino_settings set enabled=$1,updated_by=$2,updated_at=now() where id=1 returning enabled,profile',[req.body.enabled,req.user.id]);
    await client.query(
      "insert into app_admin_audit (actor_id,actor_name,actor_role,action,target_type,target_id,details) values ($1,$2,$3,'PATCH /admin/casino/settings','casino','sizzling',$4::jsonb)",
      [req.user.id,req.user.username,req.user.role,JSON.stringify({enabled:req.body.enabled,profile:update.rows[0].profile})]);
    await client.query('commit');
    res.json(await getSettings());
  } catch(error) { await client.query('rollback').catch(()=>{});throw error; }
  finally {client.release();}
}));
