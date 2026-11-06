import {useCallback,useState} from 'react';
import {apiClient} from '../../api/client';
import {AlertTriangle,Database,Link2,RefreshCw,Search,ShieldCheck} from 'lucide-react';

type Shape={topLevelKeys:string[];paths:string[];hasEventLikePath:boolean};
type ProbeSource={source:string;ok:boolean;shape?:Shape;error?:string;httpStatus?:number};
type Probe={matchId:number;status:string;mappingStatus?:string;needs:string[];sources:ProbeSource[];checkedAt?:string};
type Fixture={
 match:null|{matchId:number;home:string;away:string;startAt:string;football:boolean};
 mapping:null|{match_id:number;aiscore_id:string|null;thesports01_id:string|null;
 mapping_status:string;last_checked_at:string|null;last_error:string|null};
 needs:string[];snapshots:{source:string;observedAt:string;shape:Shape}[];
};
const fmt=(value:string|null|undefined)=>value?new Date(value).toLocaleString('sq-AL',{dateStyle:'short',timeStyle:'short'}):'—';
export default function FootballInformationPanel(){
 const [matchId,setMatchId]=useState(''),[aiId,setAiId]=useState(''),[sportsId,setSportsId]=useState('');
 const [fixture,setFixture]=useState<Fixture|null>(null),[probe,setProbe]=useState<Probe|null>(null);
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async(id:string)=>{
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<=0)throw Error('Vendos ID-në e ndeshjes në faqen kryesore.');
  const {data}=await apiClient.get<Fixture>('/admin/football-information/fixture',{params:{matchId:n}});
  setFixture(data);setAiId(data.mapping?.aiscore_id??'');setSportsId(data.mapping?.thesports01_id??'');
  return data;
 },[]);
 const check=async()=>{
  if(busy)return;setBusy(true);setError('');setMessage('');setProbe(null);
  try{await load(matchId);}catch(e:any){setFixture(null);setError(e.response?.data?.message??e.message??'Nuk u gjet ndeshja.');}
  finally{setBusy(false);}
 };
 const bind=async()=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   await apiClient.post('/admin/football-information/map',{matchId:Number(matchId),aiscoreId:aiId,thesports01Id:sportsId});
   await load(matchId);setProbe(null);
   setMessage('ID-të e burimeve u lidhën me ndeshjen. Lidhja është ende e PAVERIFIKUAR për shlyerje reale.');
  }catch(e:any){setError(e.response?.data?.message??'Lidhja nuk u ruajt.');}finally{setBusy(false);}
 };
 const run=async()=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{const {data}=await apiClient.post<Probe>('/admin/football-information/probe',{matchId:Number(matchId)});
   setProbe(data);await load(matchId);
  }catch(e:any){setError(e.response?.data?.message??'Kontrolli i burimeve dështoi.');}
  finally{setBusy(false);}
 };
 const available=fixture?.needs?.length??0;
 return <section className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-6">
  <header className="rounded-2xl border border-tertiary bg-secondary p-5">
   <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
    <ShieldCheck size={15}/> Vetëm informacion · Vetëm futboll
   </div>
   <h2 className="mt-3 text-xl font-black text-white">AiScore + TheSports01</h2>
   <p className="mt-2 max-w-3xl text-sm text-text-secondary">Lidhi ID-të e ndeshjes nga burimet e jashtme me ID-në e ndeshjes së faqes. Serveri kontrollon vetëm kategoritë për të cilat ekzistojnë bileta sportive në pritje nga API-ja kryesore. Nuk krijon tregje dhe nuk shlyen bileta.</p>
  </header>
  <section className="rounded-xl border border-tertiary bg-secondary p-4">
   <div className="grid gap-3 sm:grid-cols-3">
    <label className="block text-xs text-text-secondary">ID e ndeshjes në faqja
     <input type="number" min={1} value={matchId} onChange={e=>{setMatchId(e.target.value);setFixture(null);setProbe(null);}}
      placeholder="ID nga API-ja kryesore" className="mt-1 min-h-11 w-full rounded-lg border border-tertiary bg-primary px-3 text-sm text-white"/>
    </label>
    <label className="block text-xs text-text-secondary">AiScore match ID
     <input value={aiId} onChange={e=>setAiId(e.target.value)} placeholder="j374oi0xz04sgqo"
      className="mt-1 min-h-11 w-full rounded-lg border border-tertiary bg-primary px-3 text-sm text-white"/>
    </label>
    <label className="block text-xs text-text-secondary">TheSports01 ID
     <input value={sportsId} onChange={e=>setSportsId(e.target.value)} placeholder="4578950"
      className="mt-1 min-h-11 w-full rounded-lg border border-tertiary bg-primary px-3 text-sm text-white"/>
    </label>
   </div>
   <div className="mt-3 flex flex-wrap gap-2">
    <button type="button" disabled={busy||!matchId} onClick={()=>void check()}
     className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-tertiary bg-primary px-3 text-sm text-white disabled:opacity-50">
     <Search size={16}/> Gjej ndeshjen
    </button>
    <button type="button" disabled={busy||!matchId||(!aiId&&!sportsId)} onClick={()=>void bind()}
     className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-tertiary bg-primary px-3 text-sm text-white disabled:opacity-50">
     <Link2 size={16}/> Ruaj lidhjen
    </button>
    <button type="button" disabled={busy||!matchId||!fixture?.mapping||available===0} onClick={()=>void run()}
     className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-bold text-slate-950 disabled:opacity-50">
     <RefreshCw size={16}/> Kontrollo burimet
    </button>
   </div>
   {error&&<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
   {message&&<p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
  </section>
  {fixture&&<div className="grid gap-3 md:grid-cols-2">
   <div className="rounded-xl border border-tertiary bg-secondary p-4">
    <h3 className="font-bold text-white">Ndeshja kryesore</h3>
    {fixture.match?<><p className="mt-2 text-sm">{fixture.match.home} – {fixture.match.away}</p>
     <p className="text-xs text-text-secondary">{fmt(fixture.match.startAt)} · {fixture.match.football?'Futboll':'Sport i pakonfirmuar'}</p></>:
     <p className="mt-2 text-sm text-amber-300">ID nuk u gjet në ndeshjet aktive.</p>}
    <p className="mt-3 text-xs text-text-secondary">Statusi: {fixture.mapping?.mapping_status??'Pa lidhje'} · Kontrolli i fundit: {fmt(fixture.mapping?.last_checked_at)}</p>
    {fixture.mapping?.last_error&&<p className="mt-1 break-words text-xs text-amber-300">{fixture.mapping.last_error}</p>}
   </div>
   <div className="rounded-xl border border-tertiary bg-secondary p-4">
    <h3 className="font-bold text-white">Tregjet që kërkojnë informacion</h3>
    <p className="mt-1 text-xs text-text-secondary">Llogaritur vetëm nga përzgjedhjet reale aktive të API-së kryesore.</p>
    <div className="mt-3 flex flex-wrap gap-2">
     {fixture.needs.length?fixture.needs.map(k=><span key={k} className="rounded-full border border-tertiary px-2 py-1 text-xs">{k}</span>):
      <span className="text-sm text-amber-300">Nuk ka bileta në pritje për të kërkuar informacion nga burimi i dytë.</span>}
    </div>
   </div>
  </div>}
  {(probe||Boolean(fixture?.snapshots?.length))&&<section className="rounded-xl border border-tertiary bg-secondary p-4">
   <div className="flex items-center justify-between gap-2">
    <h3 className="font-bold text-white">Përgjigjet dhe struktura JSON</h3>
    {probe&&<span className="text-xs text-text-secondary">{fmt(probe.checkedAt)}</span>}
   </div>
   {probe&&<p className="mt-2 text-xs text-text-secondary">Statusi: {probe.status}. Emrat e fushave janë kandidatë për analizë, jo prova të certifikuara për pagesë.</p>}
   <div className="mt-3 space-y-2">
    {(probe?.sources??fixture?.snapshots?.map(x=>({source:x.source,ok:true,shape:x.shape}))??[]).map(item=><details key={item.source} className="rounded-lg border border-tertiary bg-primary p-3">
     <summary className="flex cursor-pointer items-center gap-2 text-sm"><Database size={15}/>
      <span className="flex-1 font-semibold">{item.source}</span>
      <span className={item.ok?'text-emerald-300':'text-amber-300'}>
       {item.ok?'JSON u mor':item.error??'Nuk u mor'}</span>
     </summary>
     <div className="mt-3 space-y-2 text-xs text-text-secondary">
      {item.shape?<><p>Fushat kryesore: {item.shape.topLevelKeys.join(', ')||'Asnjë'}</p>
       <p>Rrugë JSON të mundshme:</p>
       <div className="max-h-52 overflow-y-auto rounded-lg border border-tertiary p-2 font-mono break-all">{item.shape.paths.join(' · ')}</div>
       <p>Fushë që i ngjan një ngjarjeje: {item.shape.hasEventLikePath?'Po, ende e paverifikuar':'Nuk u identifikua'}</p></>:
       <p>Burimi nuk dha përgjigje të lexueshme ose kërkon autorizim; nuk u supozuan gola, kornera apo kartona.</p>}
     </div>
    </details>)}
   </div>
  </section>}
  <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-secondary p-3 text-xs text-text-secondary">
   <AlertTriangle size={18} className="shrink-0 text-amber-300"/>
   <p>Aktivizimi i mbledhjes automatike kërkon <code>AISCORE_INFO_ENABLED=true</code> në backend. Një API që përgjigjet me 403/429 nuk anashkalohet me cookies të kopjuara. Kronologjia, minutat, assist-et dhe identitetet duhen verifikuar përpara lidhjes me shlyerjen financiare.</p>
  </div>
 </section>;
}
