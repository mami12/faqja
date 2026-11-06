import {query,pool} from '../db.mjs';
import {getMatches} from '../matches.mjs';
import {withOdds} from '../collector.mjs';
import {frozenLiveContract} from './live-contract-context.mjs';
import {gradeLiveContract,gradeFromAcceptedCounters} from './live-contract-rules.mjs';

/** Virtual wagers, completely separate from app_ticket, wallet and payouts. */
export const LIVE_MARKET_LAB_SQL=String.raw`
create table if not exists app_live_market_test_run (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references app_user(id) on delete set null,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 requested_matches int not null,
 selected_matches int not null default 0,
 coverage jsonb not null default '{}'::jsonb
);
create table if not exists app_live_market_test_case (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references app_live_market_test_run(id) on delete cascade,
 match_id bigint not null,
 match_name text not null,
 market_key text not null,
 market_name text not null,
 market_line text not null default '',
 outcome_key text not null,
 outcome_name text not null,
 odds numeric(14,4),
 contract jsonb not null,
 opened_at timestamptz not null default now(),
 status text not null default 'PENDING'
   check(status in ('PENDING','OBSERVED','PASS','FAIL','INCONCLUSIVE')),
 engine_status text,
 stitch_status text,
 evidence jsonb not null default '{}'::jsonb,
 last_checked_at timestamptz,
 finalized_at timestamptz,
 unique(run_id,match_id,market_key,market_line,outcome_key)
);
create index if not exists app_live_market_test_pending_idx on app_live_market_test_case(match_id,status)
 where status in ('PENDING','OBSERVED');
create index if not exists app_live_market_test_runs_idx on app_live_market_test_case(run_id);
`;

const MARKET_GROUPS=Object.freeze(['next-goal','numbered-goal','next-corner','race-goals','race-corners',
 'goal-window','corner-window','card-window','foul-window','over-under','exact','range']);
export {MARKET_GROUPS};
const asInt=(v,min,max,defaultValue)=>Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):defaultValue;
const testGroup=(c,marketName='')=>c.kind==='sequence'?(c.event==='goal'?(/^next\s+goal\b/i.test(marketName)?'next-goal':'numbered-goal'):'next-corner'):
 c.kind==='race'?(c.event==='goal'?'race-goals':'race-corners'):
 c.kind==='window'?c.event+'-window':
 c.kind==='exact'?'exact':c.kind==='range'?'range':
 ['over','under','atLeast'].includes(c.kind)?'over-under':null;
const nameOf=row=>String(row.home??'Home')+' – '+String(row.away??'Away');
const safeString=v=>String(v??'').slice(0,300);
/** Deterministic market sampling from actual server offers, not invented prices.
 * One live match may contribute to several market families. Suspended/closed
 * quotes are never used, and missing market families are reported as gaps.
 */
export function selectLiveMarketCases(matches,{limit=36,perGroup=4}={}){
 const counts=Object.fromEntries(MARKET_GROUPS.map(k=>[k,0]));
 const candidates=[],seen=new Set();
 for(const {row,serialized} of matches){
  const markets=serialized?.markets??[];
  for(const market of markets){
   if(market.suspended||!market.name||!market.key)continue;
   for(const outcome of market.outcomes??[]){
    if(outcome.suspended||outcome.price==null||!(Number(outcome.price)>1))continue;
    const original={market_key:market.key,market_name:market.name,
      line:market.line??'',outcome_key:outcome.key,outcome_name:outcome.name};
    let contract;
    try{contract=frozenLiveContract(original,row);}catch{continue;}
    if(!contract)continue;
    const group=testGroup(contract,market.name);
    if(!group||!Object.hasOwn(counts,group)||counts[group]>=perGroup||candidates.length>=limit)continue;
    // First/Next goals are only grouped as next when the server actually
    // offers them; no fabricated odds or selections.
    const key=[row.match_id,market.key,market.line??'',outcome.key].join('|');
    if(seen.has(key))continue;seen.add(key);
    candidates.push({matchId:Number(row.match_id),matchName:nameOf(row),
      marketKey:safeString(market.key),marketName:safeString(market.name),
      marketLine:safeString(market.line??''),outcomeKey:safeString(outcome.key),
      outcomeName:safeString(outcome.name),odds:Number(outcome.price),contract,group});
    counts[group]++;
   }
  }
 }
 return {items:candidates,coverage:Object.fromEntries(MARKET_GROUPS.map(group=>[
  group,{created:counts[group],available:counts[group]>0,
   targets:[...new Set(candidates.filter(item=>item.group===group)
    .map(item=>item.contract?.target).filter(value=>Number.isSafeInteger(value)&&value>0))].sort((a,b)=>a-b)}
 ]))};
}
const shuffle=(xs,random=Math.random)=>[...xs].map(item=>({item,key:random()}))
 .sort((a,b)=>a.key-b.key).map(x=>x.item);

export async function createMarketLabRun({actorId,matchCount=8,random=Math.random,
 loadMatches=getMatches,serialize=withOdds,database=pool}={}){
 const count=asInt(matchCount,1,12,8);
 if(!actorId)throw Object.assign(new Error('Administratori mungon.'),{status:403});
 const all=await loadMatches({service:'LIVE',catalog:true});
 const selected=shuffle(all.filter(m=>m.service==='LIVE'&&
   m.has_open_odds!==false&&!/finish|ended|cancel/i.test(String(m.feed_status??''))),random).slice(0,count);
 const listed=selected.length?await serialize(selected,Date.now(),{board:false}):[];
 const {items,coverage}=selectLiveMarketCases(selected.map((row,i)=>({row,serialized:listed[i]})));
 const client=await database.connect();
 try{
  await client.query('begin');
  // Serializing run creation avoids unintentionally starting many overlapping
  // tests by repeated taps, and adds no external-provider polling.
  await client.query('select pg_advisory_xact_lock($1)',[974411]);
  const existing=(await client.query(
   `select r.id from app_live_market_test_run r
     where r.started_at>now()-interval '30 seconds' order by r.started_at desc limit 1`
  )).rows[0];
  if(existing){await client.query('commit');return {runId:existing.id,created:0,alreadyRunning:true,coverage};}
  const {rows}=await client.query(
   'insert into app_live_market_test_run(actor_id,requested_matches,selected_matches,coverage) '+
   'values($1,$2,$3,$4::jsonb) returning id',[actorId,count,selected.length,JSON.stringify(coverage)]);
  const runId=rows[0].id;
  for(const item of items){
   await client.query(
    'insert into app_live_market_test_case(run_id,match_id,match_name,market_key,market_name,market_line, '+
    'outcome_key,outcome_name,odds,contract) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',
    [runId,item.matchId,item.matchName,item.marketKey,item.marketName,item.marketLine,
      item.outcomeKey,item.outcomeName,item.odds,JSON.stringify(item.contract)]);
  }
  // A run with no supported provider selections is a visible coverage report,
  // never fake tickets that look like genuine markets.
  if(!items.length)await client.query('update app_live_market_test_run set finished_at=now() where id=$1',[runId]);
  await client.query('commit');
  return {runId,created:items.length,selectedMatches:selected.length,coverage};
 }catch(error){await client.query('rollback').catch(()=>{});throw error;}
 finally{client.release();}
}

/** Independent second check from retained event sequence or verified final
 * scoreboard. No call to the grading function used by the main engine.
 * Incomplete timeline yields INCONCLUSIVE, never a guessed winning result.
 */
export function independentLabVerdict(contract,frame,finalResult){
 if(!contract)return null;
 const kind=contract.kind,event=contract.event;
 if(['over','under','atLeast','exact','range'].includes(kind)){
  const total=event==='goal'&&finalResult&&Number.isInteger(finalResult.home_score)&&
   Number.isInteger(finalResult.away_score)&&finalResult.source!=='ADMIN'
   ?finalResult.home_score+finalResult.away_score:
   frame?.ended===true?frame?.counts?.[event]:null;
  if(!Number.isInteger(total)||total<0)return null;
  if(kind==='over')return total>contract.threshold?'WON':
    Number.isInteger(contract.threshold)&&total===contract.threshold?'VOID':'LOST';
  if(kind==='under')return total<contract.threshold?'WON':
    Number.isInteger(contract.threshold)&&total===contract.threshold?'VOID':'LOST';
  if(kind==='atLeast')return total>=contract.target?'WON':'LOST';
  if(kind==='exact')return total===contract.target?'WON':'LOST';
  return total>=contract.min&&total<=contract.max?'WON':'LOST';
 }
 if(!frame?.ended||!Array.isArray(frame.events)||!Number.isFinite(frame.clock))return null;
 if(!Number.isFinite(frame.coverage?.[event+'Through'])||
    frame.coverage[event+'Through']<Math.min(90,frame.clock))return null;
 const events=frame.events.filter(e=>e.type===event&&!e.cancelled);
 if(events.some(e=>!Number.isFinite(e.minute)))return null;
 if(kind==='window'){
  if(frame.clock<=contract.to)return null;
  const relevant=events.filter(e=>e.minute>=contract.from&&e.minute<=contract.to&&
   (!contract.side||e.team===contract.side));
  if(contract.startExclusive&&events.some(e=>e.minute===Math.floor(contract.from)||
   e.minute===Math.floor(contract.to)))return null;
  return relevant.length?(contract.choice?'WON':'LOST'):(contract.choice?'LOST':'WON');
 }
 const ordered=[...events].sort((a,b)=>a.minute-b.minute||(a.seconds??0)-(b.seconds??0));
 if(ordered.some((e,i)=>i&&e.minute===ordered[i-1].minute&&
  (!Number.isFinite(e.seconds)||!Number.isFinite(ordered[i-1].seconds)||e.seconds===ordered[i-1].seconds)))return null;
 if(kind==='sequence'){
  const decisive=ordered[contract.target-1];
  return decisive?decisive.team===contract.side?'WON':'LOST':
   contract.side==='none'?'WON':'LOST';
 }
 if(kind==='race'){
  const counts={home:0,away:0};
  for(const e of ordered){if(!['home','away'].includes(e.team))return null;
   if(++counts[e.team]===contract.target)return e.team===contract.side?'WON':'LOST';}
 }
 return null;
}
export function evaluateLabCase(row,{now=Date.now()}={}){
 const contract=typeof row.contract==='string'?JSON.parse(row.contract):row.contract;
 const frame=typeof row.frame==='string'?JSON.parse(row.frame):row.frame;
 const finalResult=row.result_match_id!=null?{
  home_score:Number(row.home_score),away_score:Number(row.away_score),source:row.result_source
 }:null;
 const frameAt=row.frame_at==null?NaN:new Date(row.frame_at).getTime();
 const startedAt=new Date(row.opened_at).getTime();
 const fresh=Number.isFinite(frameAt)&&frameAt>=startedAt&&frameAt<=now+5000;
 const gap=row.open_gap===true||Number(row.open_gap)>0;
 const ended=frame?.ended===true||!!finalResult;
 const engine=frame&&fresh&&!gap?gradeLiveContract(contract,frame,{ended:frame.ended===true})??
  gradeFromAcceptedCounters(contract,frame):null;
 const stitch=fresh&&!gap?independentLabVerdict(contract,frame,finalResult):
  (finalResult&&['over','under','atLeast','exact','range'].includes(contract.kind)?
   independentLabVerdict(contract,null,finalResult):null);
 if(gap)return {status:ended?'INCONCLUSIVE':'PENDING',engine:null,stitch:null,
  reason:'RECOVERY_REQUIRED'};
 if(engine&&stitch)return {status:engine===stitch?'PASS':'FAIL',engine,stitch,
  reason:engine===stitch?'INDEPENDENT_CHECK_AGREES':'ENGINE_STITCH_MISMATCH'};
 if(engine&&!ended)return {status:'OBSERVED',engine,stitch:null,reason:'AWAITING_FINAL_CROSSCHECK'};
 if(!ended)return {status:'PENDING',engine:null,stitch:null,reason:'MATCH_IN_PROGRESS'};
 return {status:'INCONCLUSIVE',engine:engine??null,stitch:stitch??null,
  reason:!fresh?'FRAME_MISSING_OR_STALE':'INCOMPLETE_PROVIDER_EVIDENCE'};
}
export const LIVE_MARKET_LAB_PENDING_SQL=String.raw`
select t.id,t.run_id,t.match_id,t.contract,t.opened_at,t.status,
 f.payload as frame,f.observed_at as frame_at,
 r.match_id as result_match_id,r.home_score,r.away_score,r.source as result_source,
 exists(select 1 from app_live_event_recovery q
   where q.match_id=t.match_id and q.status='AWAITING_BACKUP_API'
     and q.gap_to>=t.opened_at) as open_gap
from app_live_market_test_case t
left join lateral(select payload,observed_at from app_live_event_frame
 where match_id=t.match_id order by observed_at desc,id desc limit 1) f on true
left join app_match_result r on r.match_id=t.match_id
where t.status in ('PENDING','OBSERVED')
order by t.opened_at asc limit $1
`;
/** A server-side task independent of browser sessions. Tests can be evaluated
 * after restart and need no admin to remain logged in.
 */
export async function refreshMarketLab({runQuery=query,now=Date.now,limit=250}={}){
 const {rows}=await runQuery(LIVE_MARKET_LAB_PENDING_SQL,[Math.min(500,Math.max(1,Number(limit)||250))]);
 const totals={examined:rows.length,passed:0,failed:0,inconclusive:0,pending:0,observed:0};
 for(const row of rows){
  const decided=evaluateLabCase(row,{now:now()});
  if(!['PENDING','OBSERVED','PASS','FAIL','INCONCLUSIVE'].includes(decided.status))continue;
  await runQuery(`update app_live_market_test_case set status=$2,engine_status=$3,
     stitch_status=$4,evidence=$5::jsonb,last_checked_at=now(),
     finalized_at=case when $2 in ('PASS','FAIL','INCONCLUSIVE') then now() else null end
     where id=$1 and status in ('PENDING','OBSERVED')`,
   [row.id,decided.status,decided.engine,decided.stitch,
    JSON.stringify({reason:decided.reason,frameAt:row.frame_at,checkedAt:new Date(now()).toISOString()})]);
  const field={PASS:'passed',FAIL:'failed',INCONCLUSIVE:'inconclusive',PENDING:'pending',OBSERVED:'observed'}[decided.status];
  totals[field]++;
 }
 await runQuery(`update app_live_market_test_run r set finished_at=now()
   where finished_at is null
   and not exists(select 1 from app_live_market_test_case t where t.run_id=r.id
     and t.status in ('PENDING','OBSERVED'))`);
 return {...totals,mode:'VIRTUAL_ONLY_NO_WALLET'};
}
export async function listMarketLab({runQuery=query,limit=8}={}){
 const cap=asInt(limit,1,30,8);
 const {rows:runs}=await runQuery(`select r.id,r.started_at,r.finished_at,r.requested_matches,
    r.selected_matches,r.coverage,
    count(t.id)::int as cases,
    count(t.id) filter(where t.status='PASS')::int as passed,
    count(t.id) filter(where t.status='FAIL')::int as failed,
    count(t.id) filter(where t.status='INCONCLUSIVE')::int as inconclusive,
    count(t.id) filter(where t.status='PENDING')::int as pending,
    count(t.id) filter(where t.status='OBSERVED')::int as observed
   from app_live_market_test_run r left join app_live_market_test_case t on t.run_id=r.id
   group by r.id order by r.started_at desc limit $1`,[cap]);
 if(!runs.length)return {mode:'VIRTUAL_ONLY_NO_WALLET',runs:[],cases:[]};
 const {rows:cases}=await runQuery(`select id,run_id,match_id,match_name,market_name,
   market_line,outcome_name,odds,contract,status,engine_status,stitch_status,
   evidence,opened_at,last_checked_at,finalized_at from app_live_market_test_case
   where run_id=any($1::uuid[]) order by opened_at desc,match_id limit 400`,[runs.map(r=>r.id)]);
 return {mode:'VIRTUAL_ONLY_NO_WALLET',runs,cases};
}
