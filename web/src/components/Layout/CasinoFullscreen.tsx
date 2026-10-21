import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {ArrowLeft,Maximize2} from 'lucide-react';
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

export default function CasinoFullscreen({children,title,onExit}:{children:ReactNode;title:string;onExit:()=>Promise<void>}){
 const [portrait,setPortrait]=useState(()=>window.innerHeight>window.innerWidth);
 const [closing,setClosing]=useState(false),[error,setError]=useState('');
 const exit=async()=>{
  if(closing)return;setClosing(true);setError('');
  try{await onExit();await releaseCasinoLandscape();}catch(e:any){setError(e?.message||'Could not close the game. Try again.');setClosing(false);}
 };
 useEffect(()=>{
  const update=()=>setPortrait(window.innerHeight>window.innerWidth);
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  window.addEventListener('resize',update);screen.orientation?.addEventListener?.('change',update);
  void requestCasinoLandscape();
  return()=>{document.body.style.overflow=overflow;window.removeEventListener('resize',update);screen.orientation?.removeEventListener?.('change',update);void releaseCasinoLandscape();};
 },[]);
 useEffect(()=>{
  const message=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin)return;
   const frame=document.querySelector('.casino-game-content iframe') as HTMLIFrameElement|null;
   if(!frame||event.source!==frame.contentWindow)return;
   if(event.data?.type==='casino:fullscreen')void requestCasinoLandscape();
   if(event.data?.type==='casino:exit')void exit();
  };
  window.addEventListener('message',message);return()=>window.removeEventListener('message',message);
 });
 return <div className={'casino-game-stage '+(portrait?'casino-game-rotated':'')}>
  <div className="casino-game-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-white/20 bg-slate-950 px-2 text-white">
   <button type="button" onClick={()=>void exit()} disabled={closing} aria-label="Back to casino"
    className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold hover:bg-white/10 disabled:opacity-60"><ArrowLeft size={18}/>{closing?'Closing…':'Back'}</button>
   <span className="truncate text-sm font-bold">{error||title}</span>
   <button type="button" onClick={()=>void requestCasinoLandscape({retry:true})} aria-label="Fullscreen landscape" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10"><Maximize2 size={18}/></button>
  </div>
  <div className="casino-game-content relative min-h-0 flex-1">{children}</div>
 </div>;
}
