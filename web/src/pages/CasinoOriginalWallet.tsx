import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,RefreshCw} from 'lucide-react';
import {apiClient} from '../api/client';
import {useAuth} from '../context/AuthContext';
import CasinoFullscreen from '../components/Layout/CasinoFullscreen';

const REAL_PLAY='/app/api/casino/sizzlinghotdeluxe/real/play';

function walletError(status:number,details:string):string {
  if(status===401)return 'Sesioni i Sizzling nuk u pranua (401). Kontrollo cookie-t dhe hape nga i njëjti domain i sportit.';
  if(status===403)return 'Serveri e refuzoi nisjen e Sizzling (403). Kontrollo aktivizimin e kazinosë dhe domain-in e faqes.';
  if(status===404)return 'API e Sizzling nuk u gjet (404). Kontrollo nëse Railway ka publikuar versionin e fundit.';
  if(status>=500)return 'API e Sizzling dha gabim '+status+'. Kontrollo lidhjen me databazën dhe Railway Logs.';
  return 'API e Sizzling u përgjigj me '+status+': '+details.slice(0,180);
}

/**
 * The Pixi client is embedded only after its HttpOnly session cookie has been
 * verified through the exact same-origin real-wallet /play endpoint.
 * No demo fallback or separate balance is possible.
 */
export default function CasinoOriginalWallet(){
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
      const response=await apiClient.post<{ready:boolean;gameUrl:string}>('/casino/session');
      if(!response.data.ready||!response.data.gameUrl.startsWith('/app/casino-original/sizzling/'))
        throw new Error('Sesioni i lojës nuk u krijua');
      // A successful /casino/session does NOT prove the browser sent its
      // HttpOnly cookie. The game would otherwise freeze at 29% indefinitely.
      const payload=new FormData();
      payload.append('data',JSON.stringify({action:'init',request_id:'0',time_offset:0}));
      const test=await fetch(REAL_PLAY,{
        method:'POST',credentials:'same-origin',body:payload,cache:'no-store',
      });
      if(!test.ok){
        const details=(await test.text()).slice(0,220);
        throw new Error(walletError(test.status,details));
      }
      const init=await test.json();
      if(!init?.init?.start_symbols||typeof init?.balance?.after!=='number')
        throw new Error('Serveri ktheu një përgjigje jo të plotë për nisjen e lojës.');
      // Force a fresh HTML entry on reconnect; original artwork stays hashed.
      setUrl(response.data.gameUrl+'?wallet='+Date.now());
    }catch(e:any){
      const text=e.response?.data?.message||e.message||'Lidhja me portofolin dështoi';
      setError(String(text));
      setUrl('');
    }finally{setLoading(false);}
  };
  useEffect(()=>{void connect();},[]);
  useEffect(()=>{
    if(!url)return;
    const check=()=>{
      try{
        const doc=frame.current?.contentDocument;
        if(!doc)return;
        const loader=doc.getElementById('preloaderContainer');
        const canvas=doc.getElementById('slotCanvas') as HTMLCanvasElement|null;
        if(!loader&&canvas&&canvas.width>0){
          setReady(true);setStalled(false);
          return;
        }
        const message=doc.getElementById('preloaderText')?.textContent;
        if(message)setProgress(message.trim());
      }catch{/* an iframe from an unexpected origin cannot be inspected */}
    };
    const poll=window.setInterval(check,750);
    const timeout=window.setTimeout(()=>setStalled(value=>ready?value:true),45000);
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
  if(loading)return <div role="status" className="flex min-h-56 items-center justify-center bg-black p-8 text-center text-amber-200">Po verifikohet lidhja me bilancin e sportit...</div>;
  if(error||!url)return <div className="flex min-h-56 flex-col items-center justify-center gap-4 bg-black p-8 text-center">
    <AlertTriangle className="text-amber-300" size={30}/>
    <p role="alert" className="max-w-xl text-sm text-rose-200">{error||'Loja nuk është e disponueshme'}</p>
    <button onClick={()=>void connect()} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 font-bold text-black"><RefreshCw size={16}/>Rilidhu me bilancin</button>
  </div>;
  return <CasinoFullscreen>
    <div className="relative">
      <iframe ref={frame} title="Sizzling Hot Deluxe · bilanci i sportit"
        src={url} className="block h-[min(84vh,920px)] min-h-[530px] w-full border-0"
        allow="autoplay; fullscreen" allowFullScreen/>
      {stalled&&!ready&&<div role="alert"
        className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/95 p-5 text-center text-white">
        <AlertTriangle className="text-amber-300" size={32}/>
        <p className="text-base font-bold">Sizzling nuk përfundoi ngarkimin {progress&&'('+progress+')'}</p>
        <p className="max-w-md text-sm text-slate-300">Sesioni i portofolit u verifikua, por klienti i lojës nuk përfundoi. Kontrollo nëse disa skedarë janë bllokuar ose janë ngarkuar nga cache.</p>
        <button onClick={()=>void connect()} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 font-bold text-black"><RefreshCw size={16}/>Rifresko lojën</button>
      </div>}
    </div>
  </CasinoFullscreen>;
}
