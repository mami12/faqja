import {randomUUID} from 'node:crypto';
import {query,pool} from '../db.mjs';
import {getMatches} from '../matches.mjs';
import {withOdds} from '../collector.mjs';
import {placeBet} from './bets.mjs';
import {outcomeIdOf} from './view.mjs';
import {selectLiveMarketCases,independentLabVerdict} from './live-market-lab.mjs';

/** ADMIN-OWNED REAL MONEY. The only wallet debit is the production placeBet()
 * transaction, using the existing accepted quote, risk checks and idempotency.
 * No player account can be chosen by the caller.
 */
export const REAL_TEST_MIN_STAKE=100;
export const REAL_TEST_MAX_STAKE=1000;
export const REAL_TEST_MAX_TICKETS=20;
export const REAL_TEST_MAX_BUDGET=20000;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyOf=item=>[item.matchId,item.marketKey,item.marketLine].join('|');
const shuffle=(items,random=Math.random)=>[...items].map(item=>({item,weight:random()}))
 .sort((a,b)=>a.weight-b.weight).map(x=>x.item);

export function validateRealTestRequest({actor,stakePerTicket,ticketCount,requestId}){
 if(actor?.role!=='ADMIN'||actor?.status!=='ACTIVE')throw fail(403,'Vetëm administratori aktiv mund të vendosë baste reale.');
 if(!UUID.test(String(requestId??'')))throw fail(400,'Identifikuesi unik i veprimit mungon.');
 const stake=Number(stakePerTicket),count=Number(ticketCount);
 if(!Number.isSafeInteger(stake)||stake<REAL_TEST_MIN_STAKE||stake>REAL_TEST_MAX_STAKE)
  throw fail(400,'Shuma për çdo biletë duhet të jetë 100–1000 LEK.');
 if(!Number.isSafeInteger(count)||count<1||count>REAL_TEST_MAX_TICKETS)
  throw fail(400,'Zgjidh nga 1 deri në 20 bileta reale.');
 if(stake*count>REAL_TEST_MAX_BUDGET)throw fail(400,'Kufiri për një test real është 20 000 LEK.');
 return {stake,count,requestId:String(requestId).toLowerCase()};
}

/** A balanced random sample of accepted upstream offers. Never invent a
 * market, outcome, stake or price. One side per match/market to prevent tests
 * of mutually exclusive outcomes in the same fixture.
 */
export function chooseRealTestCases(items,ticketCount,{random=Math.random}={}){
 const groups=new Map();
 for(const item of shuffle(items,random)){
  if(!groups.has(item.group))groups.set(item.group,[]);
  groups.get(item.group).push(item);
 }
 const used=new Set(),selected=[];
 const names=shuffle([...groups.keys()],random);
 let any=true;
 while(selected.length<ticketCount&&any){
  any=false;
  for(const name of names){
   const list=groups.get(name);
   while(list?.length){
    const item=list.shift(),key=keyOf(item);
    if(used.has(key))continue;
    used.add(key);selected.push(item);any=true;break;
   }
   if(selected.length>=ticketCount)break;
  }
 }
 return selected;
}

export async function createRealMarketTestRun({
 actor,stakePerTicket,ticketCount,requestId,loadMatches=getMatches,
 serialize=withOdds,database=pool,runQuery=query,random=Math.random
}={}){
 const {stake,count}=validateRealTestRequest({actor,stakePerTicket,ticketCount,requestId});
 // Retry/read must return the original run, not a new set of live bets.
 const lookup=await runQuery('select id from app_real_market_test_run where actor_id=$1 and request_id=$2',
  [actor.id,requestId]);
 if(lookup.rows[0])return {runId:lookup.rows[0].id,existing:true,queued:0};
 const all=await loadMatches({service:'LIVE',catalog:true});
 const candidates=shuffle(all.filter(row=>row.service==='LIVE'&&row.has_open_odds!==false&&
  row.listing_stale!==true&&!/finish|ended|cancel/i.test(String(row.feed_status??''))),random).slice(0,20);
 const serial=candidates.length?await serialize(candidates,Date.now(),{board:false}):[];
 const grouped=selectLiveMarketCases(candidates.map((row,index)=>({row,serialized:serial[index]})),
  {limit:100,perGroup:6});
 const choices=chooseRealTestCases(grouped.items,count,{random});
 const coverage=Object.fromEntries(Object.entries(grouped.coverage).map(([name,value])=>[
  name,{available:value.available,selected:choices.filter(x=>x.group===name).length}
 ]));
 const client=await database.connect();
 try{
  await client.query('begin');
  // Two POSTs with the same key cannot create two debit queues.
  await client.query('select pg_advisory_xact_lock($1)',[974412]);
  const duplicate=await client.query('select id from app_real_market_test_run where actor_id=$1 and request_id=$2',
   [actor.id,requestId]);
  if(duplicate.rows[0]){await client.query('commit');return {runId:duplicate.rows[0].id,existing:true,queued:0};}
  const wallet=(await client.query(
   'select role,status,balance,currency,deleted_at from app_user where id=$1 for update',[actor.id])).rows[0];
  if(!wallet||wallet.role!=='ADMIN'||wallet.status!=='ACTIVE'||wallet.deleted_at)
   throw fail(403,'Llogaria e administratorit nuk është aktive.');
  if(String(wallet.currency??'LEK')!=='LEK')
   throw fail(400,'Testet reale kërkojnë portofol në LEK.');
  if(Number(wallet.balance)<stake*choices.length)
   throw fail(400,'Bilanci i administratorit nuk mbulon shumën maksimale të testeve. Nuk preken fondet e lojtarëve.');
  const run=(await client.query(
   'insert into app_real_market_test_run(actor_id,request_id,stake_per_ticket,requested_tickets,selected_matches,coverage) '+
   'values($1,$2,$3,$4,$5,$6::jsonb) returning id',
   [actor.id,requestId,stake,count,candidates.length,JSON.stringify(coverage)])).rows[0];
  for(const item of choices){
   const id=randomUUID();
   const selection={outcomeId:outcomeIdOf(String(item.matchId),item.marketKey,item.marketLine,item.outcomeKey),
     oddsAtPlacement:item.odds};
   await client.query(
    'insert into app_real_market_test_case '+
    '(id,run_id,match_id,match_name,market_key,market_name,market_line,outcome_key,outcome_name,quoted_odds,selection,contract) '+
    'values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)',
    [id,run.id,item.matchId,item.matchName,item.marketKey,item.marketName,item.marketLine,
     item.outcomeKey,item.outcomeName,item.odds,JSON.stringify(selection),JSON.stringify(item.contract)]);
  }
  await client.query(
   `insert into app_admin_audit(actor_id,actor_name,actor_role,action,target_type,target_id,details)
      values($1,$2,'ADMIN','REAL_MARKET_LAB_START','real_market_test_run',$3,$4::jsonb)`,
   [actor.id,actor.username,run.id,JSON.stringify({
    stakePerTicket:stake,requested:count,queued:choices.length,maxDebit:stake*choices.length,
    source:'UPSTREAM_LIVE',walletUserId:actor.id
   })]);
  await client.query('commit');
  return {runId:run.id,existing:false,queued:choices.length,maxDebit:stake*choices.length,
   currency:'LEK',coverage};
 }catch(error){await client.query('rollback').catch(()=>{});throw error;}
 finally{client.release();}
}

const CLAIM_REAL_CASE_SQL=`
update app_real_market_test_case c
 set placement_status='PLACING',claim_at=now()
 where c.id=(
   select id from app_real_market_test_case
   where placement_status='QUEUED'
      or (placement_status='PLACING' and claim_at<now()-interval '3 minutes')
   order by created_at,id
   for update skip locked limit 1
 )
 returning c.*
`;
export function isDefinitiveRejection(error){
 return Number.isInteger(error?.status)&&error.status>=400&&error.status<500;
}
export async function processRealMarketTestQueue({
 runQuery=query,place=placeBet,limit=8
}={}){
 const totals={placed:0,rejected:0,retry:0,examined:0};
 for(let i=0;i<Math.max(1,Math.min(20,Number(limit)||8));i++){
  const {rows}=await runQuery(CLAIM_REAL_CASE_SQL);
  const test=rows[0];
  if(!test)break;
  totals.examined++;
  const run=(await runQuery(
   'select actor_id,stake_per_ticket from app_real_market_test_run where id=$1',[test.run_id])).rows[0];
  if(!run)throw Error('Real test run not found: '+test.run_id);
  const actor=(await runQuery('select id,username,role,status from app_user where id=$1',[run.actor_id])).rows[0];
  try{
   if(!actor||actor.role!=='ADMIN'||actor.status!=='ACTIVE')throw fail(403,'Administratori nuk është më aktiv.');
   // Stable case UUID is the same client_request_id on every retry after a crash.
   // placeBet handles price revalidation and wallet debit atomically and exactly once.
   const selection=typeof test.selection==='string'?JSON.parse(test.selection):test.selection;
   const ticket=await place({user:actor,stake:Number(run.stake_per_ticket),
    selections:[selection],ticketType:'SINGLE',clientRequestId:test.id});
   if(!ticket?.id)throw Error('Real ticket response did not contain its id');
   await runQuery(`update app_real_market_test_case set placement_status='PLACED',
     ticket_id=$2,placed_at=coalesce(placed_at,now()),rejected_reason=null,rejected_code=null
     where id=$1 and placement_status='PLACING'`,[test.id,ticket.id]);
   totals.placed++;
  }catch(error){
   if(isDefinitiveRejection(error)){
    await runQuery(`update app_real_market_test_case set placement_status='REJECTED',
      rejected_reason=$2,rejected_code=$3 where id=$1 and placement_status='PLACING'`,
     [test.id,String(error.message??'Basti u refuzua.').slice(0,500),
      String(error.code??'BET_REJECTED').slice(0,60)]);
    totals.rejected++;
   }else{
    // A transient error might have happened after money was committed. Never
    // guess whether a bet exists, never send a different idempotency key.
    // Recover this same case after the claim lease expires.
    totals.retry++;
    console.error('[real market lab] retry required for case:',test.id,error?.message);
   }
  }
 }
 return totals;
}

export function evaluateRealMarketTestCase(row){
 const contract=typeof row.live_contract==='string'?JSON.parse(row.live_contract):
  row.live_contract??(typeof row.contract==='string'?JSON.parse(row.contract):row.contract);
 const frame=typeof row.frame==='string'?JSON.parse(row.frame):row.frame;
 const result=row.result_match_id!=null?{
  home_score:row.home_score==null?null:Number(row.home_score),
  away_score:row.away_score==null?null:Number(row.away_score),
  source:row.result_source
 }:null;
 const ended=!!result||frame?.ended===true;
 const frameAt=row.frame_at==null?NaN:new Date(row.frame_at).getTime();
 const placedAt=row.ticket_placed_at==null?NaN:new Date(row.ticket_placed_at).getTime();
 const recent=Number.isFinite(frameAt)&&Number.isFinite(placedAt)&&frameAt>=placedAt;
 const gap=!!row.recovery_open;
 // Even if a goal has been recorded, never claim an independently verified
 // settlement while the collector lost chronology that affected this ticket.
 const expected=!gap?independentLabVerdict(contract,recent?frame:null,result):null;
 if(!ended)return {audit:'IN_PROGRESS',expected:expected??null,reason:gap?'RECOVERY_REQUIRED':'MATCH_LIVE'};
 if(gap)return {audit:'NO_EVIDENCE',expected:null,reason:'RECOVERY_REQUIRED'};
 if(!expected)return {audit:'NO_EVIDENCE',expected:null,reason:'PROVIDER_EVIDENCE_INCOMPLETE'};
 const line=row.line_status,ticket=row.ticket_status;
 if(line==='PENDING'||ticket==='PENDING')return {audit:'UNSETTLED',expected,reason:'MATCH_FINISHED_STILL_PENDING'};
 if(line!==expected||ticket!==expected)return {audit:'MISMATCH',expected,reason:'ACTUAL_TICKET_DIFFERS_FROM_VERIFIED_RESULT'};
 return {audit:'PASS',expected,reason:'REAL_PAYOUT_AND_INDEPENDENT_RESULT_AGREE'};
}
const AUDIT_REAL_CASES_SQL=`
select c.id,c.contract,c.last_checked_at,l.live_contract,
 l.status as line_status,t.status as ticket_status,t.placed_at as ticket_placed_at,
 f.payload as frame,f.observed_at as frame_at,
 r.match_id as result_match_id,r.home_score,r.away_score,r.source as result_source,
 exists(select 1 from app_live_event_recovery q
   where q.match_id=c.match_id and q.status='AWAITING_BACKUP_API'
    and l.id=any(q.line_ids)) as recovery_open
from app_real_market_test_case c
join app_ticket t on t.id=c.ticket_id
join app_ticket_line l on l.ticket_id=t.id and l.match_id=c.match_id
left join lateral (
 select payload,observed_at from app_live_event_frame
 where match_id=c.match_id order by observed_at desc,id desc limit 1
) f on true
left join app_match_result r on r.match_id=c.match_id
where c.placement_status='PLACED' and
 (c.last_checked_at is null or c.last_checked_at<now()-interval '1 minute')
order by c.last_checked_at nulls first,c.created_at desc limit $1
`;
export async function auditRealMarketTests({runQuery=query,limit=200}={}){
 const {rows}=await runQuery(AUDIT_REAL_CASES_SQL,[Math.min(500,Math.max(1,Number(limit)||200))]);
 const summary={checked:0,pass:0,mismatch:0,unsettled:0,noEvidence:0,live:0};
 for(const row of rows){
  const result=evaluateRealMarketTestCase(row);
  await runQuery(`update app_real_market_test_case set audit_status=$2,expected_status=$3,
    audit_reason=$4,last_checked_at=now()
    where id=$1 and placement_status='PLACED'`,
   [row.id,result.audit,result.expected,result.reason]);
  summary.checked++;
  summary[{PASS:'pass',MISMATCH:'mismatch',UNSETTLED:'unsettled',
   NO_EVIDENCE:'noEvidence',IN_PROGRESS:'live'}[result.audit]]++;
 }
 return summary;
}

export async function listRealMarketTests({runQuery=query,actorId,limit=12}={}){
 if(!actorId)throw fail(403,'Admin ID required');
 const cap=Math.max(1,Math.min(30,Math.trunc(Number(limit)||12)));
 const {rows:runs}=await runQuery(`select r.id,r.created_at,r.stake_per_ticket,
 r.requested_tickets,r.selected_matches,r.coverage,
 count(c.id)::int as cases,
 count(c.id) filter(where c.placement_status='QUEUED' or c.placement_status='PLACING')::int as queued,
 count(c.id) filter(where c.placement_status='PLACED')::int as placed,
 count(c.id) filter(where c.placement_status='REJECTED')::int as rejected,
 count(c.id) filter(where c.audit_status='PASS')::int as passed,
 count(c.id) filter(where c.audit_status='MISMATCH')::int as mismatched,
 count(c.id) filter(where c.audit_status='UNSETTLED')::int as unsettled,
 count(c.id) filter(where c.audit_status='NO_EVIDENCE')::int as missing_evidence,
 coalesce(sum(t.stake),0)::numeric as debited,
 coalesce(sum(case when t.status in ('WON','VOID') then t.potential_payout else 0 end),0)::numeric as paid_back
 from app_real_market_test_run r left join app_real_market_test_case c on c.run_id=r.id
 left join app_ticket t on t.id=c.ticket_id
 where r.actor_id=$1
 group by r.id order by r.created_at desc limit $2`,[actorId,cap]);
 if(!runs.length)return {mode:'REAL_MONEY',runs:[],cases:[]};
 const {rows:cases}=await runQuery(`select c.id,c.run_id,c.match_id,c.match_name,c.market_name,c.market_line,
  c.outcome_name,c.quoted_odds,c.placement_status,c.ticket_id,c.rejected_reason,
  c.rejected_code,c.expected_status,c.audit_status,c.audit_reason,c.placed_at,
  c.last_checked_at,c.created_at,
  t.status as ticket_status,t.stake as actual_stake,t.total_odds as actual_odds,
  t.potential_payout as actual_payout,t.placed_at as ticket_placed_at,
  u.username as ticket_username,l.status as line_status,l.live_contract
 from app_real_market_test_case c
 left join app_ticket t on t.id=c.ticket_id
 left join app_user u on u.id=t.user_id
 left join app_ticket_line l on l.ticket_id=t.id and l.match_id=c.match_id
 where c.run_id=any($1::uuid[])
 order by c.created_at desc,c.match_id,c.id limit 500`,
  [runs.map(run=>run.id)]);
 return {mode:'REAL_MONEY',runs,cases};
}
