import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import express from 'express';
import {LEDGER_SQL} from '../server/ledger/schema.mjs';
import {createCasinoWalletRouter} from '../server/casino/wallet.mjs';
const sql=new PGlite();await sql.exec(LEDGER_SQL);
const admin=randomUUID();await sql.query("insert into app_user(id,username,password_hash,role)values($1,'profile-admin','test-only','ADMIN')",[admin]);
await sql.query("update app_casino_settings set profile='SCHOOL_RTP_1' where id=1");
let queue=Promise.resolve();const database={async connect(){let release;const before=queue;queue=new Promise(resolve=>release=resolve);await before;return{query:(...args)=>sql.query(...args),release};}};
const runQuery=async(...args)=>{const db=await database.connect();try{return await db.query(...args);}finally{db.release();}};
const app=express();app.use(express.json());app.use('/app/api',createCasinoWalletRouter({database,runQuery,ready:()=>true,auth:(req,_res,next)=>{req.user={id:admin,username:'profile-admin',role:req.headers['x-test-role']||'ADMIN'};next();}}));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${server.address().port}/app/api`;
const get=async()=>{const r=await fetch(origin+'/admin/casino/settings');assert.equal(r.status,200);return r.json();};
const patch=async(body,role='ADMIN')=>fetch(origin+'/admin/casino/profile',{method:'PATCH',headers:{'content-type':'application/json','x-test-role':role},body:JSON.stringify(body)});
try{
 const settings=await get();assert.equal(settings.games.length,6);assert.equal(settings.legacyProfileIgnored,true);
 assert.ok(settings.games.every(game=>!String(game.profile).includes('SCHOOL_RTP_')));
 assert.ok(settings.games.every(game=>game.profiles.every(profile=>profile.theoreticalRtp>0&&profile.theoreticalRtp<=100)));
 for(const game of settings.games){
  const low=game.profiles[0],high=game.profiles.at(-1);
  assert.ok(low.theoreticalRtp<high.theoreticalRtp,`${game.gameId} offers real low/high profiles`);
  for(const profile of [low,high]){
   const r=await patch({gameId:game.gameId,profile:profile.id});assert.equal(r.status,200);
   const saved=(await r.json()).games.find(entry=>entry.gameId===game.gameId);
   assert.equal(saved.profile,profile.id);assert.equal(saved.theoreticalRtp,profile.theoreticalRtp);
   const persisted=(await sql.query('select game_profiles from app_casino_settings where id=1')).rows[0].game_profiles;
   assert.equal(persisted[game.gameId],profile.id);
  }
 }
 for(const body of [{profile:'SCHOOL_RTP_1'},{gameId:'sizzling',profile:'SCHOOL_RTP_1'},
  {gameId:'sizzling',profile:settings.games[0].profiles[0].id},
  {gameId:'sizzling',profile:settings.games.find(game=>game.gameId==='sizzling').profiles[0].id,userId:randomUUID()}])assert.equal((await patch(body)).status,400);
 assert.equal((await patch({gameId:settings.games[0].gameId,profile:settings.games[0].profiles[0].id},'PLAYER')).status,403);
 const audits=(await sql.query("select * from app_admin_audit where action='PATCH /admin/casino/profile'")).rows;
 assert.equal(audits.length,12);assert.ok(audits.every(row=>row.details.scope==='all players; future paid rounds only'));
 // Concurrent changes to different games keep both keys; the settings row is locked.
 await Promise.all(settings.games.slice(0,2).map(async game=>assert.equal((await patch({gameId:game.gameId,profile:game.profiles[0].id})).status,200)));
 const after=await get();for(const game of settings.games.slice(0,2))assert.equal(after.games.find(entry=>entry.gameId===game.gameId).profile,game.profiles[0].id);
 console.log('PASS casino profile admin: six real per-game choices, global SQL persistence, concurrent saves, audit, authorization, unsupported1% and per-player input rejection');
}finally{await new Promise(resolve=>server.close(resolve));await sql.close();}
