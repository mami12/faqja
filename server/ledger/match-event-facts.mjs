/**
 * Persistent PRIMARY-feed football incidents. Provider IDs and player names are
 * preserved verbatim. Only an incident list reconciled with the same provider's
 * counters may replace the current active facts. Missing evidence never deletes
 * previously verified facts or grades a losing selection.
 */
export const MATCH_EVENT_FACT_SQL = String.raw`
create table if not exists app_match_event_fact (
 match_id bigint not null,
 provider text not null,
 provider_event_id text not null,
 kind text not null check (kind in ('goal','corner','card','foul')),
 team text not null check (team in ('home','away')),
 minute integer not null check (minute between 0 and 130),
 seconds numeric(12,3),
 player_id text,
 player_name text,
 phase text,
 active boolean not null default true,
 observed_at timestamptz not null default now(),
 primary key(match_id,provider,provider_event_id,kind)
);
create index if not exists app_match_event_fact_lookup
 on app_match_event_fact(match_id,provider,kind,active,minute,seconds);
create table if not exists app_match_event_coverage (
 match_id bigint not null,
 provider text not null,
 kind text not null,
 through_minute numeric(10,4) not null,
 count_home integer not null,
 count_away integer not null,
 complete boolean not null default false,
 observed_at timestamptz not null default now(),
 primary key(match_id,provider,kind)
);
`;
const validKind = new Set(['goal','corner','card','foul']);
const validSide = new Set(['home','away']);
/** Called INSIDE the existing live-frame SQL transaction. */
export async function persistVerifiedEventFacts(matchId, frame, execute) {
 if(frame?.source!=='zizobet'||!Array.isArray(frame.events))return 0;
 let stored=0;
 for(const kind of validKind){
  const through=Number(frame.coverage?.[kind+'Through']);
  if(frame.coverage?.[kind+'Through']==null||!Number.isFinite(through)||through<0||through>130)continue;
  const counts=frame.teams?.[kind];
  if(!counts||!['home','away'].every(side=>Number.isSafeInteger(counts[side])&&counts[side]>=0))continue;
  const relevant=frame.events.filter(event=>event.type===kind);
  if(relevant.some(event=>!validSide.has(event.team)||!Number.isInteger(event.minute)||
      event.minute<0||event.minute>130||event.id==null||String(event.id)===''||
      (event.seconds!=null&&(!Number.isFinite(event.seconds)||event.seconds<0))))continue;
  const identifiers=relevant.map(e=>String(e.id));
  if(new Set(identifiers).size!==identifiers.length)continue;
  const facts=relevant.map(e=>({id:String(e.id),team:e.team,minute:e.minute,seconds:e.seconds??null,
   playerId:e.playerId==null?null:String(e.playerId),
   playerName:typeof e.player==='string'?e.player:null,phase:e.phase??null}));
  // A correction may remove/replace a provider event, but the raw live-frame
  // archive remains intact. Changes are atomic with coverage and the new frame.
  await execute(`update app_match_event_fact set active=false,observed_at=now()
     where match_id=$1 and provider='zizobet' and kind=$2 and active=true
     and not(provider_event_id=any($3::text[]))`,[matchId,kind,identifiers]);
  if(facts.length)await execute(`insert into app_match_event_fact
    (match_id,provider,provider_event_id,kind,team,minute,seconds,player_id,player_name,phase,active)
    select $1,'zizobet',f.id,$2,f.team,f.minute,f.seconds,f.player_id,f.player_name,f.phase,true
    from jsonb_to_recordset($3::jsonb)
     as f(id text,team text,minute integer,seconds numeric,player_id text,player_name text,phase text)
    on conflict(match_id,provider,provider_event_id,kind) do update
    set team=excluded.team,minute=excluded.minute,seconds=excluded.seconds,
        player_id=coalesce(excluded.player_id,app_match_event_fact.player_id),
        player_name=coalesce(excluded.player_name,app_match_event_fact.player_name),
        phase=excluded.phase,active=true,observed_at=now()`,
   [matchId,kind,JSON.stringify(facts.map(f=>({
    id:f.id,team:f.team,minute:f.minute,seconds:f.seconds,player_id:f.playerId,
    player_name:f.playerName,phase:f.phase})))]);
  await execute(`insert into app_match_event_coverage
    (match_id,provider,kind,through_minute,count_home,count_away,complete)
    values ($1,'zizobet',$2,$3,$4,$5,$6)
    on conflict(match_id,provider,kind) do update
    set through_minute=excluded.through_minute,count_home=excluded.count_home,
        count_away=excluded.count_away,complete=excluded.complete,observed_at=now()
    where excluded.through_minute>=app_match_event_coverage.through_minute
       or excluded.complete=true`,
   [matchId,kind,through,counts.home,counts.away,frame.ended===true]);
  stored+=facts.length;
 }
 return stored;
}
export const SUPPORTED_FACT_KINDS=new Set(['window','sequence','race','over','under','exact','atLeast','range','team-total-goals','interval-result','player-goal']);
/**
 * PostgreSQL counts the accepted, verified incidents. Returns null when the
 * accepted structured contract, ordering or coverage cannot prove an answer.
 * Do not infer a loss from an absent row or an incomplete timeline.
 */
export async function gradeStoredEventContract(line,result,{execute}={}){
 const c=line?.live_contract;
 if(!c||!SUPPORTED_FACT_KINDS.has(c.kind)||!validKind.has(c.event)||typeof execute!=='function')return null;
 const {rows}=await execute(`with covered as (
   select through_minute,count_home,count_away,complete from app_match_event_coverage
   where match_id=$1 and provider='zizobet' and kind=$2
 ), ordered as (
   select f.*,row_number() over(order by coalesce(f.seconds,f.minute*60),f.minute,f.provider_event_id) as ordinal,
     count(*) over(partition by coalesce(f.seconds,f.minute*60)) as same_time
   from app_match_event_fact f
   where f.match_id=$1 and f.provider='zizobet' and f.kind=$2 and f.active
 ), aggregate as (
   select count(*)::int as total,
    count(*) filter(where team='home')::int as home,
    count(*) filter(where team='away')::int as away,
    count(*) filter(where ($3::numeric is null or minute >= $3)
      and ($4::numeric is null or minute <= $4)
      and ($5::text is null or team=$5))::int as window_count,
    count(*) filter(where ($3::numeric is null or minute >= $3)
      and ($4::numeric is null or minute <= $4) and team='home')::int as window_home,
    count(*) filter(where ($3::numeric is null or minute >= $3)
      and ($4::numeric is null or minute <= $4) and team='away')::int as window_away,
    count(*) filter(where (player_id is not null and player_id=$6)
      or ($6::text is null and player_name is not null and lower(player_name)=lower($7)))::int as player_goals,
    bool_or(same_time>1) as ambiguous_order
   from ordered
 )
 select a.*,c.through_minute,c.count_home,c.count_away,c.complete,
   (select team from ordered where ordinal=$8) as nth_team,
   (select minute from ordered where ordinal=$8) as nth_minute,
   (select same_time from ordered where ordinal=$8) as nth_same_time,
   (select min(ordinal) from (
     select ordinal,team,count(*) over(partition by team order by ordinal) as team_number
     from ordered
   ) race where team_number=$8 and team='home') as race_home,
   (select min(ordinal) from (
     select ordinal,team,count(*) over(partition by team order by ordinal) as team_number
     from ordered
   ) race where team_number=$8 and team='away') as race_away
 from aggregate a left join covered c on true`,
 [line.match_id,c.event,
  c.kind==='interval-result'?c.fromSeconds/60:c.from??null,
  c.kind==='interval-result'?(c.toExclusiveSeconds-1)/60:c.to??null,
  c.side??null,c.playerId??null,c.playerName??null,c.target??1]);
 const data=rows[0];
 if(!data||data.through_minute==null)return null;
 const full=!!(result&&data.complete===true&&
    (c.event!=='goal'||(data.home===Number(result.home_score)&&data.away===Number(result.away_score))));
 const through=Number(data.through_minute);
 const scopeEnded=full||(Number.isFinite(c.to)&&through>Number(c.to));
 const count=Number(c.side==='home'?data.home:c.side==='away'?data.away:data.total);
 const expected=Number(c.target??c.threshold);
 const decision=truth=>truth?'WON':'LOST';
 if(c.kind==='window'){
  if(!scopeEnded)return null;
  const num=Number(data.window_count);
  return decision(c.choice?(num>0):(num===0));
 }
 if(c.kind==='interval-result'){
  if(!full&&through*60<c.toExclusiveSeconds)return null;
  const h=Number(data.window_home),a=Number(data.window_away);
  return decision((h>a?'home':a>h?'away':'none')===c.side);
 }
 if(c.kind==='sequence'){
  if(data.nth_team!=null){
   if(Number(data.nth_same_time)>1||data.ambiguous_order===true)return null;
   return decision(data.nth_team===c.side);
  }
  if(!full)return null;
  return c.side==='none'?'WON':decision(false);
 }
 if(c.kind==='race'){
  if(data.ambiguous_order===true||!['home','away'].includes(c.side))return null;
  const h=data.race_home==null?null:Number(data.race_home),a=data.race_away==null?null:Number(data.race_away);
  if(h===null&&a===null)return null;
  return decision(c.side===(h!==null&&(a===null||h<a)?'home':'away'));
 }
 if(c.kind==='player-goal'){
  if(!full||!c.playerName&&!c.playerId)return null;
  if(Number(data.player_goals)>0)return 'WON';
  // No confirmed participation or complete player attribution => review.
  return null;
 }
 if(!full)return null;
 if(c.kind==='team-total-goals'){
  if(!Number.isFinite(c.threshold)||!['over','under'].includes(c.choice))return null;
  if(count===c.threshold&&Number.isInteger(c.threshold))return 'VOID'; // genuine numeric push
  return decision(c.choice==='over'?count>c.threshold:count<c.threshold);
 }
 if(!Number.isFinite(expected))return null;
 if(c.kind==='over'||c.kind==='under'){
  if(count===expected&&Number.isInteger(expected))return 'VOID';
  return decision(c.kind==='over'?count>expected:count<expected);
 }
 if(c.kind==='exact')return decision(count===expected);
 if(c.kind==='atLeast')return decision(count>=expected);
 if(c.kind==='range'&&Number.isFinite(c.min)&&Number.isFinite(c.max))return decision(count>=c.min&&count<=c.max);
 return null;
}
