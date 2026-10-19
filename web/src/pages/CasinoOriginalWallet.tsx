import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,RefreshCw} from 'lucide-react';
import {apiClient} from '../api/client';
import {useAuth} from '../context/AuthContext';
import CasinoFullscreen from '../components/Layout/CasinoFullscreen';

export type CasinoGame = 'sizzling' | 'bookofra';

const GAMES: Record<CasinoGame, {title: string; session: string; play: string; prefix: string}> = {
  sizzling: {
    title: 'Sizzling Hot Deluxe',
    session: '/casino/session',
    play: '/app/api/casino/sizzlinghotdeluxe/real/play',
    prefix: '/app/casino-original/sizzling/',
  },
  bookofra: {
    title: 'Book of Ra Deluxe',
    session: '/casino/bookofra/session',
    play: '/app/api/casino/bookofra/real/play',
    prefix: '/app/casino-original/bookofra/',
  },
};

function walletError(status:number,details:string):string {
  if(status===401)return 'Sesioni i lojës nuk u pranua (401). Kontrollo cookie-t dhe hape nga i njëjti domain.';
  if(status===403)return 'Serveri e refuzoi nisjen e lojës (403). Kontrollo aktivizimin e kazinosë.';
  if(status===404)return 'API e lojës nuk u gjet (404). Kontrollo nëse Railway ka publikuar versionin e fundit.';
  if(status>=500)return 'API e lojës dha gabim '+status+'. Kontrollo lidhjen me databazën dhe Railway Logs.';
  return 'API e lojës u përgjigj me '+status+': '+details.slice(0,180);
}

/**
 * The Pixi client is embedded only after its HttpOnly session cookie has been
 * verified through the exact same-origin real-wallet /play endpoint.
 * No demo fallback is possible: the game always plays for the player balance.
 */
export default function CasinoOriginalWallet({game='sizzling'}:{game?:CasinoGame}){
  const cfg=GAMES[game]??GAMES.sizzling;
  const {refreshUser}=useAuth();
  const frame=useRef<HTMLIFrameElement>(null);
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState(false);
  const [progress,setProgress]=useState('');
  const [stalled,setStalled]=useState(false);
  const [error,setError]=useState('');
  const connect=async()=>{
    setLoading(true);setError('');setReady(false);setStalled(false);setProgress('');
    setUrl('');
    try{
      const response=await apiClient.post<{ready:boolean;gameUrl:string}>(cfg.session);
      if(!response.data.ready||!response.data.gameUrl.startsWith(cfg.prefix))
        throw new Error('Sesioni i lojës nuk u krijua');
      const payload=new FormData();
      payload.append('data',JSON.stringify({action:'init',request_id:'0',time_offset:0}));
      const test=await fetch(cfg.play,{
        method:'POST',credentials:'same-origin',body:payload,cache:'no-store',
      });
      if(!test.ok){
        const details=(await test.text()).slice(0,220);
        throw new Error(walletError(test.status,details));
      }
      const init=await test.json();
      if(!init?.init?.start_symbols||typeof init?.balance?.after!=='number')
        throw new Error('Serveri ktheu një përgjigje jo të plotë për nisjen e lojës.');
      setUrl(response.data.gameUrl+'?wallet='+Date.now());
    }catch(e:any){
      const text=e.response?.data?.message||e.message||'Lidhja me portofolin dështoi';
      setError(String(text));
      setUrl('');
    }finally{setLoading(false);}
  };
  useEffect(()=>{void connect();},[game]);
  useEffect(()=>{
    if(!url)return;
    const check=()=>{
      try{
        const doc=frame.current?.contentDocument;
        if(!doc)return;
        const loader=doc.getElementById('preloaderContainer');
        const canvas=doc.getElementById('slotCanvas') as HTMLCanvasElement|null;
        if(!loader&&canvas&&canvas.width>0){setReady(true);setStalled(false);return;}
        const message=doc.getElementById('preloaderText')?.textContent;
        if(message)setProgress(message.trim());
      }catch{/* cross-origin frames cannot be inspected */}
    };
    const poll=window.setInterval(check,750);
    const timeout=window.setTimeout(()=>setStalled(value=>ready?value:true),60000);
    return()=>{window.clearInterval(poll);window.clearTimeout(timeout);};
  },[url,ready]);
  useEffect(()=>{
    const sync=()=>{void refreshUser().catch(()=>{});};
    const id=window.setInterval(sync,3000);
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    return()=>{
      window.clearInterval(id);
      window.removeEventListener('focus',sync);
      document.removeEventListener('visibilitychange',sync);
    };
  },[refreshUser]);
  if(loading)return <div role="status" className="flex min-h-56 items-center justify-center bg-black p-8 text-center text-amber-200">Po verifikohet lidhja me bilancin e llogarisë...</div>;
  if(error||!url)return <div className="flex min-h-56 flex-col items-center justify-center gap-4 bg-black p-8 text-center">
    <AlertTriangle className="text-amber-300" size={30}/>
    <p role="alert" className="max-w-xl text-sm text-rose-200">{error||'Loja nuk është e disponueshme'}</p>
    <button onClick={()=>void connect()} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 font-bold text-black"><RefreshCw size={16}/>Rilidhu me bilancin</button>
  </div>;
  return <CasinoFullscreen>
    <div className="relative">
      <p className="flex items-center justify-center gap-2 bg-[#111824] px-3 py-2 text-center text-[11px] text-amber-200 sm:hidden">
        <RefreshCw size={13} className="rotate-90"/> Rrotullo telefonin horizontalisht për ekran më të madh
      </p>
      <iframe ref={frame} title={cfg.title+' · bilanci i llogarisë'}
        src={url} className="block h-[min(84vh,920px)] min-h-[530px] w-full border-0"
        allow="autoplay; fullscreen" allowFullScreen/>
      {stalled&&!ready&&<div role="alert"
        className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/95 p-5 text-center text-white">
        <AlertTriangle className="text-amber-300" size={32}/>
        <p className="text-base font-bold">{cfg.title} nuk përfundoi ngarkimin {progress&&'('+progress+')'}</p>
        <p className="max-w-md text-sm text-slate-300">Sesioni i portofolit u verifikua, por klienti i lojës nuk përfundoi. Kontrollo nëse disa skedarë janë bllokuar ose janë ngarkuar nga cache.</p>
        <button onClick={()=>void connect()} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 font-bold text-black"><RefreshCw size={16}/>Rifresko lojën</button>
      </div>}
    </div>
  </CasinoFullscreen>;
}
