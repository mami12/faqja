import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {LEDGER_SQL} from '../server/ledger/schema.mjs';
import {normalizeLiveFrame} from '../server/ledger/live-observation-store.mjs';
import {gradeStoredEventContract} from '../server/ledger/match-event-facts.mjs';

const frame=(corners,events)=>normalizeLiveFrame({
 Match:{Score:'0:0',MatchTimeExtended:'35:00',CornersTeam1:corners,
  CornersTeam2:0,YellowCardsTeam1:0,YellowCardsTeam2:0,
  RedCardsTeam1:0,RedCardsTeam2:0,EventStatus:6},
 TimeLines:events
});
const awarded={id:'awarded',type:'corner_kick',team:1,gt:12,clk:'12:05',status:'awarded'};
const notTaken={id:'never-taken',type:'corner_kick',team:1,gt:13,clk:'13:05',isTaken:false};
const taken={id:'taken',type:'corner_kick',team:1,gt:14,clk:'14:05',isTaken:true};
const valid=frame(1,[awarded,notTaken,taken]);
assert.equal(valid.events.filter(e=>e.type==='corner').length,1,
 'An awarded or explicitly unexecuted corner does not count');
assert.equal(valid.coverage.cornerThrough,35,'Only the taken corner reconciles with provider tally');
const conflicting=frame(3,[awarded,notTaken,taken]);
assert.equal(conflicting.coverage.cornerThrough,undefined,
 'Conflicting corner count is not proof of a correct timeline');

const db=new PGlite();
try{
 await db.exec(LEDGER_SQL);
 const run=(sql,params=[])=>db.query(sql,params);
 const matchId=7199981,now=new Date();
 for(const [id,team,minute,seconds] of [
  ['kick-1','home',10,605],['kick-2','away',15,905],
  ['kick-3','home',23,1405]
 ]){
  await run(`insert into app_match_event_fact
    (match_id,provider,provider_event_id,kind,team,minute,seconds,active)
    values($1,'zizobet',$2,'corner',$3,$4,$5,true)`,
   [matchId,id,team,minute,seconds]);
 }
 await run(`insert into app_match_event_coverage
  (match_id,provider,kind,through_minute,count_home,count_away,complete,observed_at,confirmed_at)
  values($1,'zizobet','corner',91,2,1,true,$2,$2)`,
  [matchId,now]);
 await run('insert into app_live_event_cursor(match_id,last_seen_at) values($1,$2)',
  [matchId,now]);
 const result={home_score:0,away_score:0};
 const contract=(kind,rest)=>({
  id:'00000000-0000-4000-8000-000000000001',
  match_id:matchId,live_contract:{version:1,kind,event:'corner',...rest}
 });
 const judge=(kind,rest,final=result)=>gradeStoredEventContract(
  contract(kind,rest),final,{execute:run});
 assert.equal(await judge('race',{target:2,side:'home'}),'WON');
 assert.equal(await judge('race',{target:2,side:'away'}),'LOST');
 assert.equal(await judge('race',{target:4,side:'home'}),'VOID',
  'Unreached two-choice Race to X refunds at verified normal conclusion');
 assert.equal(await judge('window',{from:20,to:30,choice:true}),'WON');
 assert.equal(await judge('window',{from:20,to:30,choice:false}),'LOST');
 assert.equal(await judge('interval-leader',{from:20,to:30,side:'home'}),'WON');
 assert.equal(await judge('interval-leader',{from:20,to:30,side:'away'}),'LOST');
 assert.equal(await judge('window-total',{from:20,to:30,choice:'over',threshold:1}),'VOID');
 assert.equal(await judge('window-total',{from:20,to:30,choice:'exact',target:1}),'WON');
 assert.equal(await judge('window-total',{from:20,to:30,choice:'atLeast',target:2}),'LOST');

 await run('update app_match_event_coverage set count_home=3 where match_id=$1 and kind=\'corner\'',[matchId]);
 assert.equal(await judge('race',{target:2,side:'home'}),null,
  'No financial decision when accepted incident facts disagree with source tally');
 console.log('PASS real PostgreSQL engine: taken-corner evidence, primary event races/windows/interval totals, unreached race VOID and mismatched-counter PENDING');
}finally{await db.close();}
