import express from 'express';
import { pool, query } from '../db.mjs';
import { requireAuth } from '../ledger/auth.mjs';
import { isLedgerReady } from '../ledger/store.mjs';
import { publicRtpProfiles, profileById } from './rtp-profiles.mjs';
import { placeCasinoSpin } from './transactions.mjs';

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
  if(req.user.role !== 'PLAYER' || req.user.status !== 'ACTIVE')throw fault(403,'Account cannot play casino');
  const outcome=await placeCasinoSpin({
    userId:req.user.id,
    requestId:req.body?.clientRequestId,
    bet:req.body?.bet,denomination:req.body?.denomination,lines:req.body?.lines,
  });
  res.set('Cache-Control','no-store');
  res.json(outcome);
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
