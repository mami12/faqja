import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {ArrowLeft,Maximize2,Minimize2} from 'lucide-react';
import {createCasinoDisplayController} from './casinoDisplay';

type LandscapeOrientation=ScreenOrientation&{lock?:(value:'landscape')=>Promise<void>};
const display=createCasinoDisplayController({
 isFullscreen:()=>Boolean(document.fullscreenElement),
 isLandscape:()=>screen.orientation?.type?screen.orientation.type.startsWith('landscape'):window.innerWidth>window.innerHeight,
 requestFullscreen:()=>document.documentElement.requestFullscreen?.(),
 lockLandscape:()=>(screen.orientation as LandscapeOrientation)?.lock?.('landscape'),
 unlock:()=>screen.orientation?.unlock?.(),
 exitFullscreen:()=>document.exitFullscreen(),
});
export const requestCasinoLandscape=display.request;
export const releaseCasinoLandscape=display.release;

export default function CasinoFullscreen({children,title,onExit}:{children:ReactNode;title:string;onExit:()=>void}){
 const [portrait,setPortrait]=useState(()=>window.innerHeight>window.innerWidth);
 const [windowed,setWindowed]=useState(false);
 const exiting=useRef(false),wasNative=useRef(Boolean(document.fullscreenElement));
 const wantNative=useRef(true),expectedNativeExit=useRef(false);
 const [closing,setClosing]=useState(false),[error,setError]=useState('');
 const exit=()=>{
  if(exiting.current)return;exiting.current=true;setClosing(true);setError('');
  try{onExit();}catch(e:any){setError(e?.message||'Could not close the game. Try again.');exiting.current=false;setClosing(false);}
 };
 const toggleFullscreen=()=>{
  if(!wantNative.current){
   wantNative.current=true;setWindowed(false);
   void requestCasinoLandscape({retry:true}).finally(()=>{if(document.fullscreenElement)expectedNativeExit.current=false;});
  }else{
   wantNative.current=false;expectedNativeExit.current=Boolean(document.fullscreenElement);
   setWindowed(true);void releaseCasinoLandscape({keepSession:true});
  }
 };
 useEffect(()=>{
  const update=()=>setPortrait(window.innerHeight>window.innerWidth);
  const nativeChange=()=>{
   const active=Boolean(document.fullscreenElement);
   const expected=expectedNativeExit.current;
   expectedNativeExit.current=false;
   // A delayed event from our own exit must not cancel an already queued retry.
   if(wasNative.current&&!active&&!(expected&&wantNative.current)){
    wantNative.current=false;setWindowed(true);void releaseCasinoLandscape({keepSession:true});
   }
   wasNative.current=active;
  };
  window.addEventListener('resize',update);screen.orientation?.addEventListener?.('change',update);
  document.addEventListener('fullscreenchange',nativeChange);
  void requestCasinoLandscape();
  return()=>{window.removeEventListener('resize',update);screen.orientation?.removeEventListener?.('change',update);document.removeEventListener('fullscreenchange',nativeChange);void releaseCasinoLandscape();};
 },[]);
 useEffect(()=>{
  const overflow=document.body.style.overflow;
  if(!windowed)document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=overflow;};
 },[windowed]);
 useEffect(()=>{
  const message=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin)return;
   const frame=document.querySelector('.casino-game-content iframe') as HTMLIFrameElement|null;
   if(!frame||event.source!==frame.contentWindow)return;
   if(event.data?.type==='casino:fullscreen'&&!windowed)void requestCasinoLandscape();
   if(event.data?.type==='casino:exit')exit();
  };
  window.addEventListener('message',message);return()=>window.removeEventListener('message',message);
 });
 return <div className={windowed?'min-h-screen bg-primary':''}>
  <div key="game-stage" className={'casino-game-stage '+(windowed?'casino-game-windowed':portrait?'casino-game-rotated':'')}>
  <div className="casino-game-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-white/20 bg-slate-950 px-2 text-white">
   <button type="button" onClick={exit} disabled={closing} aria-label="Back to casino"
    className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold hover:bg-white/10 disabled:opacity-60"><ArrowLeft size={18}/>{closing?'Closing…':'Back'}</button>
   <span className="truncate text-sm font-bold">{error||title}</span>
   <button type="button" onClick={toggleFullscreen} aria-label={windowed?'Fullscreen landscape':'Exit fullscreen'} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-2 text-xs hover:bg-white/10">
    {windowed?<Maximize2 size={18}/>:<Minimize2 size={18}/>}<span>{windowed?'Fullscreen':'Exit fullscreen'}</span>
   </button>
  </div>
  <div className="casino-game-content relative min-h-0 flex-1">{children}</div>
  </div>
 </div>;
}
