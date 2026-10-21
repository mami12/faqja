import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../web/src/components/Layout/casinoDisplay.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exports={};vm.runInNewContext(compiled,{exports,Promise});
const {createCasinoDisplayController}=exports;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture({fullscreen=false,landscape=false,deny=false}={}){
 const calls={fullscreen:0,lock:0,unlock:0,exit:0};
 const state={fullscreen,landscape,deny};
 const target={
  isFullscreen:()=>state.fullscreen,isLandscape:()=>state.landscape,
  requestFullscreen:async()=>{calls.fullscreen++;if(state.deny)throw Error('Denied');state.fullscreen=true;},
  lockLandscape:async()=>{calls.lock++;if(state.deny)throw Error('Denied');state.landscape=true;},
  unlock:()=>{calls.unlock++;state.landscape=false;},
  exitFullscreen:async()=>{calls.exit++;state.fullscreen=false;},
 };
 return {calls,state,target,controller:createCasinoDisplayController(target)};
}

// Original AGT emits a fullscreen message for every Android tap, even after denial.
const denied=fixture({deny:true});
for(let i=0;i<20;i++)await denied.controller.request();
assert.equal(denied.calls.fullscreen,1);assert.equal(denied.calls.lock,1);
await denied.controller.request({retry:true});
assert.equal(denied.calls.fullscreen,2);assert.equal(denied.calls.lock,2,'Toolbar retries a denied orientation request');
await denied.controller.request();assert.equal(denied.calls.fullscreen,2,'Provider taps stay coalesced after explicit retry');

// Card click, component mount and provider taps share the same in-flight promise.
const concurrent=fixture(),entry=deferred();
concurrent.target.requestFullscreen=async()=>{concurrent.calls.fullscreen++;await entry.promise;concurrent.state.fullscreen=true;};
const pending=concurrent.controller.request();
for(let i=0;i<20;i++)assert.equal(concurrent.controller.request(),pending);
assert.equal(concurrent.controller.request({retry:true}),pending);
assert.equal(concurrent.calls.fullscreen,1);entry.resolve();await pending;
assert.equal(concurrent.calls.lock,1);

const native=fixture({fullscreen:true,landscape:true});
await native.controller.request();await native.controller.request({retry:true});
assert.equal(native.calls.fullscreen,0);assert.equal(native.calls.lock,0,'Already satisfied native state is left alone');
const landscape=fixture({landscape:true});await landscape.controller.request();
assert.equal(landscape.calls.fullscreen,1);assert.equal(landscape.calls.lock,0,'Landscape devices need no orientation lock');

const retry=fixture({deny:true});await retry.controller.request();retry.state.deny=false;
await retry.controller.request({retry:true});
assert.equal(retry.state.fullscreen,true);assert.equal(retry.state.landscape,true,'Explicit retry can enter native display after denial');

await denied.controller.release();
await denied.controller.request();
assert.equal(denied.calls.fullscreen,3);assert.equal(denied.calls.lock,3,'A new game receives one fresh automatic attempt');

// Back waits for a late native entry, then exits it before the next game starts.
const race=fixture(),late=deferred();
race.target.requestFullscreen=async()=>{race.calls.fullscreen++;if(race.calls.fullscreen===1)await late.promise;race.state.fullscreen=true;};
const oldRequest=race.controller.request(),closing=race.controller.release();
assert.equal(race.controller.release(),closing,'Concurrent cleanup and Back share release');
const nextRequest=race.controller.request();
assert.equal(race.calls.fullscreen,1,'Next game waits for previous native cleanup');
late.resolve();await Promise.all([oldRequest,closing,nextRequest]);
assert.equal(race.calls.fullscreen,2);assert.equal(race.calls.exit,1);assert.equal(race.calls.unlock,1);
assert.equal(race.calls.lock,1,'The abandoned request never locks orientation');
assert.equal(race.state.fullscreen,true,'Previous cleanup cannot exit the next game');

const component=readFileSync(new URL('../web/src/components/Layout/CasinoFullscreen.tsx',import.meta.url),'utf8');
assert(component.includes('requestCasinoLandscape({retry:true})'),'Visible Fullscreen control must opt in to retry');
assert(component.includes('casino-game-rotated')&&component.includes('Back to casino'),'CSS landscape and Back remain present');
console.log('PASS casino display request coalescing, explicit retry, native state checks and release races');
