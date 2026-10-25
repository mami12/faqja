import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,RefreshCw} from 'lucide-react';
import {apiClient} from '../api/client';
import {casinoPercent,casinoStakeLimits,casinoTermsKey,type CasinoGameSettings,type CasinoSettingsData,type CasinoGameId} from '../types/casino';
import {userError} from '../utils/userError';
import {useAuth} from '../context/AuthContext';


export type CasinoGame = CasinoGameId;

const original=(id:CasinoGame,title:string)=>({title,session:`/casino/original/${id}/session`,prefix:`/app/api/casino/original/${id}/launch`});
const GAMES: Record<CasinoGame, {title: string; session: string; play?: string; prefix: string}> = {
  'lucky-clover-x3':original('lucky-clover-x3','Lucky Clover X3'),
  'vikings-fun':original('vikings-fun',"Viking's Fun"),
  'fruit-queen':original('fruit-queen','Fruit Queen'),
  'seven-hot':original('seven-hot','Seven Hot'),
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
  if(status===401)return 'Sesioni i lojës nuk u pranua (401). Kontrollo të dhënat e sesionit dhe hape nga e njëjta adresë.';
  if(status===403)return 'Serveri e refuzoi nisjen e lojës (403). Kontrollo aktivizimin e kazinosë.';
  if(status===404)return 'Shërbimi i lojës nuk u gjet (404). Kontrollo nëse serveri përdor versionin e fundit.';
  if(status>=500)return 'Shërbimi i lojës dha gabim '+status+'. Kontrollo lidhjen me databazën dhe regjistrin e gabimeve në server.';
  return 'API e lojës u përgjigj me '+status+': '+details.slice(0,180);
}

/**
 * The Pixi client is embedded only after its HttpOnly session cookie has been
 * verified through the exact same-origin real-wallet /play endpoint.
 * No demo fallback is possible: the game always plays for the player balance.
 */
export default function CasinoOriginalWallet({game='sizzling'}:{game?:CasinoGame}){
  const {user,refreshUser}=useAuth();
  const cfg=GAMES[game]??GAMES.sizzling;
  const frame=useRef<HTMLIFrameElement>(null);
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState(false);
  const [progress,setProgress]=useState('');
  const [stalled,setStalled]=useState(false);
  const [error,setError]=useState('');
  const [terms,setTerms]=useState<{game:CasinoGameSettings;limits:CasinoSettingsData['stakeLimits']}|null>(null);
  const [awaitingTerms,setAwaitingTerms]=useState(false);
  const [termsChanged,setTermsChanged]=useState(false);
  const [pendingWin,setPendingWin]=useState(0);
  const acceptedTerms=useRef('');
  const connect=async()=>{
    setLoading(true);setError('');setReady(false);setStalled(false);setProgress('');
    setUrl('');setPendingWin(0);setAwaitingTerms(false);setTermsChanged(false);
    try{
      const settings=await apiClient.get<CasinoSettingsData>('/casino/status');
      const current=settings.data.games.find(item=>item.gameId===game);
      if(!current||!settings.data.stakeLimits)throw new Error('Kushtet e lojës nuk u verifikuan. Provo përsëri.');
      const currentTerms={game:current,limits:settings.data.stakeLimits};
      setTerms(currentTerms);
      if(current.controls.mode==='custom'&&acceptedTerms.current!==casinoTermsKey(current,settings.data.stakeLimits)){
        setAwaitingTerms(true);return;
      }
      const response=await apiClient.post<{ready:boolean;gameUrl:string;mathVersion?:string}>(cfg.session,{mathVersion:current.mathVersion});
      if(!response.data.ready||!response.data.gameUrl.startsWith(cfg.prefix))
        throw new Error('Sesioni i lojës nuk u krijua');
      if(cfg.play){
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
      }
      const gameUrl=new URL(response.data.gameUrl,window.location.origin);
      gameUrl.searchParams.set('wallet',String(Date.now()));
      setUrl(gameUrl.pathname+gameUrl.search);
    }catch(e:any){
      const text=e.response?.data?.message||e.message||'Lidhja me portofolin dështoi';
      setError(userError(text,'Lidhja me portofolin dështoi. Provo përsëri.'));
      setUrl('');
    }finally{setLoading(false);}
  };
  useEffect(()=>{void connect();},[game]);
  useEffect(()=>{
    if(!url||!terms)return;
    let disposed=false;
    const check=async()=>{
      try{
        const response=await apiClient.get<CasinoSettingsData>('/casino/status');
        const current=response.data.games.find(item=>item.gameId===game);
        if(!disposed&&current)setTermsChanged(casinoTermsKey(current,response.data.stakeLimits)!==casinoTermsKey(terms.game,terms.limits));
      }catch{/* A network failure does not interrupt an accepted round or bonus. */}
    };
    const timer=window.setInterval(()=>void check(),30000);
    return()=>{disposed=true;window.clearInterval(timer);};
  },[url,game,terms]);
  useEffect(()=>{
    if(!url||ready)return;
    const check=()=>{
      try{
        const doc=frame.current?.contentDocument;
        if(!doc)return;
        const loader=doc.getElementById('preloaderContainer');
        const canvas=doc.getElementById('slotCanvas') as HTMLCanvasElement|null;
        if((!cfg.play&&doc.getElementById('gameContainer'))||(!loader&&canvas&&canvas.width>0)){setReady(true);setStalled(false);return;}
        const message=doc.getElementById('preloaderText')?.textContent;
        if(message)setProgress(message.trim());
      }catch{/* cross-origin frames cannot be inspected */}
    };
    const poll=window.setInterval(check,750);
    const timeout=window.setTimeout(()=>setStalled(value=>ready?value:true),60000);
    return()=>{window.clearInterval(poll);window.clearTimeout(timeout);};
  },[url,ready]);
  useEffect(()=>{
    if(!url)return;
    let disposed=false,inFlight=false,dirty=false;
    const refresh=async()=>{
      if(disposed)return;
      if(inFlight){dirty=true;return;}
      inFlight=true;
      try{if(typeof refreshUser==='function')await refreshUser();}finally{inFlight=false;if(dirty){dirty=false;void refresh();}}
    };
    const changed=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='casino:wallet-updated')void refresh();
      if(event.data?.type==='casino:pending'&&Number.isFinite(event.data.amount)&&event.data.amount>=0)setPendingWin(event.data.amount);
    };
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('message',changed);
    window.addEventListener('focus',visible);
    document.addEventListener('visibilitychange',visible);
    void refresh();
    return()=>{disposed=true;window.removeEventListener('message',changed);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
  },[url,game,refreshUser]);
  if(loading)return <div role="status" className="flex min-h-56 items-center justify-center bg-black p-8 text-center text-amber-200">Po verifikohet lidhja me bilancin e llogarisë...</div>;
  if(awaitingTerms&&terms)return <div className="max-h-full w-full overflow-y-auto bg-black p-4 text-white sm:p-6">
    <section aria-label="Kushtet e lojës" className="mx-auto max-w-xl space-y-4 rounded-xl border border-amber-400/50 bg-slate-950 p-4 sm:p-6">
      <h2 className="text-lg font-bold">{cfg.title} · Modalitet i personalizuar</h2>
      <p className="text-sm text-slate-200">Kjo lojë përdor një shpërndarje të personalizuar të rezultateve. RTP origjinale e ofruesit nuk zbatohet për rrotullimet e reja me pagesë në këtë modalitet.</p>
      <dl className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-white/5 p-3"><dt className="text-sm text-slate-300">RTP e caktuar</dt><dd className="text-2xl font-black text-amber-200">{casinoPercent(terms.game.effectiveRtp)}</dd></div><div className="rounded-lg bg-white/5 p-3"><dt className="text-sm text-slate-300">Shpeshtësia e fitimit</dt><dd className="text-2xl font-black text-amber-200">{casinoPercent(terms.game.effectiveHitFrequency)}</dd></div></dl>
      <p className="text-sm text-slate-300">RTP është kthimi mesatar afatgjatë. Shpeshtësia e fitimit përfshin rrotullimet me pagesë që kthejnë një shumë mbi zero, përfshirë bonusin e tyre, përpara dyfishimit opsional të fitimit. Edhe një kthim më i vogël se basti llogaritet si rrotullim që paguan.</p>
      {terms.game.effectiveRtp===0&&<p role="alert" className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-3 font-bold text-rose-200">RTP 0%: rrotullimet e reja me pagesë nuk mund të fitojnë. Çdo bast i ri do të humbet.</p>}
      <p className="text-sm text-white">Kufijtë e bastit: {casinoStakeLimits(terms.limits)}.</p>
      {terms.game.effectiveRtp>0&&terms.game.maxPayoutMultiplier!=null&&<p className="text-sm text-slate-300">Kufiri i pagesës: deri në {terms.game.maxPayoutMultiplier}× basti. Maksimumi i mundshëm me bastin dhe numrin e linjave që ke zgjedhur mund të jetë më i ulët.</p>}
      <p className="text-xs text-slate-400">Bonusët e pranuar më parë ruajnë kushtet e tyre.</p>
      <button type="button" onClick={()=>{acceptedTerms.current=casinoTermsKey(terms.game,terms.limits);void connect();}} className="min-h-11 w-full rounded-lg bg-amber-400 px-4 font-bold text-black">E kuptova · Hap lojën</button>
    </section>
  </div>;
  if(error||!url)return <div className="flex min-h-56 flex-col items-center justify-center gap-4 bg-black p-8 text-center">
    <AlertTriangle className="text-amber-300" size={30}/>
    <p role="alert" className="max-w-xl text-sm text-rose-200">{error||'Loja nuk është e disponueshme'}</p>
    <button onClick={()=>void connect()} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 font-bold text-black"><RefreshCw size={16}/>Rilidhu me bilancin</button>
  </div>;
  return <div className="casino-session-layout">
    {terms&&<div className="casino-session-terms flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-white/10 bg-slate-950 px-2 py-1 text-center text-[11px] text-slate-300" aria-label="Kushtet aktive të lojës">
      <span>Basti: {casinoStakeLimits(terms.limits)}</span>
      {user&&<span className="font-semibold text-white" aria-label="Bilanci i llogarisë">Bilanci: {Number(user.balance).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})} lekë</span>}
      {pendingWin>0&&<span className="text-amber-200">Fitim në pritje: {pendingWin.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})} lekë · Arkëtoje në lojë për ta kaluar në bilanc</span>}
      {terms.game.controls.mode==='custom'&&<span className="font-semibold text-amber-200">I personalizuar · RTP {casinoPercent(terms.game.effectiveRtp)} · Shpeshtësia {casinoPercent(terms.game.effectiveHitFrequency)}{terms.game.effectiveRtp===0?' · Pa fitime':''}</span>}
      {termsChanged&&<button type="button" onClick={()=>void connect()} className="min-h-8 rounded border border-amber-400/60 px-2 font-bold text-amber-200">Cilësimet ndryshuan · Kontrolloji para rrotullimit tjetër me pagesë</button>}
    </div>}
    <div className="casino-session-stage">
    <div className="casino-wallet-surface relative">
      <iframe ref={frame} title={cfg.title+' · bilanci i llogarisë'}
        src={url} className="casino-wallet-frame block h-full min-h-0 w-full border-0"
        allow="autoplay; fullscreen; screen-wake-lock" allowFullScreen
        onLoad={()=>{if(!cfg.play)setReady(true);}}/>
      {stalled&&!ready&&<div role="alert"
        className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/95 p-5 text-center text-white">
        <AlertTriangle className="text-amber-300" size={32}/>
        <p className="text-base font-bold">{cfg.title} nuk përfundoi ngarkimin {progress&&'('+progress+')'}</p>
        <p className="max-w-md text-sm text-slate-300">Sesioni i portofolit u verifikua, por klienti i lojës nuk përfundoi. Kontrollo nëse disa skedarë janë bllokuar ose janë ruajtur nga një ngarkim i mëparshëm.</p>
        <button onClick={()=>void connect()} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 font-bold text-black"><RefreshCw size={16}/>Rifresko lojën</button>
      </div>}
    </div>
    </div>
  </div>;
}
