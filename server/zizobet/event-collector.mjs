import {eventWatchIds,saveEventEvidence,normalizeEvents} from '../ledger/event-evidence.mjs';
import {recordWatchedLiveFrame} from '../ledger/live-observation-store.mjs';

/** One PRIMARY Zizobet snapshot per watched fixture, no secondary API calls.
 * Feed corrections are reconciled in the transactional PostgreSQL fact store.
 */
export function createEventCollector({
 getWatchIds=eventWatchIds,save=saveEventEvidence,recordFrame=recordWatchedLiveFrame,
 now=Date.now,refreshMs=15000,maxActive=3,maxPending=128
}={}){
 let active=0;
 const concurrency=Math.max(1,Math.floor(Number(maxActive))||3);
 const backlogLimit=Math.max(1,Math.floor(Number(maxPending))||128);
 const last=new Map(),inflight=new Set(),waiting=new Map();
 // A busy collector must not silently discard every fourth (and later)
 // watched fixture. Preserve FIFO fairness while bounding RAM consumption.
 const drain=()=>{
  while(active<concurrency&&waiting.size){
   const [id,entry]=waiting.entries().next().value;
   waiting.delete(id);
   if(inflight.has(id)||now()-(last.get(id)??-Infinity)<refreshMs){
    entry.resolve();continue;
   }
   inflight.add(id);active++;last.set(id,now());
   if(last.size>3000)last.delete(last.keys().next().value);
   void (async()=>{
    const evidence=normalizeEvents(entry.data,'zizobet');
    const settled=await Promise.allSettled([
     save(entry.row.match_id,evidence),
     recordFrame(entry.row.match_id,entry.data)
    ]);
    for(const item of settled)if(item.status==='rejected')
     console.warn('[primary event capture]',id,String(item.reason?.message??item.reason));
   })().then(entry.resolve,entry.reject).finally(()=>{
    inflight.delete(id);active--;drain();
   });
  }
 };
 return async function collectEventEvidence(row,data){
  const id=String(row.match_id);
  if(!(await getWatchIds()).has(id)||inflight.has(id))return;
  if(now()-(last.get(id)??-Infinity)<refreshMs)return;
  const pending=waiting.get(id);
  if(pending){
   // Keep only the freshest not-yet-processed frame for this fixture.
   pending.row=row;pending.data=data;
   return pending.promise;
  }
  if(waiting.size>=backlogLimit){
   console.warn('[primary event capture] backlog full; future polling must retry fixture',id);
   return;
  }
  let resolve,reject;
  const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  waiting.set(id,{row,data,promise,resolve,reject});
  drain();
  return promise;
 };
}
export const collectEventEvidence=createEventCollector();
