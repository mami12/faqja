import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Maximize2, Minimize2, RotateCw } from 'lucide-react';

type LockableOrientation = ScreenOrientation & {lock?: (orientation:'landscape')=>Promise<void>;unlock?:()=>void};
export default function CasinoFullscreen({children}:{children:ReactNode}){
  const root=useRef<HTMLDivElement>(null);
  const [expanded,setExpanded]=useState(false);
  const [pseudo,setPseudo]=useState(false);
  const [rotate,setRotate]=useState(false);
  useEffect(()=>{
    const onChange=()=>{
      const active=document.fullscreenElement===root.current;
      if(!active&&!pseudo){setExpanded(false);setRotate(false);}
      if(active)setExpanded(true);
    };
    document.addEventListener('fullscreenchange',onChange);
    return()=>document.removeEventListener('fullscreenchange',onChange);
  },[pseudo]);
  useEffect(()=>{
    if(!expanded)return;
    const update=()=>{
      const portrait=window.innerHeight>window.innerWidth;
      // A visual fallback for mobile browsers that deny ScreenOrientation.lock().
      setRotate(pseudo&&portrait);
    };
    window.addEventListener('resize',update);
    return()=>window.removeEventListener('resize',update);
  },[expanded,pseudo]);
  useEffect(()=>{
    document.body.style.overflow=expanded?'hidden':'';
    return()=>{document.body.style.overflow='';};
  },[expanded]);
  const close=async()=>{
    try{(screen.orientation as LockableOrientation | undefined)?.unlock?.();}catch{/* unsupported */}
    if(document.fullscreenElement===root.current){
      try{await document.exitFullscreen();}catch{/* unsupported */}
    }
    setPseudo(false);setRotate(false);setExpanded(false);
  };
  const open=async()=>{
    const target=root.current;
    if(!target)return;
    let native=false;
    try{
      if(target.requestFullscreen){await target.requestFullscreen();native=true;}
    }catch{/* iOS Safari and embedded browsers may deny fullscreen */}
    let locked=false;
    try{
      const orientation=screen.orientation as LockableOrientation | undefined;
      if(orientation?.lock){await orientation.lock('landscape');locked=true;}
    }catch{/* orientation lock requires supported mobile browser */}
    setPseudo(!native);
    setExpanded(true);
    setRotate(!locked&&!native&&window.innerHeight>window.innerWidth);
  };
  return <div ref={root} className={
    'relative overflow-hidden bg-black '+(expanded?'casino-game-expanded ':'')+
    (pseudo?'casino-game-pseudo ':'')+(rotate?'casino-game-rotated ':'')
  }>
    <div className="casino-game-toolbar absolute right-2 top-2 z-50 flex items-center gap-2">
      {rotate&&<span className="rounded-lg bg-slate-950/85 px-2 py-1 text-xs text-amber-200"><RotateCw size={13} className="mr-1 inline"/>Pamje landscape</span>}
      <button type="button" onClick={()=>void(expanded?close():open())}
        aria-label={expanded?'Dil nga fullscreen':'Fullscreen landscape'}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-white/30 bg-slate-950/90 px-3 text-sm font-bold text-white shadow-xl">
        {expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}
        <span>{expanded?'Dil':'Fullscreen'}</span>
      </button>
    </div>
    <div className="casino-game-content">{children}</div>
  </div>;
}
