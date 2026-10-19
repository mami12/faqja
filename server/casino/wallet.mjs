import express from 'express';
import { pool, query } from '../db.mjs';
import { requireAuth } from '../ledger/auth.mjs';
import { isLedgerReady } from '../ledger/store.mjs';
import { assertPlayerCanBet } from '../ledger/player-controls.mjs';
import { gradeGrid, symbolMatrix } from './sizzling-demo.mjs';
import { randomProfileGrid, publicRtpProfiles, profileById } from './rtp-profiles.mjs';

// Real-money mode requires BOTH a deployment flag and an audited admin switch.
// The included game math is an UNVERIFIED adapter, not certified provider software.
export const casinoWalletRouter = express.Router();
const deploymentEnabled = () => process.env.CASINO_REAL_MONEY_ENABLED === 'true';
const mathApproved = () => process.env.CASINO_MATH_APPROVED === 'true';
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
  const profiles = publicRtpProfiles();
  const profile = profiles.find(p => p.id === setting.profile);
  return {
    enabled: Boolean(setting.enabled),
    deploymentEnabled: deploymentEnabled(),
    realMoneyAvailable: Boolean(setting.enabled) && deploymentEnabled() && mathApproved(),
    profile: setting.profile,
    profiles, certified: mathApproved(), theoreticalRtp: profile?.theoreticalRtp ?? null,
    warning: 'This is a custom adapter, not independently certified Novomatic game math. Monetary mode needs audited provider math, rights and QA.',
  };
}

casinoWalletRouter.get('/casino/status', ...access, safe(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...await getSettings(), balance: req.user.balance });
}));

casinoWalletRouter.post('/casino/spin', ...access, safe(async (req, res) => {
  if (req.user.role !== 'PLAYER' || req.user.status !== 'ACTIVE') throw fault(403, 'Account cannot play casino');
  if (!deploymentEnabled() || !mathApproved()) throw fault(403, 'Real-money casino is disabled until independent validation and deployment approval');
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
    // Lock player and manager in UUID order, matching cashier transfer locks.
    const owner = await client.query('select manager_id from app_user where id=$1', [req.user.id]);
    if (!owner.rows.length) throw fault(404, 'Player not found');
    const ids = [req.user.id, owner.rows[0].manager_id].filter(Boolean).sort();
    const accounts = await client.query(
      'select id,role,status,balance,manager_id from app_user where id=any($1::uuid[]) order by id for update',[ids]);
    const byId = new Map(accounts.rows.map(row => [row.id,row]));
    const user = byId.get(req.user.id);
    if (!user || user.role !== 'PLAYER' || user.status !== 'ACTIVE') throw fault(403, 'Account unavailable');
    if (user.manager_id !== owner.rows[0].manager_id) throw fault(409, 'Account manager changed during spin. Retry.');
    const manager = user.manager_id ? byId.get(user.manager_id) : null;
    if (user.manager_id && (!manager || manager.role !== 'MANAGER')) throw fault(409, 'Account manager is unavailable');
    const config = await client.query('select enabled,profile from app_casino_settings where id=1 for share');
    if (!config.rows[0]?.enabled) throw fault(403, 'Casino play is disabled');
    const profileId = config.rows[0].profile;
    if (!profileById(profileId)) throw fault(503, 'Unrecognized casino math profile');
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
    const grid = randomProfileGrid(profileId);
    const win = gradeGrid(grid, bet, denomination);
    const payout = money(win.total), afterDebit = money(Number(user.balance)-stake);
    const after = money(afterDebit+payout);
    const outcome = { symbols:symbolMatrix(grid), line_wins:win.line_wins, total:payout.toFixed(2) };
    const round = await client.query(
      "insert into app_casino_round (user_id, client_request_id, game_id, game_version, bet, denomination, lines, stake, payout, balance_after, result) values ($1,$2,'sizzling',$10,$3,$4,$5,$6,$7,$8,$9::jsonb) returning id",
      [req.user.id,requestId,bet,denomination,lines,stake,payout,after,JSON.stringify(outcome),profileId]);
    const roundId = round.rows[0].id;
    await client.query(
      "insert into app_transaction (user_id,amount,type,reference_id,balance_after,description) values ($1,$2,'CASINO_SPIN',$3,$4,'Sizzling Hot Deluxe - spin')",
      [req.user.id,-stake,roundId,afterDebit]);
    if (payout > 0) await client.query(
      "insert into app_transaction (user_id,amount,type,reference_id,balance_after,description) values ($1,$2,'CASINO_WIN',$3,$4,'Sizzling Hot Deluxe - payout')",
      [req.user.id,payout,roundId,after]);
    await client.query('update app_user set balance=$2,updated_at=now() where id=$1', [req.user.id,after]);
    if (manager) {
      const managerDelta = money(stake-payout);
      const managerAfter = money(Number(manager.balance)+managerDelta);
      await client.query('update app_user set balance=$2,updated_at=now() where id=$1',
        [manager.id,managerAfter]);
      await client.query(
        "insert into app_transaction (user_id,amount,type,reference_id,balance_after,description) values ($1,$2,'CASINO_MANAGER_NET',$3,$4,$5)",
        [manager.id,managerDelta,roundId,managerAfter,'Sizzling Hot Deluxe: player ' + req.user.username]);
    }
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
  if(req.body.enabled && (!deploymentEnabled() || !mathApproved())) throw fault(409,'Real money requires deployment flag and independent math approval');
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


// Switch only between published, immutable profiles; no per-player RTP.
// Active rounds hold FOR SHARE; this update takes an exclusive row lock.
casinoWalletRouter.patch('/admin/casino/profile', ...access, isAdmin, safe(async(req,res)=>{
  const profile=String(req.body?.profile||'');
  if(!profileById(profile)) throw fault(400,'Unknown RTP profile');
  const client=await pool.connect();
  try {
    await client.query('begin');
    const settings=await client.query('select enabled,profile from app_casino_settings where id=1 for update');
    if(settings.rows[0]?.enabled) throw fault(409,'Disable monetary casino before changing the RTP profile');
    const previous=settings.rows[0]?.profile;
    await client.query('update app_casino_settings set profile=$1,updated_by=$2,updated_at=now() where id=1',
      [profile,req.user.id]);
    await client.query(
      "insert into app_admin_audit(actor_id,actor_name,actor_role,action,target_type,target_id,details) values($1,$2,$3,'PATCH /admin/casino/profile','casino','sizzling',$4::jsonb)",
      [req.user.id,req.user.username,req.user.role,JSON.stringify({from:previous,to:profile})]);
    await client.query('commit');
    res.json(await getSettings());
  } catch(error){await client.query('rollback').catch(()=>{});throw error;}
  finally {client.release();}
}));
