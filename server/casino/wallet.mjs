import express from 'express';
import { pool, query } from '../db.mjs';
import { requireAuth } from '../ledger/auth.mjs';
import { isLedgerReady } from '../ledger/store.mjs';
import {publicGameProfiles,validateGameProfile} from './game-rtp-profiles.mjs';
import {validateControls,customGameSummary} from './custom-math.mjs';
import {casinoControls,casinoMathVersion} from './casino-controls.mjs';

// Sizzling uses the same authenticated PostgreSQL balance as sports betting.
// The admin may suspend wagering at any time; math remains uncertified.
const fault = (status, message) => Object.assign(new Error(message), { status });
const safe = handler => (req, res) => Promise.resolve(handler(req, res)).catch(error => {
  if (!error.status || error.status >= 500) console.error('[casino wallet]', error);
  return res.status(error.status || 500).json({ message: error.status ? error.message : 'Casino service unavailable' });
});
const isAdmin = (req, res, next) => req.user.role === 'ADMIN'
  ? next() : res.status(403).json({ message: 'Administrator only' });
export async function getCasinoSettings(executor = query) {
  const { rows } = await executor('select enabled, profile, game_profiles, game_controls from app_casino_settings where id = 1');
  const setting = rows[0] || { enabled: false, profile: 'SIZZLING_STANDARD_V1' };
  const games=publicGameProfiles(setting.game_profiles).map(game=>{
    const controls=casinoControls(setting.game_controls,game.gameId);
    let summary,configurationError;
    try{summary=customGameSummary(game.gameId,{controls});}catch(error){summary=customGameSummary(game.gameId);configurationError=error.message;}
    let mathVersion=null;try{mathVersion=casinoMathVersion(game.gameId,setting);}catch{}
    return {...game,configurationError:configurationError??(controls.mode==='custom'?null:game.configurationError),controls,customLimits:summary.customLimits,
      effectiveRtp:controls.mode==='custom'?controls.rtp:game.theoreticalRtp,
      effectiveHitFrequency:controls.mode==='custom'?controls.hitFrequency:null,
      mathVersion,customVersion:summary.version,maxPayoutMultiplier:summary.maxPayoutMultiplier};
  }),sizzling=games.find(game=>game.gameId==='sizzling');
  return {
    enabled: Boolean(setting.enabled),
    stakeLimits:{min:0.20,max:5000,currency:'ALL'},
    deploymentEnabled: true,
    realMoneyAvailable: true,
    profile:sizzling.profile,profiles:sizzling.profiles,games,
    mathApproved:false,certified:false,theoreticalRtp:sizzling.theoreticalRtp,
    legacyProfileIgnored:setting.profile!=='SIZZLING_STANDARD_V1',
    warning: setting.profile!=='SIZZLING_STANDARD_V1'?'Konfigurimi i vjetër me përqindje nuk kontrollonte të gjitha lojërat. Aktiv janë vetëm profilet për lojë të shfaqura më poshtë.':null,
  };
}

export function createCasinoWalletRouter({database=pool,runQuery=query,auth=requireAuth,ready=isLedgerReady}={}){
const casinoWalletRouter=express.Router();
const access=[auth,(_req,res,next)=>ready()?next():res.status(503).json({message:'Ledger database unavailable'})];

casinoWalletRouter.get('/casino/status', ...access, safe(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...await getCasinoSettings(runQuery), balance: req.user.balance });
}));

// Game-specific protocol routes own wagering; these endpoints manage global settings.

casinoWalletRouter.get('/admin/casino/settings', ...access, isAdmin, safe(async (_req,res) => res.json(await getCasinoSettings(runQuery))));
casinoWalletRouter.patch('/admin/casino/settings', ...access, isAdmin, safe(async(req,res)=>{
  if(typeof req.body?.enabled !== 'boolean') throw fault(400, 'enabled must be boolean');
  const client=await database.connect();
  try {
    await client.query('begin');
    const update=await client.query('update app_casino_settings set enabled=$1,updated_by=$2,updated_at=now() where id=1 returning enabled,profile',[req.body.enabled,req.user.id]);
    await client.query(
      "insert into app_admin_audit (actor_id,actor_name,actor_role,action,target_type,target_id,details) values ($1,$2,$3,'PATCH /admin/casino/settings','casino','sizzling',$4::jsonb)",
      [req.user.id,req.user.username,req.user.role,JSON.stringify({enabled:req.body.enabled,profile:update.rows[0].profile})]);
    await client.query('commit');
    res.json(await getCasinoSettings(client.query.bind(client)));
  } catch(error) { await client.query('rollback').catch(()=>{});throw error; }
  finally {client.release();}
}));


// Switch only between published, immutable profiles; no per-player RTP.
// Active rounds hold FOR SHARE; this update takes an exclusive row lock.
casinoWalletRouter.patch('/admin/casino/profile', ...access, isAdmin, safe(async(req,res)=>{
  if(!req.body||Object.keys(req.body).some(key=>!['gameId','profile'].includes(key)))throw fault(400,'Select a supported global game profile');
  const profile=String(req.body?.profile||''),gameId=String(req.body?.gameId||'');
  validateGameProfile(gameId,profile);
  const client=await database.connect();
  try {
    await client.query('begin');
    const settings=await client.query('select game_profiles from app_casino_settings where id=1 for update');
    if(!settings.rows.length)throw fault(503,'Casino settings unavailable');
    const previous=settings.rows[0].game_profiles?.[gameId]??null;
    const next={...settings.rows[0].game_profiles,[gameId]:profile};
    await client.query('update app_casino_settings set game_profiles=$1::jsonb,updated_by=$2,updated_at=now() where id=1',
      [JSON.stringify(next),req.user.id]);
    await client.query(
      "insert into app_admin_audit(actor_id,actor_name,actor_role,action,target_type,target_id,details) values($1,$2,$3,'PATCH /admin/casino/profile','casino',$4,$5::jsonb)",
      [req.user.id,req.user.username,req.user.role,gameId,JSON.stringify({from:previous,to:profile,scope:'all players; future paid rounds only'})]);
    await client.query('commit');
    res.json(await getCasinoSettings(client.query.bind(client)));
  } catch(error){await client.query('rollback').catch(()=>{});throw error;}
  finally {client.release();}
}));

casinoWalletRouter.patch('/admin/casino/controls',...access,isAdmin,safe(async(req,res)=>{
  if(!req.body||Object.keys(req.body).some(key=>!['gameId','mode','rtp','hitFrequency'].includes(key)))throw fault(400,'Select global game controls');
  const gameId=String(req.body.gameId||'');
  const controls=validateControls(gameId,{mode:req.body.mode,rtp:req.body.rtp,hitFrequency:req.body.hitFrequency});
  const client=await database.connect();
  try{
    await client.query('begin');
    const locked=await client.query('select game_controls from app_casino_settings where id=1 for update');
    if(!locked.rows.length)throw fault(503,'Casino settings unavailable');
    const previous=casinoControls(locked.rows[0].game_controls,gameId);
    const updated={...locked.rows[0].game_controls,[gameId]:controls};
    await client.query('update app_casino_settings set game_controls=$1::jsonb,updated_by=$2,updated_at=now() where id=1',[JSON.stringify(updated),req.user.id]);
    await client.query("insert into app_admin_audit(actor_id,actor_name,actor_role,action,target_type,target_id,details) values($1,$2,$3,'PATCH /admin/casino/controls','casino',$4,$5::jsonb)",
      [req.user.id,req.user.username,req.user.role,gameId,JSON.stringify({from:previous,to:controls,scope:'all players; future paid rounds only'})]);
    await client.query('commit');
    res.json(await getCasinoSettings(client.query.bind(client)));
  }catch(error){await client.query('rollback').catch(()=>{});throw error;}
  finally{client.release();}
}));
return casinoWalletRouter;
}
export const casinoWalletRouter=createCasinoWalletRouter();
