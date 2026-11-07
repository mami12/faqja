/**
 * Durable, append-on-change audit for every normalized provider offer.
 * This NEVER supplies a settlement decision or moves player money.
 * The live odds board remains in RAM, independent of PostgreSQL speed.
 */
import {liveContract} from './live-contract-rules.mjs';
import {eventMarketRequirement} from './event-market-policy.mjs';

export const PROVIDER_OFFER_ARCHIVE_SQL = [
 'create table if not exists app_provider_offer_current (',
 ' match_id bigint not null, market_key text not null, line text not null default \'\',',
 ' outcome_key text not null, market_name text not null, outcome_name text not null,',
 ' provider_id text, native_market_id text, native_outcome_id text,',
 ' native_market_name text, native_outcome_name text, native_parameters jsonb,',
 ' native_quote jsonb, contract_hint jsonb, evidence_requirement text,',
 ' price numeric(18,8), suspended boolean not null default false,',
 ' period integer not null default 0,',
 ' first_seen_at timestamptz not null default now(),',
 ' last_changed_at timestamptz not null default now(),',
 ' primary key(match_id,market_key,line,outcome_key));',
 'create index if not exists app_provider_offer_current_match_idx on app_provider_offer_current(match_id,market_key);',
 'create table if not exists app_provider_offer_change (',
 ' id bigserial primary key, match_id bigint not null, market_key text not null,',
 ' line text not null, outcome_key text not null, market_name text not null,',
 ' outcome_name text not null, provider_id text, native_market_id text,',
 ' native_outcome_id text, native_market_name text, native_outcome_name text,',
 ' native_parameters jsonb, native_quote jsonb, contract_hint jsonb,',
 ' evidence_requirement text, price numeric(18,8), suspended boolean not null,',
 ' period integer not null, recorded_at timestamptz not null default now());',
 'create index if not exists app_provider_offer_change_match_idx on app_provider_offer_change(match_id,recorded_at desc);'
].join('\n');

const decodeNativeParameters=key=>{
 const encoded=String(key).match(/^zz\d+@([A-Za-z0-9_-]{1,8192})$/)?.[1];
 if(!encoded)return null;
 try{
  const decoded=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  return decoded&&typeof decoded==='object'&&!Array.isArray(decoded)?decoded:null;
 }catch{return null;}
};
const safeText=v=>v==null?null:String(v).slice(0,8192);
const safePrice=v=>v==null||v===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
const jsonValue=v=>{if(v==null)return null;try{return JSON.parse(JSON.stringify(v));}catch{return null;}};

/** Hints are for future rule development, NEVER an authorization to settle. */
export function normalizeProviderOffer(row){
 const matchId=Number(row?.matchId??row?.match_id);
 const marketKey=safeText(row?.marketKey??row?.market_key);
 const outcomeKey=safeText(row?.outcomeKey??row?.outcome_key);
 if(!Number.isSafeInteger(matchId)||matchId<=0||!marketKey||!outcomeKey)return null;
 const line=safeText(row?.line)??'';
 const marketName=safeText(row?.marketName??row?.market_name)??marketKey;
 const outcomeName=safeText(row?.outcomeName??row?.outcome_name)??outcomeKey;
 const providerId=safeText(row?.providerId??row?.provider_id);
 const candidate={market_key:marketKey,market_name:marketName,
  outcome_key:outcomeKey,outcome_name:outcomeName,line};
 const contract=liveContract(candidate,{counts:{},clock:null,teams:{}});
 const requirement=eventMarketRequirement(candidate)??null;
 return {
  match_id:matchId,market_key:marketKey,line,outcome_key:outcomeKey,
  market_name:marketName,outcome_name:outcomeName,
  provider_id:providerId,native_market_id:safeText(row?.nativeMarketId??marketKey.split('@')[0]),
  native_outcome_id:safeText(row?.nativeOutcomeId??outcomeKey),
  native_market_name:safeText(row?.nativeMarketName??marketName),
  native_outcome_name:safeText(row?.nativeOutcomeName??outcomeName),
  native_parameters:jsonValue(row?.nativeParameters??decodeNativeParameters(marketKey)),
  native_quote:jsonValue(row?.nativeQuote),
  contract_hint:jsonValue(contract),
  evidence_requirement:requirement??(contract?'INCIDENT_FACTS':'UNCLASSIFIED'),
  price:safePrice(row?.price),suspended:row?.suspended===true,
  period:Number.isSafeInteger(Number(row?.period))?Number(row.period):0
 };
}
const keys=['match_id','market_key','line','outcome_key','market_name','outcome_name',
 'provider_id','native_market_id','native_outcome_id','native_market_name',
 'native_outcome_name','native_parameters','native_quote','contract_hint',
 'evidence_requirement','price','suspended','period'];
const columnList=keys.join(',');
const fields='match_id bigint,market_key text,line text,outcome_key text,'+
 'market_name text,outcome_name text,provider_id text,native_market_id text,'+
 'native_outcome_id text,native_market_name text,native_outcome_name text,'+
 'native_parameters jsonb,native_quote jsonb,contract_hint jsonb,'+
 'evidence_requirement text,price numeric,suspended boolean,period integer';
// One atomic SQL statement; unchanged polls create neither updates nor history.
export const ARCHIVE_PROVIDER_OFFERS_SQL=
 'with revised as (insert into app_provider_offer_current as t ('+columnList+') '+
 'select '+keys.map(k=>'x.'+k).join(',')+
 ' from jsonb_to_recordset($1::jsonb) as x('+fields+') '+
 'on conflict(match_id,market_key,line,outcome_key) do update set '+
 keys.slice(4).map(k=>k+'=excluded.'+k).join(',')+',last_changed_at=now() '+
 'where ('+keys.slice(4).map(k=>'t.'+k).join(',')+') is distinct from ('+
 keys.slice(4).map(k=>'excluded.'+k).join(',')+') '+
 'returning '+columnList+') '+
 'insert into app_provider_offer_change ('+columnList+') '+
 'select '+columnList+' from revised returning id';

export async function persistProviderOffers(rows,{execute,chunkSize=250}={}){
 if(typeof execute!=='function')throw Error('PostgreSQL executor is required');
 const dedup=new Map();
 for(const raw of rows??[]){
  const offer=normalizeProviderOffer(raw);
  if(offer)dedup.set([offer.match_id,offer.market_key,offer.line,offer.outcome_key].join('|'),offer);
 }
 const offers=[...dedup.values()],step=Math.max(1,Math.min(500,Number(chunkSize)||250));
 let recorded=0;
 for(let i=0;i<offers.length;i+=step){
  const {rowCount}=await execute(ARCHIVE_PROVIDER_OFFERS_SQL,[JSON.stringify(offers.slice(i,i+step))]);
  recorded+=rowCount??0;
 }
 return {seen:offers.length,recorded};
}

/** A bounded, single-flight retry queue. No waiting on DB in the odds stream. */
export function createProviderOfferArchive({execute,ready=()=>true,maxTracked=60000,
 onError=e=>console.warn('[provider offer archive]',e.message)}={}){
 const written=new Map(),pending=new Map();
 let active=null,failed=0,lastError=null,lastSavedAt=null,recorded=0;
 const cap=Math.max(1000,Number(maxTracked)||60000);
 const id=q=>[q.match_id,q.market_key,q.line,q.outcome_key].join('|');
 const sig=q=>JSON.stringify(q);
 async function flush(){
  if(active)return active;
  if(!ready()||!pending.size)return {pending:pending.size};
  active=(async()=>{
   while(ready()&&pending.size){
    const entries=[...pending].slice(0,250);
    const result=await persistProviderOffers(entries.map(([,v])=>v.quote),{execute});
    recorded+=result.recorded;lastSavedAt=new Date().toISOString();lastError=null;
    for(const [key,value] of entries){
     written.delete(key);written.set(key,value.signature);
     if(pending.get(key)?.signature===value.signature)pending.delete(key);
    }
    while(written.size>cap)written.delete(written.keys().next().value);
   }
   return {pending:pending.size};
  })();
  try{return await active;}
  catch(e){failed++;lastError=e.message;onError(e);return {pending:pending.size,error:e.message};}
  finally{active=null;}
 }
 function observe(rows){
  if(!ready())return;
  for(const raw of rows??[]){
   const quote=normalizeProviderOffer(raw);if(!quote)continue;
   const key=id(quote),signature=sig(quote);
   if(written.get(key)===signature){pending.delete(key);continue;}
   pending.delete(key);pending.set(key,{signature,quote});
   if(pending.size>cap)pending.delete(pending.keys().next().value);
  }
  if(pending.size&&!active)void flush();
 }
 const status=()=>({pending:pending.size,recorded,failed,lastError,lastSavedAt});
 return {observe,flush,status};
}
