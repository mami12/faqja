import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import {createEventCollector} from '../server/zizobet/event-collector.mjs';

/** A busy watched-game worker must not starve other live fixtures. */
const started=[],releases=new Map();
const collector=createEventCollector({
 getWatchIds:async()=>new Set(['101','102','103']),
 now:()=>1000000,refreshMs:0,maxActive:1,
 save:async(id)=>{
  const key=String(id);started.push(key);
  await new Promise(resolve=>releases.set(key,resolve));
 },
 recordFrame:async()=>true
});
const payload={Match:{MatchTimeExtended:'12:00',CornersTeam1:0,CornersTeam2:0},
 TimeLines:[]};
const jobs=[101,102,103].map(id=>collector({match_id:id},payload));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
await tick();
assert.deepEqual(started,['101'],'Only one watched fixture runs at a time');
releases.get('101')();
await tick();
assert.deepEqual(started,['101','102'],
 'A second fixture must be queued, not discarded while worker was busy');
releases.get('102')();
await tick();
assert.deepEqual(started,['101','102','103'],
 'Third fixture eventually receives both evidence and frame persistence');
releases.get('103')();
await Promise.all(jobs);
assert.deepEqual(started,['101','102','103']);
console.log('PASS event collector: bounded concurrency without starvation');
