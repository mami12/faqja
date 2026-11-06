import {query} from '../db.mjs';
import {gradeLiveContract} from './live-contract-rules.mjs';

export const STITCH_SETTLEMENT_AUDIT_SQL=`
create table if not exists app_stitch_settlement_audit (
 id bigserial primary key,
 line_id uuid not null references app_ticket_line(id) on delete restrict,
 actual_status text not null,
 revision text not null,
 expected_status text,
 verdict text not null check(verdict in ('MATCH','MISMATCH','MISSING_EVIDENCE')),
 evidence jsonb not null,
 checked_at timestamptz not null default now(),
 unique(line_id,actual_status,revision)
);
create index if not exists app_stitch_settlement_audit_recent_idx on app_stitch_settlement_audit(checked_at desc,id desc);
`;

const countKinds=new Set(['over','under','atLeast','exact','range']);

function replay(row){
 const contract=row.live_contract;
 const observedAt=row.observed_at==null?NaN:new Date(row.observed_at).getTime();
 const placedAt=row.placed_at==null?NaN:new Date(row.placed_at).getTime();
 if(row.open_gap)return {expected:null,reason:'RECOVERY_OPEN'};
 // Archived final scores can independently check whole-match goal totals.
 if(row.result_id!=null&&contract.event==='goal'&&countKinds.has(contract.kind)
    &&Number.isInteger(row.home_score)&&Number.isInteger(row.away_score)){
  const counts={goal:row.home_score+row.away_score};
  return {expected:gradeLiveContract(contract,{counts},{ended:true}),source:'confirmed-final-score',counts};
 }
 const frame=row.payload;
 if(frame?.ended!==true||!(observedAt>=placedAt))return {expected:null,reason:'FINAL_TIMELINE_MISSING'};
 return {expected:gradeLiveContract(contract,frame,{ended:true}),source:frame.source,clock:frame.clock,
  counts:frame.counts,coverage:frame.coverage,events:(frame.events??[]).filter(event=>event.type===contract.event)};
}

/** Audits recorded decisions in a separate table. Never grades a ticket or moves funds. */
export async function auditSettledLiveSelections({runQuery=query,limit=250}={}){
 const {rows}=await runQuery(`select l.id as line_id,l.status as actual_status,l.live_contract,t.placed_at,
   r.match_id as result_id,r.home_score,r.away_score,f.payload,f.observed_at,gap.open_gap,k.revision
  from app_ticket_line l join app_ticket t on t.id=l.ticket_id
  left join app_match_result r on r.match_id=l.match_id
  left join lateral (select id,payload,observed_at from app_live_event_frame where match_id=l.match_id
   order by observed_at desc,id desc limit 1) f on true
  cross join lateral (select exists(select 1 from app_live_event_recovery q
   where q.match_id=l.match_id and q.status='AWAITING_BACKUP_API' and l.id=any(q.line_ids)) as open_gap) gap
  cross join lateral (select concat_ws('|',coalesce(f.id::text,'-'),coalesce(r.home_score::text,'-'),
   coalesce(r.away_score::text,'-'),gap.open_gap::text) as revision) k
  where l.status in ('WON','LOST','VOID') and l.live_contract is not null
   and not exists(select 1 from app_stitch_settlement_audit a
    where a.line_id=l.id and a.actual_status=l.status and a.revision=k.revision)
  order by t.placed_at desc,l.id limit $1`,[limit]);
 const totals={matched:0,mismatched:0,missing:0};
 for(const row of rows){
  const {expected,...evidence}=replay(row);
  const verdict=expected==null?'MISSING_EVIDENCE':expected===row.actual_status?'MATCH':'MISMATCH';
  const saved=await runQuery(`insert into app_stitch_settlement_audit(line_id,actual_status,revision,expected_status,verdict,evidence)
    values($1,$2,$3,$4,$5,$6::jsonb) on conflict(line_id,actual_status,revision) do nothing`,
   [row.line_id,row.actual_status,row.revision,expected,verdict,JSON.stringify({contract:row.live_contract,...evidence})]);
  if(saved.rowCount)totals[verdict==='MATCH'?'matched':verdict==='MISMATCH'?'mismatched':'missing']++;
 }
 return totals;
}

export const STITCH_SETTLEMENT_AUDIT_ADMIN_SQL=`
select a.id,a.line_id,a.actual_status,a.expected_status,a.verdict,a.evidence,a.checked_at,
       l.ticket_id,l.match_name,l.market_name,l.outcome_name
from app_stitch_settlement_audit a join app_ticket_line l on l.id=a.line_id
order by a.checked_at desc,a.id desc limit $1`;
