import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {LEDGER_SQL} from '../server/ledger/schema.mjs';
import {settleVerifiedEventFacts} from '../server/ledger/settler.mjs';

/** Regression: a valid accepted contract is not limited to zz...@ keys.
 * Real PGlite SQL, fake financial callbacks: NEVER moves money.
 */
const db=new PGlite();
try{
 await db.exec(LEDGER_SQL);
 const query=(sql,params=[])=>db.query(sql,params);
 const user=(await query("insert into app_user(username,password_hash,balance) values('market-key-regression','isolated',1000) returning id")).rows[0].id;
 const ticket=(await query(
  "insert into app_ticket(user_id,stake,total_odds,potential_payout,status) values($1,100,2,200,'PENDING') returning id",
  [user])).rows[0].id;
 const contract=JSON.stringify({version:1,kind:'sequence',event:'goal',target:1,side:'home',baseline:{home:0,away:0}});
 const insertLine=async(matchId,key)=>{
  const r=await query(`insert into app_ticket_line
    (ticket_id,match_id,market_key,outcome_key,outcome_name,market_name,match_name,
     odds_at_placement,live_contract)
    values($1,$2,$3,'1','Home','Next Goal','Home - Away',2,$4::jsonb)
    returning id`,[ticket,matchId,key,contract]);
  return r.rows[0].id;
 };
 const accepted=await insertLine(881111,'provider-other-format-123');
 const unconfirmed=await insertLine(881112,'provider-other-format-456');
 const now=new Date('2026-11-07T09:00:00.000Z');
 for(const matchId of [881111,881112]){
  await query(`insert into app_match_event_fact
    (match_id,provider,provider_event_id,kind,team,minute,seconds,active)
    values($1,'zizobet','goal-1','goal','home',20,1205,true)`,[matchId]);
  await query(`insert into app_match_event_coverage
    (match_id,provider,kind,through_minute,count_home,count_away,complete,observed_at,confirmed_at)
    values($1,'zizobet','goal',30,1,0,false,$2,$3)`,[
     matchId,now,matchId===881111?now:null]);
  await query('insert into app_live_event_cursor(match_id,last_seen_at) values($1,$2)',[matchId,now]);
 }
 const updates=[];
 const report=await settleVerifiedEventFacts({
  runQuery:query,
  update:async(id,status,tid)=>{updates.push({id,status,tid});return 1;},
  recalc:async()=>null
 });
 assert.equal(report.examined,2,'Both market-key formats enter the evidence pipeline');
 assert.equal(report.graded,1,'Only independently confirmed incidents may be graded');
 assert.deepEqual(updates.map(x=>({id:x.id,status:x.status})),[{id:accepted,status:'WON'}]);
 assert.ok(!updates.some(x=>x.id===unconfirmed),'Unconfirmed primary evidence stays PENDING');
 assert.equal(Number((await query('select balance from app_user where id=$1',[user])).rows[0].balance),1000);
 assert.equal((await query('select status from app_ticket where id=$1',[ticket])).rows[0].status,'PENDING');
 console.log('PASS: non-zz verified live market keys are considered; unconfirmed facts never pay');
}finally{await db.close();}
