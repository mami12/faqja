/**
 * Run with a disposable PostgreSQL database, never a production database.
 * Tests real balance debits/payouts, replay protection, manager liability,
 * staff scoping, and player self-exclusion.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {signToken} from '../server/ledger/auth.mjs';
import {casinoSessionRouter,createSizzlingRealRouter} from '../server/casino/sizzling-real.mjs';
import {casinoWalletRouter} from '../server/casino/wallet.mjs';
import {initLedgerSchema,createUser,getUserById} from '../server/ledger/store.mjs';
import {query,closePool} from '../server/db.mjs';
import {placeCasinoSpin} from '../server/casino/transactions.mjs';
import {generateCasinoFinanceReport} from '../server/casino/finance.mjs';
const round=x=>Number(Number(x).toFixed(2));
if(!process.env.DATABASE_URL?.includes('/casino_test'))throw new Error('Run only against a disposable casino_test database');
try{
  // A new or migrated database should make Sizzling available to the sports
  // wallet without requiring environment variables on Railway.
  await initLedgerSchema();
  let activation=await query('select enabled,wallet_rollout_applied from app_casino_settings where id=1');
  assert.equal(activation.rows[0].enabled,true,'the sports wallet should be available after first deployment');
  assert.equal(activation.rows[0].wallet_rollout_applied,true,'the migration must run once');
  // An explicit admin shutdown must remain in force after a server restart.
  await query('update app_casino_settings set enabled=false where id=1');
  await initLedgerSchema();
  activation=await query('select enabled from app_casino_settings where id=1');
  assert.equal(activation.rows[0].enabled,false,'admin shutdown must not be reversed');
  await query('update app_casino_settings set enabled=true where id=1');
  const manager=await createUser({username:'m'+randomUUID(),passwordHash:'unused',role:'MANAGER',balance:10000});
  const other=await createUser({username:'m'+randomUUID(),passwordHash:'unused',role:'MANAGER',balance:10000});
  const player=await createUser({username:'p'+randomUUID(),passwordHash:'unused',role:'PLAYER',balance:10000,managerId:manager.id});
  const requestId=randomUUID();
  const a=await placeCasinoSpin({userId:player.id,requestId,bet:1,denomination:1,lines:5});
  const b=await placeCasinoSpin({userId:player.id,requestId,bet:1,denomination:1,lines:5});
  assert.equal(a.roundId,b.roundId);
  assert.equal(b.replayed,true);
  assert.equal(a.stake,5);
  const latest=await getUserById(player.id);
  assert.equal(latest.balance,round(10000-5+a.payout));
  const m=await getUserById(manager.id);
  assert.equal(m.balance,round(10000+5-a.payout));
  let tx=await query('select type,amount from app_transaction where reference_id=$1 order by created_at',[a.roundId]);
  assert.equal(tx.rows.filter(x=>x.type==='CASINO_SPIN').length,1);
  assert.equal(tx.rows.filter(x=>x.type==='CASINO_MANAGER_NET').length,1);
  if(a.payout>0)assert.equal(tx.rows.filter(x=>x.type==='CASINO_WIN').length,1);
  let report=await generateCasinoFinanceReport({managerId:manager.id,userId:player.id});
  assert.equal(report.players.length,1);
  assert.equal(report.players[0].casinoSpins,1);
  assert.equal(report.players[0].casinoStake,5);
  assert.equal(report.players[0].casinoPayout,a.payout);
  assert.equal(report.players[0].net,round(a.payout-5));
  const unauthorized=await generateCasinoFinanceReport({managerId:other.id,userId:player.id});
  assert.equal(unauthorized.players.length,0);
  assert.deepEqual(unauthorized.transactions,[]);
  // A second Sizzling wager is settled into the same shared wallet.
  const second=await placeCasinoSpin({userId:player.id,requestId:randomUUID(),bet:2,denomination:1,lines:5});
  assert.equal(second.stake,10);
  report=await generateCasinoFinanceReport({managerId:manager.id,userId:player.id});
  assert.equal(report.players[0].casinoSpins,2);
  assert.equal(report.players[0].casinoStake,15);
  assert.equal(report.players[0].casinoPayout,round(a.payout+second.payout));
  const currentPlayer=await getUserById(player.id);
  const currentManager=await getUserById(manager.id);
  assert.equal(currentPlayer.balance,round(10000-15+a.payout+second.payout));
  assert.equal(currentManager.balance,round(10000+15-a.payout-second.payout));
  // The actual Pixi client uses a same-origin cookie rather than Bearer on
  // its multipart spin requests; prove that its balance is the SPORT balance.
  const app=express();
  app.use(express.json());
  app.get('/app/api/auth/me',async(req,res)=>{
    const auth=req.get('authorization')||'';
    res.json(auth.startsWith('Bearer ')?await getUserById(player.id):null);
  });
  app.use('/app/api',casinoSessionRouter);
  app.use('/app/api',casinoWalletRouter);
  app.use('/app/api/casino/sizzlinghotdeluxe/real',createSizzlingRealRouter());
  const http=await new Promise(ok=>{
    const listener=app.listen(0,'127.0.0.1',()=>ok(listener));
  });
  try{
    const origin='http://127.0.0.1:'+http.address().port;
    const token=signToken(player);
    const before=await getUserById(player.id);
    const state=await fetch(origin+'/app/api/casino/status',{headers:{Authorization:'Bearer '+token}});
    assert.equal(state.status,200);
    const walletStatus=await state.json();
    assert.equal(walletStatus.realMoneyAvailable,true);
    assert.equal(walletStatus.balance,before.balance,'casino status uses sportsbook balance');
    const session=await fetch(origin+'/app/api/casino/session',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',
    });
    assert.equal(session.status,200,'Pixi wallet must establish authenticated session');
    assert.equal((await session.json()).gameUrl,'/app/casino-original/sizzling/index-real.html');
    const cookie=session.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('casino_pixi_wallet_session='));
    const play=async(payload)=>{
      const form=new FormData();
      form.append('data',JSON.stringify(payload));
      const response=await fetch(origin+'/app/api/casino/sizzlinghotdeluxe/real/play',{
        method:'POST',headers:{Cookie:cookie,Origin:origin},body:form,
      });
      return {status:response.status,body:await response.json()};
    };
    const init=await play({action:'init',request_id:'0'});
    assert.equal(init.status,200);
    assert.equal(init.body.balance.after,before.balance,'Pixi cabinet must start at sports balance');
    const request={action:'spin',bet:1,lines:5,denomination:1,request_id:'1'};
    const spin=await play(request);
    assert.equal(spin.status,200);
    assert.ok(spin.body.spin.symbols&&spin.body.spin.wins,'Pixi receives graphical reel outcome');
    const after=await getUserById(player.id);
    assert.equal(after.balance,spin.body.balance.after,'sports header must equal Pixi wallet');
    assert.equal(after.balance,round(before.balance-5+Number(spin.body.spin.wins.total)));
    const replay=await play(request);
    assert.deepEqual(replay.body,spin.body,'repeated Pixi request must not deduct again');
    assert.equal((await getUserById(player.id)).balance,after.balance);
    const collect=await play({action:'collect',request_id:'2'});
    assert.equal(collect.status,200);
    assert.equal(collect.body.balance.after,after.balance,'collect must not pay twice');
    const me=await fetch(origin+'/app/api/auth/me',{headers:{Authorization:'Bearer '+token}});
    assert.equal((await me.json()).balance,after.balance,'same sports auth/me balance after Pixi spin');
  }finally{
    await new Promise(done=>http.close(done));
  }
  // A self-excluded account must not be able to wager in either category.
  await query(
    "insert into app_player_controls(user_id,self_excluded_until) values($1,now()+interval '1 day') on conflict(user_id) do update set self_excluded_until=excluded.self_excluded_until",
    [player.id]);
  await assert.rejects(
    placeCasinoSpin({userId:player.id,requestId:randomUUID(),bet:1,denomination:1,lines:5}),
    error => error?.status === 403);
  console.log('Casino wallet integration OK: player, manager, Sizzling ledger, idempotency, scoped finances, exclusion');
}finally{
  await query('update app_casino_settings set enabled=false where id=1').catch(()=>{});
  await closePool();
}
