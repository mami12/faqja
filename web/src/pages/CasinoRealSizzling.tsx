import { useEffect, useRef, useState } from 'react';
import { Dices, Play, Volume2, VolumeX } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { casinoAssetUrl, ORIGINAL_BACKGROUNDS, ORIGINAL_LOGOS, ORIGINAL_SYMBOLS } from './casinoOriginalArt';
import CasinoFullscreen from '../components/Layout/CasinoFullscreen';

type SpinResult={
  roundId:string; stake:number;payout:number;balance:number;
  result:{symbols:Record<string,Record<string,{code:number}>>;total:string;line_wins:unknown[]};
};
const amounts=[1,2,3,5,10,20,30,50,100];
const denoms=[0.5,1,2,5,10];
const fmt=(x:number)=>Number(x).toLocaleString('sq-AL',{minimumFractionDigits:2,maximumFractionDigits:2});
function SymbolArt({value}:{value:number}){
  const art=ORIGINAL_SYMBOLS.sizzling?.[value];
  if(!art)return <span>{value}</span>;
  if(!art.rect)return <img src={casinoAssetUrl(art.src)} alt={'Simbol '+value} className="h-full w-full object-contain"/>;
  const {x,y,w,h,atlasW,atlasH}=art.rect;
  return <div role="img" aria-label={'Simbol '+value} className="h-full w-full" style={{
    backgroundImage:'url("'+casinoAssetUrl(art.src)+'")',
    backgroundSize:atlasW/w*100+'% '+atlasH/h*100+'%',
    backgroundPosition:x/Math.max(1,atlasW-w)*100+'% '+y/Math.max(1,atlasH-h)*100+'%',
    backgroundRepeat:'no-repeat',
  }}/>;
}
export default function CasinoRealSizzling(){
  const {user,refreshUser}=useAuth();
  const [balance,setBalance]=useState(user?.balance||0);
  const [bet,setBet]=useState(1),[denom,setDenom]=useState(1);
  const [grid,setGrid]=useState<number[][]>([
    [1,4,3,5,6],[3,4,7,2,1],[2,5,6,7,4]]);
  const [busy,setBusy]=useState(false),[sound,setSound]=useState(true);
  const [message,setMessage]=useState('Zgjidh bastin dhe shtyp SPIN'),[win,setWin]=useState(0);
  const [error,setError]=useState('');
  const pendingId=useRef<string|null>(null);
  const spinLock=useRef(false);
  const audio=useRef<AudioContext|null>(null);
  useEffect(()=>{setBalance(user?.balance||0);},[user?.balance]);
  useEffect(()=>()=>{void audio.current?.close();},[]);
  const tone=()=>{
    if(!sound)return;
    try{
      const ctx=audio.current||(audio.current=new AudioContext());
      const oscillator=ctx.createOscillator(),gain=ctx.createGain();
      oscillator.frequency.value=320;gain.gain.value=.025;
      oscillator.connect(gain);gain.connect(ctx.destination);
      oscillator.start();oscillator.stop(ctx.currentTime+.15);
    }catch{/* no audio permission */}
  };
  const spin=async()=>{
    if(spinLock.current||balance<bet*denom*5)return;
    spinLock.current=true;setBusy(true);setError('');setWin(0);setMessage('Duke rrotulluar...');
    // Reuse the same key after network failure: server returns the original
    // persisted round rather than charging the player a second time.
    const id=pendingId.current||crypto.randomUUID();pendingId.current=id;
    try{
      const response=await apiClient.post<SpinResult>('/casino/spin',{clientRequestId:id,bet,denomination:denom,lines:5});
      const round=response.data;
      const matrix=round.result.symbols;
      const next=Array.from({length:3},(_,row)=>
        Array.from({length:5},(_,col)=>Number(matrix[String(col)]?.[String(row)]?.code??0)));
      setGrid(next);setBalance(round.balance);setWin(round.payout);
      setMessage(round.payout>0?'FITOVE '+fmt(round.payout)+' Lek':'Raundi u përfundua');
      pendingId.current=null;tone();void refreshUser();
    }catch(e:any){
      setMessage('Raundi nuk u konfirmua. Provo përsëri me të njëjtën kërkesë.');
      setError(e.response?.data?.message||'Gabim rrjeti. Butoni SPIN përsërit vetëm kërkesën e mëparshme.');
      if(e.response?.status===400||e.response?.status===403||e.response?.status===409)
        pendingId.current=null;
    }finally{spinLock.current=false;setBusy(false);}
  };
  return <CasinoFullscreen>
    <div className="min-h-[400px] bg-cover bg-center p-3 pb-5 text-white sm:p-6" style={{
      backgroundImage:'linear-gradient(0deg,rgba(0,0,0,.86),rgba(0,0,0,.45)),url("'+casinoAssetUrl(ORIGINAL_BACKGROUNDS.sizzling)+'")'}}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pr-28">
        <img src={casinoAssetUrl(ORIGINAL_LOGOS.sizzling||'sizzling/logo.png')} alt="Sizzling Hot Deluxe" className="max-h-20 max-w-40 object-contain sm:max-w-56"/>
        <div className="rounded-lg border border-amber-500/60 bg-black/80 px-4 py-2 text-right">
          <p className="text-xs text-amber-200">Bilanci i përbashkët</p><p className="text-lg font-black tabular-nums text-amber-300">{fmt(balance)} Lek</p>
        </div>
      </div>
      <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1 rounded-xl border-4 border-amber-600 bg-black/90 p-2 sm:gap-2 sm:p-4">
        {grid.map((row,r)=>row.map((symbol,c)=><div key={r+'-'+c}
          className={'aspect-[1.2] overflow-hidden rounded-md bg-slate-100 '+(busy?'animate-pulse':'')}>
          <SymbolArt value={symbol}/></div>))}
      </div>
      <div className="mx-auto mt-3 max-w-3xl rounded-lg border border-white/15 bg-black/75 p-3 text-center">
        <p aria-live="polite" className="font-bold text-amber-200">{message}</p>
        <p className="mt-1 text-xs text-slate-300">Fitimi i raundit: <strong className="text-emerald-300">{fmt(win)} Lek</strong></p>
      </div>
      {error&&<p role="alert" className="mx-auto mt-2 max-w-3xl rounded-lg bg-rose-500/20 p-2 text-sm text-rose-200">{error}</p>}
      <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-end justify-center gap-3">
        <label className="space-y-1 text-xs font-bold">Basti për linjë
          <select value={bet} disabled={busy||!!pendingId.current} onChange={e=>setBet(Number(e.target.value))}
            className="block min-h-11 rounded-lg border border-amber-500/30 bg-slate-900 px-3 text-white">
            {amounts.map(n=><option key={n} value={n}>{n} Lek</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold">Vlera
          <select value={denom} disabled={busy||!!pendingId.current} onChange={e=>setDenom(Number(e.target.value))}
            className="block min-h-11 rounded-lg border border-amber-500/30 bg-slate-900 px-3 text-white">
            {denoms.map(n=><option key={n} value={n}>{n}x</option>)}
          </select>
        </label>
        <button type="button" onClick={()=>void spin()} disabled={busy||balance<bet*denom*5}
          className="flex min-h-12 min-w-32 items-center justify-center gap-2 rounded-lg bg-amber-400 px-6 font-black text-slate-950 disabled:opacity-50">
          <Play size={19} fill="currentColor"/> {busy?'SPIN...':'SPIN'}
        </button>
        <button type="button" aria-label={sound?'Çaktivizo tingullin':'Aktivizo tingullin'}
          onClick={()=>setSound(!sound)} className="min-h-12 rounded-lg border border-white/20 bg-black/70 p-3">
          {sound?<Volume2 size={19}/>:<VolumeX size={19}/>}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-slate-300">5 linja · Basti total: {fmt(bet*denom*5)} Lek</p>
    </div>
  </CasinoFullscreen>;
}
