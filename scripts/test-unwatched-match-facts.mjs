import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {LEDGER_SQL} from '../server/ledger/schema.mjs';
import {recordPrimaryMatchFacts} from '../server/ledger/live-observation-store.mjs';
import {gradeStoredEventContract} from '../server/ledger/match-event-facts.mjs';
import {createEventCollector} from '../server/zizobet/event-collector.mjs';

const db=new PGlite();
try{
 await db.exec(LEDGER_SQL);
 const q=(sql,p=[])=>db.query(sql,p);
 const database={connect:async()=>({query:q,release(){}})};
 const base=Date.parse('2026-11-07T12:00:00Z'),id=890012;
 const frame=(second=false)=>({
  Match:{Score:second?'2:0':'1:0',MatchTimeExtended:'38:00',EventStatus:6,
   CornersTeam1:0,CornersTeam2:1,YellowCardsTeam1:0,YellowCardsTeam2:0,
   RedCardsTeam1:0,RedCardsTeam2:0},
  TimeLines:[
   {id:'goal-a',type:'score_change',team:1,gt:12,clk:'11:08',ownGoal:false,pl:'Forward'},
   {id:'corner-a',type:'corner_kick',team:2,gt:15,clk:'14:06'},
   ...(second?[{id:'goal-b',type:'score_change',team:1,gt:34,clk:'33:25',
     ownGoal:false,pl:'Forward'}]:[])
  ]
 });
 const archive=(second,offset)=>recordPrimaryMatchFacts(id,frame(second),{
  database,now:()=>base+offset
 });
 assert.equal((await archive(false,0)).stored,true);
 assert.equal((await q('select count(*)::int as n from app_ticket_line')).rows[0].n,0);
 assert.equal((await q('select count(*)::int as n from app_live_event_frame')).rows[0].n,0,
  'passive fixtures persist no raw frames');
 assert.equal((await q('select count(*)::int as n from app_match_event_fact where match_id=$1',[id])).rows[0].n,2);
 assert.equal((await archive(false,6000)).stored,true);
 const coverage=(await q("select confirmed_at from app_match_event_coverage where match_id=$1 and provider='zizobet' and kind='goal'",[id])).rows[0];
 assert.ok(coverage?.confirmed_at,'a second identical feed observation confirms goal history');
 const user=(await q("insert into app_user(username,password_hash,balance)values('passive-facts-user','isolated',1000) returning id")).rows[0].id;
 const ticket=(await q("insert into app_ticket(user_id,stake,total_odds,potential_payout,status)values($1,100,2,200,'PENDING') returning id",[user])).rows[0].id;
 const contract={version:1,kind:'sequence',event:'goal',target:2,side:'home',baseline:{home:1,away:0}};
 const line=(await q("insert into app_ticket_line(ticket_id,match_id,market_key,outcome_key,outcome_name,market_name,match_name,odds_at_placement,live_contract)values($1,$2,'native','1','Home','Next Goal','Home - Away',2,$3::jsonb) returning *",[ticket,id,JSON.stringify(contract)])).rows[0];
 assert.equal(await gradeStoredEventContract(line,null,{execute:q}),null,'prior goal is not the next goal');
 await archive(true,12000);
 assert.equal(await gradeStoredEventContract(line,null,{execute:q}),null,'single later goal poll cannot pay');
 await archive(true,18000);
 assert.equal(await gradeStoredEventContract(line,null,{execute:q}),'WON');
 assert.equal(Number((await q('select balance from app_user where id=$1',[user])).rows[0].balance),1000,
   'fact archiving never touches the wallet');
 // The collector queues background facts and skips unmodified frame spam.
 let t=base,records=0,watchedWrites=0;
 const collector=createEventCollector({getWatchIds:async()=>new Set(),
  now:()=>t,recordGeneral:async()=>{records++;return {stored:true};},
  save:async()=>{watchedWrites++;},recordFrame:async()=>{watchedWrites++;}
 });
 await collector({match_id:222},frame(false));assert.equal(records,1);
 t+=3000;await collector({match_id:222},frame(false));assert.equal(records,1);
 t+=6000;await collector({match_id:222},frame(false));assert.equal(records,2);
 t+=6000;await collector({match_id:222},frame(false));assert.equal(records,2);
 t+=1000;await collector({match_id:222},frame(true));assert.equal(records,3);
 assert.equal(watchedWrites,0,'background capture never writes ticket-level raw data');
 console.log('PASS passive event capture: durable events, second confirmation, future ticket, no extra raw frames');
}finally{await db.close();}
