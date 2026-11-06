import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {MARKET_GROUPS,selectLiveMarketCases,independentLabVerdict,
 evaluateLabCase,createMarketLabRun,refreshMarketLab} from '../server/ledger/live-market-lab.mjs';

assert.ok(MARKET_GROUPS.includes('next-goal'));
assert.ok(MARKET_GROUPS.includes('corner-window'));
const now=Date.now(),at=new Date(now).toISOString(),clock=35*60000;
const fixture={match_id:123,home:'Arsenal',away:'Chelsea',service:'LIVE',has_open_odds:true,
 home_score:1,away_score:0,match_time_ms:clock,clock_at:new Date(now-1000),
 score_at:new Date(now-1000),feed_status:'2H',stats:{}};
const matches=[{row:fixture,serialized:{markets:[
 {key:'next-goal',name:'Next Goal',line:'',outcomes:[
  {key:'2',name:'2',price:2.15,suspended:false},{key:'1',name:'1',price:2.1,suspended:false}]},
 {key:'total-goals',name:'Total Goals',line:'2.5',outcomes:[
  {key:'o',name:'Over',price:1.4,suspended:false},{key:'u',name:'Under',price:2.5,suspended:false}]},
 {key:'goal-window',name:'Goal in minutes 36-45',line:'',outcomes:[
  {key:'yes',name:'Yes',price:1.65,suspended:false},{key:'no',name:'No',price:2.25,suspended:false}]},
 {key:'suspended',name:'Next Goal',line:'',suspended:true,outcomes:[{key:'1',name:'1',price:50}]},
 {key:'missing',name:'Next Goal',line:'',outcomes:[{key:'1',name:'1',price:null}]}
]}}];
const selected=selectLiveMarketCases(matches,{limit:20,perGroup:4});
assert.ok(selected.items.length>=4,'Should select real offered Next Goal, goal totals and intervals');
assert.ok(selected.items.some(x=>x.contract.kind==='sequence'));
assert.ok(selected.items.some(x=>x.contract.kind==='window'));
assert.ok(selected.items.every(x=>x.marketKey!=='suspended'&&x.marketKey!=='missing'));
assert.equal(selected.coverage['race-corners'].created,0,'Unlisted races are not invented');
assert.equal(selected.coverage['next-goal'].available,true);
const engineFrame={ended:true,source:'zizobet',clock:91,counts:{goal:2},
 teams:{goal:{home:1,away:1}},coverage:{goalThrough:91},
 events:[{type:'goal',team:'home',minute:12},{type:'goal',team:'away',minute:40}]};
const contract={version:1,kind:'sequence',event:'goal',target:2,side:'away',baseline:{home:1,away:0}};
assert.equal(independentLabVerdict(contract,engineFrame,null),'WON');
const row={contract,frame:engineFrame,frame_at:at,opened_at:new Date(now-5000).toISOString(),
 result_match_id:null,open_gap:false};
assert.deepEqual(evaluateLabCase(row,{now}),{
 status:'PASS',engine:'WON',stitch:'WON',reason:'INDEPENDENT_CHECK_AGREES'
});
assert.equal(evaluateLabCase({...row,open_gap:true},{now}).status,'INCONCLUSIVE');
assert.equal(evaluateLabCase({...row,frame:null,result_match_id:123,home_score:1,away_score:1,result_source:'FEED'},{now}).status,'INCONCLUSIVE');
const goalOver={version:1,kind:'over',event:'goal',threshold:2.5};
const different={...row,contract:goalOver,frame:{...engineFrame,counts:{goal:3}},
 result_match_id:123,home_score:1,away_score:0,result_source:'FEED'};
assert.equal(evaluateLabCase(different,{now}).status,'FAIL','An independent final score contradicts live grade');
const fixed={version:1,kind:'window',event:'goal',from:20,to:45,choice:true};
assert.equal(independentLabVerdict(fixed,{...engineFrame,events:[{type:'goal',team:'away',minute:30}]},null),'WON');
assert.equal(independentLabVerdict({...fixed,choice:false},{...engineFrame,events:[{type:'goal',team:'away',minute:30}]},null),'LOST');
assert.equal(independentLabVerdict({...fixed,choice:false},{...engineFrame,events:[]},null),'WON');
assert.equal(independentLabVerdict({...fixed,choice:false},{...engineFrame,coverage:{}},null),null);
const writes=[];
const database={connect:async()=>({async query(sql,params=[]){
 writes.push({sql,params});
 if(sql==='begin'||sql==='commit'||sql==='rollback')return {};
 if(sql.startsWith('select pg_advisory_xact_lock'))return {rows:[]};
 if(sql.includes('from app_live_market_test_run r')&&sql.includes('30 seconds'))return {rows:[]};
 if(sql.startsWith('insert into app_live_market_test_run'))return {rows:[{id:'run-test'}]};
 if(sql.startsWith('insert into app_live_market_test_case'))return {rowCount:1};
 if(sql.startsWith('update app_live_market_test_run'))return {rowCount:1};
 throw new Error('Unexpected SQL: '+sql);
},release(){}})};
const run=await createMarketLabRun({actorId:'admin-test',matchCount:2,
 loadMatches:async()=>[fixture],serialize:async()=>[matches[0].serialized],
 random:()=>0.5,database});
assert.equal(run.runId,'run-test');
assert.equal(run.created,selected.items.length);
assert.ok(writes.some(x=>x.sql.startsWith('insert into app_live_market_test_case')));
assert.ok(!writes.some(x=>/insert into app_ticket\b|update app_ticket\b|app_transaction|app_user set balance/.test(x.sql)),
 'Virtual lab must never mutate tickets or wallets');
const checks=[];
const summary=await refreshMarketLab({now:()=>now,runQuery:async(sql,params=[])=>{
 checks.push(sql);
 if(sql.includes('select t.id,t.run_id'))return {rows:[{...row,id:'test-case',run_id:'run-test',status:'PENDING'}]};
 if(sql.startsWith('update app_live_market_test_case'))return {rowCount:1};
 if(sql.startsWith('update app_live_market_test_run'))return {rowCount:1};
 throw new Error('Unexpected lab SQL '+sql);
}});
assert.equal(summary.passed,1);
assert.ok(checks.every(sql=>!sql.startsWith('update app_ticket')));
console.log('PASS market lab: real selections, proof grading, virtual isolation and offline monitor');
