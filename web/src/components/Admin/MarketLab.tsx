import {useCallback,useEffect,useMemo,useState} from 'react';
import {apiClient} from '../../api/client';
import RealMoneyMarketLab from './RealMoneyMarketLab';
import {Activity,CheckCircle2,AlertTriangle,Clock3,RefreshCcw,Play,Search,ShieldCheck,Info,ChevronDown,ChevronUp} from 'lucide-react';

type TestStatus='PENDING'|'OBSERVED'|'PASS'|'FAIL'|'INCONCLUSIVE';
type TestCase={
 id:string;run_id:string;match_id:number;match_name:string;market_name:string;market_line:string;
 outcome_name:string;odds:number|null;contract:{kind:string;event:string;from?:number;to?:number;target?:number;threshold?:number};
 status:TestStatus;engine_status:string|null;stitch_status:string|null;
 evidence:{reason?:string;frameAt?:string};opened_at:string;last_checked_at:string|null;
};
type Run={id:string;started_at:string;finished_at:string|null;requested_matches:number;selected_matches:number;coverage:Record<string,{created:number;available:boolean}>;cases:number;passed:number;failed:number;inconclusive:number;pending:number;observed:number};
type Report={mode:string;runs:Run[];cases:TestCase[]};
const statusText:Record<TestStatus,string>={PENDING:'Në pritje',OBSERVED:'Ngjarja u konstatua',PASS:'Përputhet',FAIL:'Gabim / mospërputhje',INCONCLUSIVE:'Prova të pamjaftueshme'};
const statusStyle:Record<TestStatus,string>={
 PASS:'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
 FAIL:'bg-rose-500/10 text-rose-300 border-rose-500/30',
 INCONCLUSIVE:'bg-amber-500/10 text-amber-300 border-amber-500/30',
 PENDING:'bg-slate-600/20 text-slate-300 border-slate-500/30',
 OBSERVED:'bg-sky-500/10 text-sky-300 border-sky-500/30'
};
const reasonText:Record<string,string>={
 ENGINE_STITCH_MISMATCH:'Llogaritja e motorit dhe kontrolli i dytë nuk përputhen.',
 INDEPENDENT_CHECK_AGREES:'Kontrolli i dytë përputhet me rezultatin e motorit.',
 RECOVERY_REQUIRED:'Gjatë ndeshjes mungon historiku; nevojitet rikuperim nga API rezervë.',
 AWAITING_FINAL_CROSSCHECK:'Ngjarja u identifikua, por duhet kontrolli përfundimtar.',
 MATCH_IN_PROGRESS:'Ndeshja nuk ka përfunduar ose kushti ende nuk është vendosur.',
 FRAME_MISSING_OR_STALE:'Mungon snapshot-i i besueshëm pas vendosjes së testit.',
 INCOMPLETE_PROVIDER_EVIDENCE:'API-ja nuk siguroi kronologjinë ose statistikat e mjaftueshme.'
};
const marketNames:Record<string,string>={
 'next-goal':'Goli i radhës','numbered-goal':'Goli 1/2/3…','next-corner':'Korneri i radhës',
 'race-corners':'Gara deri në X kornera','goal-window':'Intervale golash',
 'corner-window':'Intervale kornerash','card-window':'Intervale kartonësh',
 'foul-window':'Intervale faullesh','over-under':'Lart / Poshtë',
 exact:'Ekzakt',range:'Nga – Deri'
};
const fmt=(v:string|null)=>v?new Date(v).toLocaleString('sq-AL',{dateStyle:'short',timeStyle:'short'}):'—';
const states:(TestStatus|'ALL')[]=['ALL','PENDING','OBSERVED','PASS','FAIL','INCONCLUSIVE'];

function VirtualMarketLab(){
 const [report,setReport]=useState<Report>({mode:'VIRTUAL_ONLY_NO_WALLET',runs:[],cases:[]});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [count,setCount]=useState(8),[activeRun,setActiveRun]=useState<string|null>(null);
 const [filter,setFilter]=useState<TestStatus|'ALL'>('ALL'),[search,setSearch]=useState('');
 const [expanded,setExpanded]=useState<string|null>(null);
 const load=useCallback(async()=>{
  try{const {data}=await apiClient.get<Report>('/admin/market-lab',{params:{limit:12}});
   setReport({mode:data.mode,runs:data.runs??[],cases:data.cases??[]});
   setError('');setActiveRun(old=>old??data.runs?.[0]?.id??null);
  }catch(e:any){setError(e.response?.data?.message??'Raporti i testeve LIVE nuk u ngarkua.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();const id=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(id);},[load]);
 const start=async()=>{
  if(busy)return;setBusy(true);setMessage('');setError('');
  try{
   const {data}=await apiClient.post('/admin/market-lab/runs',{matchCount:count});
   setActiveRun(data.runId);
   setFilter('ALL');setSearch('');
   setMessage(data.alreadyRunning?'Një test sapo është nisur. Po shfaqet raporti i tij.':
    data.created?String(data.created)+' bileta virtuale u krijuan nga ndeshjet dhe tregjet LIVE reale.':
    'Nuk u gjetën tregje të mbështetura në ndeshjet e zgjedhura. Raporti ruan mungesat.');
   await load();
  }catch(e:any){setError(e.response?.data?.message??'Nisja e testit dështoi.');}
  finally{setBusy(false);}
 };
 const refresh=async()=>{
  if(busy)return;setBusy(true);
  try{await apiClient.post('/admin/market-lab/refresh');await load();}
  catch(e:any){setError(e.response?.data?.message??'Verifikimi nuk u përfundua.');}
  finally{setBusy(false);}
 };
 const run=report.runs.find(r=>r.id===activeRun)??report.runs[0];
 const displayed=useMemo(()=>report.cases.filter(item=>(!run||item.run_id===run.id)&&
  (filter==='ALL'||item.status===filter)&&
  (!search.trim()||[item.match_name,item.market_name,item.outcome_name,String(item.match_id)].some(t=>t.toLowerCase().includes(search.trim().toLowerCase())))),[report.cases,run,filter,search]);
 return <section className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-6" aria-label="Laboratori i tregjeve live">
  <header className="rounded-2xl border border-tertiary bg-secondary/80 p-5 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="space-y-2">
     <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300"><ShieldCheck size={14}/> Simulim, pa para reale</div>
     <h2 className="text-xl font-black text-white sm:text-2xl">Laboratori LIVE i tregjeve</h2>
     <p className="max-w-2xl text-sm text-text-secondary">Stitch provon tregjet e ofruara nga API-ja me bileta virtuale. Testet vazhdojnë në server edhe kur mbyll panelin. Nuk preken përdoruesit, biletat reale apo bilancet.</p>
    </div>
    <div className="flex flex-wrap items-end gap-2">
     <label className="text-xs font-semibold text-text-secondary">Ndeshje LIVE
      <select aria-label="Numri i ndeshjeve për testim" className="mt-1 block min-h-10 w-28 rounded-lg border border-tertiary bg-primary px-2 text-white" value={count} onChange={e=>setCount(Number(e.target.value))}>
       {[3,5,8,12].map(n=><option key={n} value={n}>{n}</option>)}
      </select>
     </label>
     <button type="button" onClick={()=>void start()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-slate-950 disabled:opacity-50"><Play size={16}/> Testo tregjet</button>
     <button type="button" onClick={()=>void refresh()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-tertiary px-3 text-sm text-white disabled:opacity-50"><RefreshCcw size={16}/> Kontrollo tani</button>
    </div>
   </div>
  </header>
  {error&&<p className="rounded-lg border border-rose-500/30 p-3 text-sm text-rose-300" role="alert">{error}</p>}
  {message&&<p className="rounded-lg border border-emerald-500/30 p-3 text-sm text-emerald-300" role="status">{message}</p>}
  {loading?<p>Duke ngarkuar testet…</p>:report.runs.length===0?
   <div className="rounded-xl border border-dashed border-tertiary bg-secondary p-8 text-center text-text-secondary"><Activity className="mx-auto mb-3" size={30}/><p>Nuk ka ende teste të krijuara. Nise laboratorin nga butoni lart.</p></div>:
   <>
    <div className="flex flex-wrap items-center gap-3">
     <label className="text-xs text-text-secondary">Seanca e testimit
      <select className="mt-1 block min-h-10 max-w-full rounded-lg border border-tertiary bg-secondary px-3 text-sm text-white" value={run?.id??''} onChange={e=>{setActiveRun(e.target.value);setExpanded(null);}}>
       {report.runs.map(item=><option value={item.id} key={item.id}>{fmt(item.started_at)} · {item.cases} teste</option>)}
      </select>
     </label>
     <div className="self-end pb-2 text-xs text-text-secondary">{run?.finished_at?'Përfundoi: '+fmt(run.finished_at):'Serveri po monitoron'}</div>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
     {([
      {label:'Gjithsej',num:run?.cases??0,icon:Activity},
      {label:'PASS',num:run?.passed??0,icon:CheckCircle2},
      {label:'FAIL',num:run?.failed??0,icon:AlertTriangle},
      {label:'Pa prova',num:run?.inconclusive??0,icon:Info},
      {label:'Në ndjekje',num:(run?.pending??0)+(run?.observed??0),icon:Clock3},
     ]).map(item=><div key={item.label} className="rounded-xl border border-tertiary bg-secondary px-4 py-3"><div className="flex items-center justify-between text-xs text-text-secondary"><span>{item.label}</span><item.icon size={15}/></div><p className="mt-2 text-2xl font-black tabular-nums text-white">{item.num}</p></div>)}
    </div>
    <section className="rounded-xl border border-tertiary bg-secondary p-4">
     <h3 className="mb-3 text-sm font-bold text-white">Mbulimi i tregjeve reale</h3>
     <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(run?.coverage??{}).map(([group,value])=><div key={group} className="flex items-center justify-between gap-2 rounded-lg border border-tertiary bg-primary/50 px-3 py-2 text-xs">
       <span>{marketNames[group]??group}</span>
       <span className={value.available?'text-emerald-300':'text-amber-300'}>{value.available?value.created+' teste':'Nuk u ofrua'}</span>
      </div>)}
     </div>
    </section>
    <section className="overflow-hidden rounded-xl border border-tertiary bg-secondary">
     <div className="flex flex-wrap items-center gap-3 border-b border-tertiary p-3">
      <div className="relative min-w-[180px] flex-1">
       <Search size={16} className="absolute left-3 top-3 text-text-secondary"/>
       <input className="min-h-10 w-full rounded-lg border border-tertiary bg-primary pl-10 pr-3 text-sm text-white" aria-label="Kërko testet" placeholder="Ndeshje, treg, përzgjedhje ose ID" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <select aria-label="Filtro sipas rezultatit" className="min-h-10 rounded-lg border border-tertiary bg-primary px-3 text-sm text-white" value={filter} onChange={e=>setFilter(e.target.value as TestStatus|'ALL')}>
       {states.map(status=><option key={status} value={status}>{status==='ALL'?'Të gjitha':statusText[status]}</option>)}
      </select>
     </div>
     {!displayed.length?<p className="p-6 text-sm text-text-secondary">Asnjë përzgjedhje për filtrat e zgjedhur.</p>:
      <div className="max-h-[640px] overflow-auto" role="region" aria-label="Rezultatet e testeve" tabIndex={0}>
       <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="sticky top-0 bg-[#172231] text-slate-300"><tr className="[&_th]:px-3 [&_th]:py-3"><th>Ndeshja</th><th>Tregu</th><th>Rezultati</th><th>Motori</th><th>Stitch</th><th>Provat</th></tr></thead>
        <tbody>{displayed.map(item=><>
         <tr key={item.id} className="border-t border-tertiary/70 [&_td]:px-3 [&_td]:py-3">
          <td><span className="block font-bold text-white">{item.match_name}</span><span className="text-text-secondary">#{item.match_id} · {fmt(item.opened_at)}</span></td>
          <td><span className="block font-medium">{item.market_name} {item.market_line}</span><span className="text-text-secondary">{item.outcome_name} · @{item.odds??'—'}</span></td>
          <td><span className={'inline-flex rounded-full border px-2 py-1 font-bold '+statusStyle[item.status]}>{statusText[item.status]}</span></td>
          <td className="font-bold">{item.engine_status??'—'}</td><td className="font-bold">{item.stitch_status??'—'}</td>
          <td><button type="button" className="inline-flex items-center gap-1 text-emerald-300" aria-expanded={expanded===item.id} onClick={()=>setExpanded(old=>old===item.id?null:item.id)}>Detaje {expanded===item.id?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button></td>
         </tr>
         {expanded===item.id&&<tr key={item.id+'-details'}><td colSpan={6} className="border-t border-tertiary bg-primary/60 px-4 py-4">
          <p className="text-sm">{reasonText[item.evidence?.reason??'']??item.evidence?.reason??'Nuk ka ende vendim.'}</p>
          <p className="mt-2 text-xs text-text-secondary">Kushti: {item.contract.kind} · {item.contract.event} · {item.contract.from!=null?'Minutat '+item.contract.from+'–'+item.contract.to:item.contract.target!=null?'Objektivi '+item.contract.target:item.contract.threshold!=null?'Pragu '+item.contract.threshold:'Sipas tregut'}</p>
          <p className="mt-1 text-xs text-text-secondary">Përditësimi: {fmt(item.last_checked_at)} · Burimi: {fmt(item.evidence?.frameAt??null)}</p>
         </td></tr>}
        </>)}</tbody>
       </table>
      </div>}
    </section>
   </>}
  <p className="text-xs text-text-secondary">PASS kërkon përputhje të dy kontrolleve; INCONCLUSIVE tregon mungesë prove, jo bast të pavlefshëm. Rezultatet janë virtuale. Përdoruesit dhe kuletat reale nuk preken.</p>
 </section>;
}

/** Real accepted bets are the default. Existing no-money diagnostics remain
 * available as a separate, explicitly labelled simulation mode. */
export default function MarketLab(){
 const [mode,setMode]=useState<'real'|'virtual'>('real');
 return <div className="space-y-3">
  <nav aria-label="Modaliteti i testimit të tregjeve" className="mx-auto flex max-w-7xl gap-2 px-3 pt-3 sm:px-6">
   <button type="button" aria-pressed={mode==='real'} onClick={()=>setMode('real')}
    className={'min-h-11 rounded-lg px-4 text-sm font-bold '+(mode==='real'?'bg-amber-400 text-slate-950':'border border-tertiary bg-secondary text-white')}>
    Baste me para reale
   </button>
   <button type="button" aria-pressed={mode==='virtual'} onClick={()=>setMode('virtual')}
    className={'min-h-11 rounded-lg px-4 text-sm font-bold '+(mode==='virtual'?'bg-emerald-400 text-slate-950':'border border-tertiary bg-secondary text-white')}>
    Simulime pa para
   </button>
  </nav>
  {mode==='real'?<RealMoneyMarketLab/>:<VirtualMarketLab/>}
 </div>;
}
