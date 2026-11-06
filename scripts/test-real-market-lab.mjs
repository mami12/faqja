import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {validateRealTestRequest,chooseRealTestCases,createRealMarketTestRun,
 processRealMarketTestQueue,evaluateRealMarketTestCase,isDefinitiveRejection} from '../server/ledger/real-market-lab.mjs';
import {REAL_MARKET_LAB_SQL} from '../server/ledger/real-market-lab-schema.mjs';

const admin={id:'123e4567-e89b-42d3-a456-426614174000',username:'test-admin',role:'ADMIN',status:'ACTIVE'};
const requestId='123e4567-e89b-42d3-a456-426614174001';
assert.match(REAL_MARKET_LAB_SQL,/unique\(actor_id, request_id\)/);
assert.match(REAL_MARKET_LAB_SQL,/ticket_id uuid unique/);
assert.equal(validateRealTestRequest({actor:admin,stakePerTicket:100,ticketCount:2,requestId}).stake,100);
for(const actor of [{...admin,role:'PLAYER'},{...admin,status:'BANNED'}]){
 assert.throws(()=>validateRealTestRequest({actor,stakePerTicket:100,ticketCount:1,requestId}),{status:403});
}
for(const input of [{stakePerTicket:99,ticketCount:1},{stakePerTicket:1001,ticketCount:1},
 {stakePerTicket:100,ticketCount:21},{stakePerTicket:100.01,ticketCount:1}]){
 assert.throws(()=>validateRealTestRequest({actor:admin,...input,requestId}),{status:400});
}
const candidates=[
 {matchId:1,marketKey:'a',marketLine:'',outcomeKey:'1',group:'next-goal'},
 {matchId:1,marketKey:'a',marketLine:'',outcomeKey:'2',group:'next-goal'},
 {matchId:1,marketKey:'b',marketLine:'',outcomeKey:'yes',group:'goal-window'},
 {matchId:2,marketKey:'c',marketLine:'',outcomeKey:'1',group:'next-corner'},
];
const chosen=chooseRealTestCases(candidates,3,{random:()=>0.4});
assert.equal(chosen.length,3);
assert.equal(new Set(chosen.map(item=>item.group)).size,3);
assert.equal(new Set(chosen.map(item=>item.matchId+'|'+item.marketKey+'|'+item.marketLine)).size,3);
const now=Date.now();
const fixture={match_id:103,home:'Arsenal',away:'Chelsea',service:'LIVE',has_open_odds:true,
 listing_stale:false,home_score:1,away_score:0,match_time_ms:35*60000,
 clock_at:new Date(now-1000),score_at:new Date(now-1000),feed_status:'2H',stats:{}};
const marketRows={markets:[
 {key:'next-goal',name:'Next Goal',line:'',outcomes:[
  {key:'2',name:'2',price:2.15,suspended:false},{key:'1',name:'1',price:2.1,suspended:false}]},
 {key:'total',name:'Total Goals',line:'2.5',outcomes:[
  {key:'over',name:'Over',price:1.6,suspended:false}]},
 {key:'closed',name:'Next Corner',suspended:true,outcomes:[
  {key:'1',name:'1',price:1.8,suspended:false}]},
]};
const dbWrites=[],caseIds=[];
const runDb={connect:async()=>({async query(sql,params=[]){
 dbWrites.push({sql,params});
 if(['begin','commit','rollback'].includes(sql))return {};
 if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
 if(sql.startsWith('select id from app_real_market_test_run'))return {rows:[]};
 if(sql.startsWith('select role,status,balance,currency,deleted_at'))
  return {rows:[{role:'ADMIN',status:'ACTIVE',balance:10000,currency:'LEK'}]};
 if(sql.startsWith('insert into app_real_market_test_run'))return {rows:[{id:'run-1'}]};
 if(sql.startsWith('insert into app_real_market_test_case')){caseIds.push(params[0]);return {rowCount:1};}
 if(sql.startsWith('insert into app_admin_audit'))return {rowCount:1};
 throw Error('Unexpected query: '+sql);
},release(){}})};
const created=await createRealMarketTestRun({actor:admin,stakePerTicket:100,ticketCount:3,
 requestId,loadMatches:async()=>[fixture],serialize:async()=>[marketRows],
 database:runDb,runQuery:async()=>({rows:[]}),random:()=>0.5});
assert.equal(created.runId,'run-1');
assert.ok(created.queued>=1&&created.queued<=3);
assert.equal(caseIds.length,created.queued);
assert.equal(created.maxDebit,100*created.queued);
assert.equal(dbWrites.filter(x=>x.sql.startsWith('insert into app_admin_audit')).length,1);
assert.ok(dbWrites.every(x=>!/(?:insert into app_ticket\s|update app_user set balance|insert into app_transaction)/i.test(x.sql)),
 'Enqueue does not debit until normal placeBet validates each wager');
const duplicate=await createRealMarketTestRun({actor:admin,stakePerTicket:100,ticketCount:3,requestId,
 loadMatches:async()=>{throw Error('Duplicate request must not fetch feeds');},
 runQuery:async()=>({rows:[{id:'run-1'}]})});
assert.equal(duplicate.existing,true);
assert.equal(duplicate.runId,'run-1');

const claim={id:caseIds[0],run_id:'run-1',selection:{outcomeId:'103|next-goal||2',oddsAtPlacement:2.15}};
let claims=0;const placementCalls=[],writes=[];
const runQuery=async(sql,params=[])=>{
 writes.push({sql,params});
 if(sql.trimStart().startsWith('update app_real_market_test_case c'))return {rows:claims++===0?[claim]:[]};
 if(sql.startsWith('select actor_id,stake_per_ticket'))return {rows:[{actor_id:admin.id,stake_per_ticket:100}]};
 if(sql.startsWith('select id,username,role,status'))return {rows:[admin]};
 if(sql.startsWith('update app_real_market_test_case set placement_status'))return {rowCount:1};
 throw Error('Unexpected queue statement: '+sql);
};
const queue=await processRealMarketTestQueue({limit:3,runQuery,place:async args=>{
 placementCalls.push(args);return{id:'real-ticket-1'};
}});
assert.equal(queue.placed,1);
assert.equal(placementCalls.length,1);
assert.equal(placementCalls[0].user.id,admin.id);
assert.equal(placementCalls[0].stake,100);
assert.equal(placementCalls[0].clientRequestId,claim.id,
 'The same case id is used as the wallet transaction idempotency key');
assert.ok(writes.some(x=>x.sql.includes("placement_status='PLACED'")));
assert.equal(isDefinitiveRejection({status:400}),true);
assert.equal(isDefinitiveRejection({status:503}),false);
const got={contract:{kind:'sequence',event:'goal',target:2,side:'away'},
 live_contract:null,result_match_id:103,home_score:1,away_score:1,result_source:'FEED',
 frame:{ended:true,clock:93,coverage:{goalThrough:93},events:[
 {type:'goal',team:'home',minute:12},{type:'goal',team:'away',minute:40}]},
 frame_at:new Date(now).toISOString(),ticket_placed_at:new Date(now-60000).toISOString(),
 recovery_open:false,line_status:'WON',ticket_status:'WON'};
assert.deepEqual(evaluateRealMarketTestCase(got),{audit:'PASS',expected:'WON',
 reason:'REAL_PAYOUT_AND_INDEPENDENT_RESULT_AGREE'});
assert.equal(evaluateRealMarketTestCase({...got,line_status:'LOST',ticket_status:'LOST'}).audit,'MISMATCH');
assert.equal(evaluateRealMarketTestCase({...got,line_status:'PENDING',ticket_status:'PENDING'}).audit,'UNSETTLED');
assert.equal(evaluateRealMarketTestCase({...got,recovery_open:true}).audit,'NO_EVIDENCE');
assert.equal(evaluateRealMarketTestCase({...got,frame:null}).audit,'NO_EVIDENCE');
console.log('PASS real market lab: admin wallet only, durable idempotency, real quote path, independent settlement audit');
