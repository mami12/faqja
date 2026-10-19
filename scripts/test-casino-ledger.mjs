/**
 * Run with a disposable PostgreSQL database, never a production database.
 * Tests real balance debits/payouts, replay protection, manager liability,
 * staff scoping, and player self-exclusion.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initLedgerSchema,createUser,getUserById} from '../server/ledger/store.mjs';
import {query,closePool} from '../server/db.mjs';
import {placeCasinoSpin} from '../server/casino/transactions.mjs';
import {generateCasinoFinanceReport} from '../server/casino/finance.mjs';
const round=x=>Number(Number(x).toFixed(2));
if(!process.env.DATABASE_URL?.includes('/casino_test'))throw new Error('Run only against a disposable casino_test database');
if(process.env.CASINO_REAL_MONEY_ENABLED!=='true'||process.env.CASINO_MATH_APPROVED!=='true')
  throw new Error('Set both guarded test flags');
try{
  await initLedgerSchema();
  const manager=await createUser({username:'m'+randomUUID(),passwordHash:'unused',role:'MANAGER',balance:10000});
  const other=await createUser({username:'m'+randomUUID(),passwordHash:'unused',role:'MANAGER',balance:10000});
  const player=await createUser({username:'p'+randomUUID(),passwordHash:'unused',role:'PLAYER',balance:10000,managerId:manager.id});
  await query('update app_casino_settings set enabled=true where id=1');
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
