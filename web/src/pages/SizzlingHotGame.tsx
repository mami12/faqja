import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Music2, Volume2, VolumeX } from 'lucide-react';
import { casinoAssetUrl, ORIGINAL_SYMBOLS } from './casinoOriginalArt';
import type { SpriteArt } from './casinoOriginalArt';
import { useAuth } from '../context/AuthContext';

const SYMBOLS = ['7','cherry','lemon','orange','grapes','watermelon','bell','star'];
const PATHS = [
 [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
 [0,0,1,0,0],[2,2,1,2,2],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0]
];
const MULTIPLIERS: Record<string, number[]> = {
 '7':[0,0,20,100,500],cherry:[0,0,2,10,40],lemon:[0,0,2,8,30],
 orange:[0,0,3,12,40],grapes:[0,0,3,15,50],watermelon:[0,0,4,20,70],
 bell:[0,0,5,25,100],star:[0,0,10,50,200]
};
type Grid = number[][];
const generate = (): Grid => Array.from({length:3},()=>Array.from({length:5},()=>Math.floor(Math.random()*8)));
function Sprite({id}:{id:number}) {
 const art:SpriteArt|undefined=ORIGINAL_SYMBOLS.sizzling?.[id];
 if(!art)return <span>{SYMBOLS[id]}</span>;
 if(!art.rect)return <img src={casinoAssetUrl(art.src)} alt={SYMBOLS[id]} className="h-full w-full object-contain"/>;
 const {x,y,w,h,atlasW,atlasH}=art.rect;
 return <div role="img" aria-label={SYMBOLS[id]} className="h-full w-full" style={{
 backgroundImage:'url("'+casinoAssetUrl(art.src)+'")',
 backgroundSize:atlasW/w*100+'% '+atlasH/h*100+'%',
 backgroundPosition:x/Math.max(1,atlasW-w)*100+'% '+y/Math.max(1,atlasH-h)*100+'%',
 backgroundRepeat:'no-repeat'}}/>;
}
function calculate(grid:Grid,lines:number,unit:number){
 let total=0;const cells=new Set<number>();const paid:number[]=[];
 PATHS.slice(0,lines).forEach((line,index)=>{
 const symbol=grid[line[0]][0];let count=1;
 for(let col=1;col<5;col++){if(grid[line[col]][col]!==symbol)break;count++;}
 const mult=MULTIPLIERS[SYMBOLS[symbol]]?.[count]??0;
 if(mult){total+=mult*unit;paid.push(index);for(let c=0;c<count;c++)cells.add(line[c]*5+c);}
 });
 return {total:Math.round(total*100)/100,cells:[...cells],paid};
}
const round=(v:number)=>Math.round(v*100)/100;
const fmt=(v:number)=>v.toFixed(2);
export default function SizzlingHotGame(){
 const {user}=useAuth();
 const storageKey='sizzling-deluxe-demo:'+String(user?.id??'guest');
 const [credits,setCredits]=useState(()=>{
   try{
     const stored=localStorage.getItem(storageKey);
     const value=stored===null?1000:Number(stored);
     return Number.isFinite(value)&&value>=0&&value<=1000000?value:1000;
   }catch{return 1000;}
 });
 const [lines,setLines]=useState(5);
 const [unit,setUnit]=useState(.2);
 const [grid,setGrid]=useState<Grid>(generate);
 const [win,setWin]=useState(0);
 const [winning,setWinning]=useState<number[]>([]);
 const [paid,setPaid]=useState<number[]>([]);
 const [spinning,setSpinning]=useState(false);
 const [auto,setAuto]=useState(false);
 const [sound,setSound]=useState(true);
 const [music,setMusic]=useState(false);
 const [full,setFull]=useState(false);
 const [message,setMessage]=useState('VENDOS BASTIN');
 const [stopped,setStopped]=useState<boolean[]>([true,true,true,true,true]);
 const [showLines,setShowLines]=useState(true);
 const [spins,setSpins]=useState(0);
 const area=useRef<HTMLDivElement>(null);
 const stoppedRef=useRef<boolean[]>([true,true,true,true,true]);
 const audio=useRef<AudioContext|null>(null);
 const timers=useRef<number[]>([]);
 const autoRef=useRef(false);
 const spinRef=useRef(false);
 const creditsRef=useRef(1000);
 const linesRef=useRef(lines);
 const unitRef=useRef(unit);
 const mounted=useRef(true);
 const musicTimer=useRef<number|null>(null);
 const rollingRef=useRef<number|null>(null);
 const soundRef=useRef(sound);
 soundRef.current=sound;
 const tone=useCallback((frequency:number,duration=.08,volume=.025)=>{
  if(!soundRef.current)return;
  try{
   const Ctx=window.AudioContext;
   if(!Ctx)return;
   if(!audio.current)audio.current=new Ctx();
   const ctx=audio.current;
   if(ctx.state==='suspended')void ctx.resume();
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(volume,ctx.currentTime);
   gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
   osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+duration);
  }catch{/* audio unavailable */}
 },[]);
 useEffect(()=>{linesRef.current=lines;},[lines]);
 useEffect(()=>{unitRef.current=unit;},[unit]);
 useEffect(()=>{creditsRef.current=credits;},[credits]);
 useEffect(()=>{
   try{localStorage.setItem(storageKey,String(credits));}catch{/* storage unavailable */}
 },[credits,storageKey]);
 useEffect(()=>{autoRef.current=auto;},[auto]);
 useEffect(()=>{
  const onFull=()=>setFull(!!document.fullscreenElement);
  document.addEventListener('fullscreenchange',onFull);
  return()=>document.removeEventListener('fullscreenchange',onFull);
 },[]);
 useEffect(()=>{
  if(!music){if(musicTimer.current!==null)window.clearInterval(musicTimer.current);return;}
  let note=0;
  const sequence=[220,261.63,329.63,392,329.63,261.63,196,246.94];
  musicTimer.current=window.setInterval(()=>{tone(sequence[note++%sequence.length],.19,.012);},280);
  return()=>{if(musicTimer.current!==null)window.clearInterval(musicTimer.current);};
 },[music,tone]);
 useEffect(()=>()=>{mounted.current=false;timers.current.forEach(window.clearTimeout);if(rollingRef.current!==null)window.clearInterval(rollingRef.current);if(audio.current)void audio.current.close();},[]);
 useEffect(()=>{
   if(!spinning)return;
   rollingRef.current=window.setInterval(()=>{
     setGrid(prev=>prev.map(row=>row.map((id,col)=>
       stoppedRef.current[col]?id:Math.floor(Math.random()*SYMBOLS.length))));
   },65);
   return()=>{if(rollingRef.current!==null)window.clearInterval(rollingRef.current);rollingRef.current=null;};
 },[spinning]);
 const later=(fn:()=>void,ms:number)=>{
   const id=window.setTimeout(()=>{
     timers.current=timers.current.filter(item=>item!==id);
     fn();
   },ms);
   timers.current.push(id);
 };
 const start=useCallback(()=>{
  const stake=round(linesRef.current*unitRef.current);
  if(spinRef.current||creditsRef.current+1e-6<stake){setAuto(false);autoRef.current=false;return;}
  stoppedRef.current=[false,false,false,false,false];
  setStopped([...stoppedRef.current]);
  spinRef.current=true;setSpinning(true);setWinning([]);setPaid([]);setWin(0);setMessage('DUKE RROTULLUAR...');
  setSpins(v=>v+1);
  creditsRef.current=round(creditsRef.current-stake);setCredits(creditsRef.current);
  const final=generate();
  tone(420,.1);
  for(let col=0;col<5;col++){
   later(()=>{
    if(!mounted.current)return;
    setGrid(prev=>prev.map((row,r)=>row.map((symbol,c)=>c===col?final[r][c]:symbol)));
    stoppedRef.current[col]=true;
    setStopped([...stoppedRef.current]);
    tone(270+col*60,.065);
   },780+col*245);
  }
  later(()=>{
   if(!mounted.current)return;
   const result=calculate(final,linesRef.current,unitRef.current);
   stoppedRef.current=[true,true,true,true,true];
   setStopped([...stoppedRef.current]);
   setGrid(final);setWinning(result.cells);setPaid(result.paid);setWin(result.total);
   creditsRef.current=round(creditsRef.current+result.total);setCredits(creditsRef.current);
   setMessage(result.total>0?'FITOVE '+fmt(result.total):'VENDOS BASTIN');
   if(result.total>0){tone(660,.24);later(()=>tone(880,.3),120);}
   spinRef.current=false;setSpinning(false);
   if(autoRef.current){
    if(creditsRef.current>=round(linesRef.current*unitRef.current))later(()=>{if(mounted.current&&autoRef.current)startRef.current();},600);
    else{autoRef.current=false;setAuto(false);}
   }
  },2080);
 },[tone]);
 const startRef=useRef(start);startRef.current=start;
 const toggleAuto=()=>{
   if(autoRef.current){autoRef.current=false;setAuto(false);return;}
   if(creditsRef.current+1e-6<round(linesRef.current*unitRef.current))return;
   autoRef.current=true;setAuto(true);
   if(!spinRef.current)start();
 };
 useEffect(()=>{
   const pause=()=>{if(document.hidden){autoRef.current=false;setAuto(false);}};
   document.addEventListener('visibilitychange',pause);
   return()=>document.removeEventListener('visibilitychange',pause);
 },[]);
 const adjustLines=(step:number)=>{if(!spinning)setLines(v=>Math.min(10,Math.max(1,v+step)));};
 const options=[.1,.2,.5,1,2,5];
 const adjustUnit=(step:number)=>{if(!spinning)setUnit(v=>options[Math.min(options.length-1,Math.max(0,options.indexOf(v)+step))]);};
 const toggleFullscreen=async()=>{if(!area.current)return;try{if(document.fullscreenElement)await document.exitFullscreen();else await area.current.requestFullscreen();}catch{/* unsupported */}};
 return <div ref={area} className="relative mx-auto w-full max-w-[1100px] overflow-hidden rounded-xl border-2 border-red-600 bg-[#190304] p-2 text-white shadow-[0_0_35px_#b91c1c66] sm:p-4"
 style={{backgroundImage:'linear-gradient(#260100a6,#170003e8),url("'+casinoAssetUrl('sizzling/background.webp')+'")',backgroundSize:'cover',backgroundPosition:'center'}}>
 <style>{`@keyframes sizzling-reel {0%{transform:translateY(-60%);filter:blur(6px)}70%{filter:blur(3px)}100%{transform:translateY(0);filter:blur(0)}} @keyframes sizzling-flash {0%,100%{box-shadow:inset 0 0 12px #ffe58c}50%{box-shadow:inset 0 0 28px #ffdf00,0 0 18px #ffd000}} .sizzling-roll{animation:sizzling-reel .24s linear infinite}.sizzling-win{animation:sizzling-flash .6s ease-in-out infinite}`}</style>
 <img src={casinoAssetUrl('sizzling/logo.png')} alt="Sizzling Hot Deluxe" className="mx-auto mb-3 max-h-24 w-auto max-w-[88%] object-contain drop-shadow-[0_3px_8px_#000]"/>
 <div className="mx-auto grid max-w-[790px] grid-cols-5 gap-1 rounded-xl border-[5px] border-yellow-600 bg-[#10080d] p-1 shadow-[0_0_18px_#ef4444] sm:gap-2 sm:p-2">
 {grid.flatMap((row,r)=>row.map((symbol,c)=><div key={r+'-'+c} className={'relative aspect-[1/1.07] overflow-hidden rounded-md border border-yellow-600/40 bg-gradient-to-b from-[#2b1628] to-[#080308] '+(winning.includes(r*5+c)?'sizzling-win':'')}>
 <div className={spinning&&frame%2===0?'sizzling-roll h-full w-full':'h-full w-full'}><Sprite id={symbol}/></div></div>))}
 </div>
 <div className="mx-auto mt-2 flex max-w-[790px] flex-wrap items-center justify-between gap-2 text-[11px] text-yellow-200 sm:text-sm">
 <span>LINJAT AKTIVE: {lines}</span><span>FITUES: {paid.length?paid.map(x=>x+1).join(', '):'—'}</span><span>{spinning?'RROTULLIM...':message}</span>
 </div>
 <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-red-700 bg-black/70 p-2 text-center sm:grid-cols-4">
 <div><div className="text-[10px] text-slate-300">LINJA</div><div className="flex items-center justify-center gap-1"><button disabled={spinning} onClick={()=>adjustLines(-1)} className="rounded bg-slate-700 px-3 py-1">−</button><strong>{lines}</strong><button disabled={spinning} onClick={()=>adjustLines(1)} className="rounded bg-slate-700 px-3 py-1">+</button></div></div>
 <div><div className="text-[10px] text-slate-300">BAST / LINJË</div><div className="flex items-center justify-center gap-1"><button disabled={spinning} onClick={()=>adjustUnit(-1)} className="rounded bg-slate-700 px-3 py-1">−</button><strong>{fmt(unit)}</strong><button disabled={spinning} onClick={()=>adjustUnit(1)} className="rounded bg-slate-700 px-3 py-1">+</button></div></div>
 <div><div className="text-[10px] text-slate-300">BASTI TOTAL</div><strong className="text-yellow-300">{fmt(round(lines*unit))}</strong></div>
 <div><div className="text-[10px] text-slate-300">FITIMI</div><strong className="text-yellow-300">{fmt(win)}</strong></div>
 </div>
 <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
 <div className="rounded-lg border border-yellow-600 bg-black/80 px-4 py-2 text-center"><span className="block text-[10px]">KREDITE DEMO</span><strong className="text-lg text-yellow-300">{fmt(credits)}</strong></div>
 <button disabled={spinning||auto} onClick={()=>{setLines(10);setUnit(5);}} className="rounded-lg border border-white/20 bg-slate-800 px-3 py-3 text-xs font-bold disabled:opacity-50">MAX BET</button>
 <button disabled={spinning||auto||credits<round(lines*unit)} onClick={start} className="min-w-28 rounded-xl border-2 border-green-300 bg-gradient-to-b from-green-500 to-green-900 px-5 py-3 text-xl font-black shadow-[0_0_12px_#16a34a] disabled:opacity-50">SPIN</button>
 <button onClick={toggleAuto} className={'rounded-lg border px-4 py-3 text-sm font-bold '+(auto?'border-red-300 bg-red-800':'border-blue-400 bg-blue-900')}>{auto?'STOP AUTO':'AUTO PLAY'}</button>
 <button onClick={()=>{setAuto(false);autoRef.current=false;setCredits(1000);creditsRef.current=1000;}} disabled={spinning} className="rounded-lg border border-white/20 bg-slate-800 px-3 py-3 text-xs">RIMBUSH</button>
 <button onClick={()=>setSound(v=>!v)} aria-label="Efektet zanore" className="rounded-lg bg-slate-800 p-3">{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
 <button onClick={()=>setMusic(v=>!v)} aria-label="Muzika" className={'rounded-lg p-3 '+(music?'bg-green-800':'bg-slate-800')}><Music2 size={19}/></button>
 <button onClick={toggleFullscreen} aria-label="Ekran i plotë" className="rounded-lg bg-slate-800 p-3">{full?<Minimize size={19}/>:<Maximize size={19}/>}</button>
 </div>
 <div className="mt-3 rounded-lg bg-black/65 p-3 text-xs text-slate-200">
 <strong className="text-yellow-300">TABELA E PAGESAVE DEMO</strong>
 <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{SYMBOLS.map((symbol,i)=><div key={symbol} className="rounded border border-white/10 p-2"><span className="font-semibold">{symbol.toUpperCase()}</span><div>3: {MULTIPLIERS[symbol][2]}× · 4: {MULTIPLIERS[symbol][3]}× · 5: {MULTIPLIERS[symbol][4]}×</div></div>)}</div>
 <p className="mt-2">10 linja të mundshme, fitoret llogariten nga e majta në të djathtë. Pagesat dhe muzika janë demonstrim i pavarur, jo matematikë apo audio zyrtare e prodhuesit. Pa para reale.</p>
 </div>
 </div>;
}
