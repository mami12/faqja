/**
 * READ-ONLY diagnostic for the LOCAL PGlite/PostgreSQL database.
 * Does not print usernames, financial figures, booking codes or credentials.
 * Usage (from repository root): node scripts/audit-advanced-settlement.mjs
 */
import {pool,query} from '../server/db.mjs';

const REASONS_SQL = `
with facts as (
 select match_id,kind,
  count(*) filter(where team='home')::int as observed_home,
  count(*) filter(where team='away')::int as observed_away
 from app_match_event_fact
 where provider='zizobet' and active=true
 group by match_id,kind
), pending as (
 select l.market_name,l.match_id,l.live_contract,
  c.match_id as coverage_match_id,c.kind as coverage_kind,
  c.count_home,c.count_away,c.confirmed_at,c.observed_at,
  cur.last_seen_at, f.observed_home,f.observed_away,
  r.match_id as final_result_id,
  exists(select 1 from app_live_event_recovery recovery
    where recovery.match_id=l.match_id
      and recovery.status='AWAITING_BACKUP_API'
      and l.id=any(recovery.line_ids)) as recovery_open
 from app_ticket_line l
 join app_ticket t on t.id=l.ticket_id
 left join app_match_event_coverage c
  on c.match_id=l.match_id and c.provider='zizobet'
     and c.kind=l.live_contract->>'event'
 left join app_live_event_cursor cur on cur.match_id=l.match_id
 left join facts f on f.match_id=l.match_id and f.kind=l.live_contract->>'event'
 left join app_match_result r on r.match_id=l.match_id
 where l.status='PENDING' and t.status='PENDING'
), diagnosed as (
 select market_name,coalesce(live_contract->>'kind','NO_CONTRACT') as contract_kind,
  case
   when live_contract is null then 'NO_CONTRACT'
   when coverage_match_id is null then 'NO_PRIMARY_COVERAGE'
   when coalesce(observed_home,0)<>count_home
     or coalesce(observed_away,0)<>count_away then 'COUNTER_MISMATCH'
   when confirmed_at is null then 'NOT_CONFIRMED'
   when last_seen_at is null then 'NO_SECOND_POLL'
   when observed_at is distinct from last_seen_at then 'FRESH_FRAME_INCOMPLETE'
   when recovery_open then 'OPEN_RECOVERY_GAP'
   else 'FACTS_READY_CHECK_RULE'
  end as reason,
  final_result_id is not null as has_final
 from pending
)
select market_name,contract_kind,reason,has_final,count(*)::int as lines
from diagnosed
group by market_name,contract_kind,reason,has_final
order by lines desc,market_name,reason
limit 100`;

try{
 const counts=(await query(`select status,count(*)::int as count from app_ticket_line
  group by status order by status`)).rows;
 const coverage=(await query(`select kind,count(*)::int as rows,
  count(*) filter(where confirmed_at is not null)::int as confirmed
  from app_match_event_coverage where provider='zizobet'
  group by kind order by kind`)).rows;
 const pending=(await query(REASONS_SQL)).rows;
 const gaps=(await query(`select status,count(*)::int as count from app_live_event_recovery
  group by status order by status`)).rows;
 const results=(await query(`select count(*)::int as finished,
  count(corners_home)::int as with_corners,
  count(cards_home)::int as with_cards,
  count(half_home_score)::int as with_half_time
  from app_match_result`)).rows[0];
 console.log(JSON.stringify({readOnly:true,lineStatus:counts,coverage,results,
  recovery:gaps,pendingByMarket:pending,notes:[
   'FACTS_READY_CHECK_RULE means only the initial DB checks passed; it does not prove a win or loss.',
   'NO_CONTRACT for a simple market may be normal; investigate complex market names.',
   'The audit shows what is stored now, not which events the external feed omitted.'
  ]},null,2));
}catch(error){
 console.error('[advanced settlement read-only audit] '+error.message);
 process.exitCode=1;
}finally{
 if(typeof pool.end==='function')await pool.end();
}
