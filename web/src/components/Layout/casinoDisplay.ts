type DisplayTarget={
 isFullscreen:()=>boolean;
 isLandscape:()=>boolean;
 requestFullscreen:()=>Promise<void>|void;
 lockLandscape:()=>Promise<void>|void;
 unlock:()=>void;
 exitFullscreen:()=>Promise<void>|void;
};

/** One automatic native display attempt per game; the toolbar can explicitly retry. */
export function createCasinoDisplayController(target:DisplayTarget){
 let generation=0,automaticRequested=false;
 let pending:Promise<void>|null=null,releasing:Promise<void>|null=null;
 const request=({retry=false}:{retry?:boolean}={})=>{
  if(pending)return pending;
  if(automaticRequested&&!retry)return Promise.resolve();
  automaticRequested=true;
  const current=generation,barrier=releasing;
  const run=async()=>{
   if(barrier)await barrier;
   if(current!==generation)return;
   try{if(!target.isFullscreen())await target.requestFullscreen();}catch{/* CSS landscape remains available. */}
   if(current!==generation)return;
   try{if(!target.isLandscape())await target.lockLandscape();}catch{/* Unsupported or denied by the browser. */}
  };
  const task=run().finally(()=>{if(pending===task)pending=null;});
  pending=task;
  return task;
 };
 const release=()=>{
  if(releasing)return releasing;
  // A late fullscreen promise must finish before Back exits native fullscreen.
  const previous=pending;
  generation++;automaticRequested=false;pending=null;
  const run=async()=>{
   if(previous)await previous;
   try{target.unlock();}catch{}
   try{if(target.isFullscreen())await target.exitFullscreen();}catch{}
  };
  const task=run().finally(()=>{if(releasing===task)releasing=null;});
  releasing=task;
  return task;
 };
 return {request,release};
}
