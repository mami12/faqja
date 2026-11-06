import {query} from '../db.mjs';
import {gradeLiveContract,gradeFromAcceptedCounters} from './live-contract-rules.mjs';

/** Real player-ticket settlement from the PRIMARY football provider ONLY.
 * Stitch's shadow mode is separate. No second information API can authorize
 * a goal/corner payout. Ambiguous feed => PENDING, never a made-up VOID.
 */
export const PRIMARY_EVENT_SETTLEMENT_SQL = `
select l.id as line_id,l.ticket_id,l.match_id,l.live_contract,
       t.placed_at as ticket_placed_at,
       f.payload as provider_frame,f.observed_at as frame_at,
       c.last_seen_at as cursor_at,
       exists (
         select 1 from app_live_event_recovery gap
         where gap.match_id=l.match_id
           and gap.status='AWAITING_BACKUP_API'
           and l.id=any(gap.line_ids) and gap.gap_to>t.placed_at
       ) as recovery_open
from app_ticket_line l
join app_ticket t on t.id=l.ticket_id
left join lateral (
  select payload,observed_at from app_live_event_frame
  where match_id=l.match_id order by observed_at desc,id desc limit 1
) f on true
left join app_live_event_cursor c on c.match_id=l.match_id
where l.status='PENDING' and t.status='PENDING'
  and l.live_contract is not null
  and l.live_contract->>'event' in ('goal','corner')
  and l.live_contract->>'kind' in
    ('sequence','race','window','over','under','exact','range','atLeast')
  and not exists(
    select 1 from app_settlement_override o where o.line_id=l.id
  )
order by t.placed_at,l.match_id,l.id
limit $1
`;

const millis=v=>{if(v==null)return null;const n=new Date(v).getTime();return Number.isFinite(n)?n:null;};
const decode=v=>{if(v==null)return null;if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return null;}};
const validStatus=v=>v==='WON'||v==='LOST'||v==='VOID';

/** Require an unchanged, post-bet primary snapshot re-checked by the primary
 * collector for at least 60s, to catch provisional goals and VAR corrections.
 * No secondary provider data and no missing ordered events are assumed.
 */
export function gradePrimaryLiveTicketLine(row,{
 now=Date.now(),stabilityMs=60000,freshnessMs=60000
}={}){
 const contract=decode(row?.live_contract),frame=decode(row?.provider_frame);
 if(!contract||!frame||frame.source!=='zizobet')return {status:null,reason:'NOT_PRIMARY_EVIDENCE'};
 if(row.recovery_open===true)return {status:null,reason:'OPEN_RECOVERY_GAP'};
 if(!['goal','corner'].includes(contract.event))return {status:null,reason:'NOT_GOAL_OR_CORNER'};
 if(!['sequence','race','window','over','under','exact','range','atLeast'].includes(contract.kind))
  return {status:null,reason:'UNSUPPORTED_CONTRACT'};
 const accepted=millis(row.ticket_placed_at),observed=millis(row.frame_at),lastSeen=millis(row.cursor_at);
 if(accepted===null||observed===null||lastSeen===null||observed<accepted)
  return {status:null,reason:'NO_POST_BET_EVIDENCE'};
 if(now-observed<stabilityMs||now-lastSeen>freshnessMs||lastSeen-observed<stabilityMs||
    observed>now+5000||lastSeen>now+5000)
  return {status:null,reason:'PROVISIONAL_OR_STALE_FRAME'};
 if(!frame.ended&&(!Number.isFinite(frame.clock)||frame.clock<0||frame.clock>130))
  return {status:null,reason:'MISSING_MATCH_CLOCK'};
 const timeline=gradeLiveContract(contract,frame,{ended:frame.ended===true});
 const delta=gradeFromAcceptedCounters(contract,frame);
 if(timeline&&delta&&timeline!==delta)
  return {status:null,reason:'TIMELINE_COUNTER_CONFLICT'};
 const status=timeline??delta;
 if(!validStatus(status))return {status:null,reason:'INSUFFICIENT_PRIMARY_EVIDENCE'};
 if(contract.kind==='sequence'&&contract.side==='none'&&status==='WON'&&frame.ended!==true)
  return {status:null,reason:'MATCH_NOT_FINISHED'};
 return {status,reason:'VERIFIED_PRIMARY_GOAL_CORNER',source:'zizobet'};
}

/** Caller injects the existing locked app_ticket_line update + recalcTicket
 * wallet transaction. This module NEVER creates virtual outcomes or debits a
 * player itself. Resolved legs in combination tickets leave others PENDING.
 */
export async function settlePrimaryLiveTicketLines({
 runQuery=query,update,recalc,now=Date.now,limit=300,stabilityMs=60000
}={}){
 if(typeof update!=='function'||typeof recalc!=='function')throw Error('Protected ticket settlement callbacks required');
 const {rows}=await runQuery(PRIMARY_EVENT_SETTLEMENT_SQL,
  [Math.max(1,Math.min(700,Math.trunc(Number(limit)||300)))]);
 const tickets=new Set(),report={examined:rows.length,graded:0,held:0,closed:0,
  source:'ZIZOBET_PRIMARY',mode:'REAL_TICKETS',reasons:{}};
 for(const row of rows){
  const verdict=gradePrimaryLiveTicketLine(row,{now:now(),stabilityMs});
  if(!verdict.status){
   report.held++;
   report.reasons[verdict.reason]=(report.reasons[verdict.reason]??0)+1;
   continue;
  }
  if(await update(row.line_id,verdict.status,row.ticket_id)){
   report.graded++;tickets.add(row.ticket_id);
  }
 }
 for(const ticketId of tickets){
  try{if(await recalc(ticketId))report.closed++;}
  catch(error){console.warn('[primary goal/corner settle] payment retry:',ticketId,error.message);}
 }
 return report;
}
