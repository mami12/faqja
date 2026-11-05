import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {normalizeLiveFrame,recordWatchedLiveFrame,RECOVERY_TICKETS_SQL} from '../server/ledger/live-observation-store.mjs';
import {frozenLiveContract} from '../server/ledger/live-contract-context.mjs';
import {createLiveSettlementPreviews} from '../server/ledger/live-shadow-settlement.mjs';

const now=Date.parse('2026-11-05T21:00:00Z');
const game={Match:{Score:'1:1',MatchTimeExtended:'36:05',CornersTeam1:1,CornersTeam2:0,
 EventStatus:6,YellowCardsTeam1:0,YellowCardsTeam2:0,RedCardsTeam1:0,RedCardsTeam2:0},
 TimeLines:[{id:'g1',type:'score_change',team:1,gt:8},{id:'g2',type:'score_change',team:2,gt:34},
 {id:'c1',type:'corner_kick',team:1,gt:31}]};
const frame=normalizeLiveFrame(game);
assert.equal(frame.counts.goal,2);
assert.equal(frame.counts.corner,1);
assert.equal(frame.coverage.goalThrough,36+5/60);
assert.equal(frame.coverage.cornerThrough,36+5/60);
assert.equal(frame.ended,false);
assert.equal(frame.events.length,3);
const match={service:'LIVE',home_score:1,away_score:0,score_at:new Date(now),clock_at:new Date(now),
 match_time_ms:35*60000,stats:{home:{corners:2},away:{corners:0}},
 raw:{homeTeam:{id:'home'},awayTeam:{id:'away'}}};
assert.equal(frozenLiveContract({market_name:'Next Goal',outcome_name:'2'},match,now).target,2);
assert.equal(frozenLiveContract({market_name:'Corner in minutes 20-45',outcome_name:'Yes'},match,now).to,45);
assert.equal(frozenLiveContract({market_name:'Total Goals',outcome_name:'Over',line:'2.5'},match,now).threshold,2.5);
assert.throws(()=>frozenLiveContract({market_name:'Next Goal',outcome_name:'2'},
 {...match,clock_at:new Date(now-120000)},now),/freskëta/);
assert.throws(()=>frozenLiveContract({market_name:'Next Corner',outcome_name:'1'},
 {...match,stats:null},now),/konfirmuar|freskëta|verifikueshëm/);
const uuidA='00000000-0000-4000-8000-000000000001';
const uuidB='00000000-0000-4000-8000-000000000002';
const watch=[
 {id:uuidA,live_contract:{event:'goal'},placed_at:new Date(now-180000)},
 {id:uuidB,live_contract:{event:'corner'},placed_at:new Date(now-180000)}
];
const calls=[];
const database={connect:async()=>({async query(sql,params=[]){
 calls.push({sql,params});
 if(sql.startsWith('select l.id,l.live_contract'))return {rows:watch};
 if(sql.startsWith('select last_seen_at'))return {rows:[{last_seen_at:new Date(now-120000)}]};
 if(sql.startsWith('insert into app_live_event_recovery'))return {rowCount:1};
 if(sql.startsWith('insert into app_live_event_frame'))return {rowCount:1};
 if(sql.startsWith('insert into app_live_event_cursor'))return {rowCount:1};
 if(sql==='begin'||sql==='commit'||sql==='rollback')return {rowCount:0};
 throw new Error('Unexpected statement: '+sql);
 },release(){}})};
const stored=await recordWatchedLiveFrame(123,game,{database,now:()=>now});
assert.deepEqual(stored,{stored:true,recovery:true,watching:2});
assert.equal(calls.filter(x=>x.sql.startsWith('insert into app_live_event_recovery')).length,1);
const targeted=calls.find(x=>x.sql.startsWith('insert into app_live_event_recovery'));
assert.equal(targeted.params[0],123);
assert.deepEqual(targeted.params[3],[uuidA,uuidB]);
assert.deepEqual(targeted.params[4],['goal','corner']);
assert.match(RECOVERY_TICKETS_SQL,/l.id=any\(q.line_ids\)/);
const emptyDatabase={connect:async()=>({async query(sql){
 if(sql.startsWith('select l.id,l.live_contract'))return {rows:[]};
 if(sql==='begin'||sql==='commit')return {rowCount:0};
 throw new Error('Unexpected call for a match without a bet: '+sql);
},release(){}})};
assert.equal((await recordWatchedLiveFrame(555,game,{database:emptyDatabase,now:()=>now})).reason,
 'NO_RELEVANT_TICKETS','No ticket must generate zero history and backup jobs');
let shadowWrites=0;const next={version:1,kind:'sequence',event:'goal',target:2,side:'away'};
const got=await createLiveSettlementPreviews({now:()=>now,runQuery:async(sql,params)=>{
 if(sql.includes('select l.id as line_id'))return {rows:[
  {line_id:uuidA,ticket_id:'t1',match_id:123,live_contract:next,provider_frame:frame,frame_at:new Date(now),open_recovery_gaps:0},
  {line_id:uuidB,ticket_id:'t2',match_id:123,live_contract:next,provider_frame:frame,frame_at:new Date(now),open_recovery_gaps:1}
 ]};
 assert.match(sql,/app_live_settlement_preview/);shadowWrites++;
 assert.equal(params[2],'WON');
 return {rowCount:1};
}});
assert.deepEqual({proposed:got.proposed,held:got.held,mode:got.mode},{proposed:1,held:1,mode:'SHADOW_ONLY'});
assert.equal(shadowWrites,1,'An unresolved backup gap must never create a winning preview');
console.log('PASS targeted per-ticket recovery, frozen next goal, verified frames and shadow-only settlement');
