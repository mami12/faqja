import {createHash} from 'node:crypto';
import {eventWatchIds,saveEventEvidence,normalizeEvents} from '../ledger/event-evidence.mjs';
import {recordWatchedLiveFrame,recordPrimaryMatchFacts} from '../ledger/live-observation-store.mjs';

/**
 * Every already-delivered full match payload can contribute compact incident
 * facts. A fixture with pending incident bets takes priority and preserves
 * original raw frames; other fixtures store only changed/periodically confirmed
 * goals, corners and cards. NO additional API request is made.
 *
 * Bounded queues cannot delay watched bets behind hundreds of passive matches.
 */
export function createEventCollector({
 getWatchIds=eventWatchIds,save=saveEventEvidence,recordFrame=recordWatchedLiveFrame,
 recordGeneral=recordPrimaryMatchFacts, now=Date.now,
 refreshMs=15000,maxActive=3,maxPending=128,maxBackground=256,
 backgroundRefreshMs=120000,collectAll=true
}={}){
 let active=0;
 const cap=Math.max(1,Math.floor(Number(maxActive))||3);
 const watchLimit=Math.max(1,Math.floor(Number(maxPending))||128);
 const passiveLimit=Math.max(1,Math.floor(Number(maxBackground))||256);
 const lastWatched=new Map(),recentPassive=new Map(),inflight=new Set();
 const important=new Map(),passive=new Map();
 const time=()=>Number(now());
 const digest=data=>createHash('sha256').update(JSON.stringify([
  data?.Match?.Score,data?.Match?.CornersTeam1,data?.Match?.CornersTeam2,
  data?.Match?.YellowCardsTeam1,data?.Match?.YellowCardsTeam2,
  data?.Match?.RedCardsTeam1,data?.Match?.RedCardsTeam2,
  data?.Match?.EventStatus,data?.TimeLines
 ])).digest('hex');
 const enqueue=(queue,id,entry)=>{
  queue.set(id,entry);
  if(queue.size>5000)throw new Error('Incident queue exceeded bounded limit');
 };
 const drain=()=>{
  while(active<cap&&(important.size||passive.size)){
   const prioritized=important.size>0;
   const queue=prioritized?important:passive;
   const [id,entry]=queue.entries().next().value;
   queue.delete(id);
   if(inflight.has(id)||entry.watched&&
      time()-(lastWatched.get(id)??-Infinity)<refreshMs){entry.resolve();continue;}
   inflight.add(id);active++;
   if(entry.watched){
    lastWatched.set(id,time());
    if(lastWatched.size>3000)lastWatched.delete(lastWatched.keys().next().value);
   }
   void (async()=>{
    if(entry.watched){
     const evidence=normalizeEvents(entry.data,'zizobet');
     const completed=await Promise.allSettled([
      save(entry.row.match_id,evidence),
      recordFrame(entry.row.match_id,entry.data)
     ]);
     for(const item of completed)if(item.status==='rejected')
      console.warn('[primary watched capture]',id,String(item.reason?.message??item.reason));
    }else{
     const earlier=recentPassive.get(id);
     const result=await recordGeneral(entry.row.match_id,entry.data);
     if(result?.stored){
      const confirmations=earlier?.signature===entry.signature?
        Math.min(2,Number(earlier.confirmations??0)+1):1;
      recentPassive.set(id,{signature:entry.signature,at:time(),confirmations});
      if(recentPassive.size>4000)recentPassive.delete(recentPassive.keys().next().value);
     }
    }
   })().then(entry.resolve,error=>{
    console.warn('[primary event capture]',id,String(error?.message??error));
    entry.resolve();
   }).finally(()=>{inflight.delete(id);active--;drain();});
  }
 };
 return async function collectEventEvidence(row,data){
  const id=String(row?.match_id??'');
  if(!/^\d+$/.test(id)||!data?.Match)return;
  const watched=(await getWatchIds()).has(id);
  if(!watched&&(!collectAll||!Array.isArray(data.TimeLines)))return;
  if(inflight.has(id))return;
  if(watched&&time()-(lastWatched.get(id)??-Infinity)<refreshMs)return;
  let signature=null;
  if(!watched){
   signature=digest(data);
   const previous=recentPassive.get(id),age=time()-(previous?.at??-Infinity);
   if(previous?.signature===signature&&
      (age<5000||previous.confirmations>=2&&age<backgroundRefreshMs))return;
  }
  // Promote a previously passive fixture without losing its pending task.
  const existing=important.get(id)??passive.get(id);
  if(existing){
   existing.row=row;existing.data=data;existing.signature=signature;
   if(watched&&!existing.watched){
    passive.delete(id);existing.watched=true;enqueue(important,id,existing);
   }
   return existing.promise;
  }
  const queue=watched?important:passive;
  if(queue.size>=(watched?watchLimit:passiveLimit)){
   // Passive frame capture is strictly best-effort and may retry on the next
   // primary poll; money-bearing watched fixtures are never silently demoted.
   console.warn('[primary event capture] queued capacity reached',id,watched?'WATCHED':'BACKGROUND');
   return;
  }
  let resolve;
  const promise=new Promise(ok=>{resolve=ok;});
  enqueue(queue,id,{row,data,signature,watched,promise,resolve});
  drain();
  return promise;
 };
}
export const collectEventEvidence=createEventCollector();
