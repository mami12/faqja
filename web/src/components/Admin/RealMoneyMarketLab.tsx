import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {apiClient} from '../../api/client';
import {AlertTriangle,CheckCircle2,Clock3,Landmark,Play,RefreshCcw,Search,ShieldAlert,Ticket} from 'lucide-react';

type RealRun={id:string;created_at:string;stake_per_ticket:string;requested_tickets:number;
 selected_matches:number;coverage:Record<string,{available:boolean;selected:number}>;
 cases:number;queued:number;placed:number;rejected:number;passed:number;mismatched:number;
 unsettled:number;missing_evidence:number;debited:string;paid_back:string};
type RealCase={id:string;run_id:string;match_name:string;match_id:number;market_name:string;
 outcome_name:string;quoted_odds:string;placement_status:'QUEUED'|'PLACING'|'PLACED'|'REJECTED';
 ticket_id:string|null;ticket_status:string|null;line_status:string|null;
 expected_status:string|null;audit_status:string;audit_reason:string|null;
 rejected_reason:string|null;rejected_code:string|null;
 actual_stake:string|null;actual_payout:string|null;actual_odds:string|null;ticket_placed_at:string|null};
type RealReport={mode:'REAL_MONEY';adminBalance:number;currency:string;runs:RealRun[];cases:RealCase[]};
const formatted=new Intl.NumberFormat('sq-AL',{maximumFractionDigits:2});
const date=v=>v?new Date(v).toLocaleString('sq-AL',{dateStyle:'short',timeStyle:'short'}):'—';
const auditLabels:Record<string,string>={PASS:'PASS',MISMATCH:'Gabim',UNSETTLED:'Pa shlyer',
 NO_EVIDENCE:'Mungojnë provat',IN_PROGRESS:'Ndeshje live',WAITING:'Në pritje'};
const auditStyle:Record<string,string>={PASS:'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
 MISMATCH:'border-rose-500/40 bg-rose-500/10 text-rose-300',
 UNSETTLED:'border-amber-500/40 bg-amber-500/10 text-amber-300',
 NO_EVIDENCE:'border-amber-500/40 bg-amber-500/10 text-amber-300',
 IN_PROGRESS:'border-slate-600 bg-slate-500/10 text-slate-300',
 WAITING:'border-slate-600 bg-slate-500/10 text-slate-300'};
const reasons:Record<string,string>={
 REAL_PAYOUT_AND_INDEPENDENT_RESULT_AGREE:'Shlyerja reale dhe rezultati i pavarur përputhen.',
 ACTUAL_TICKET_DIFFERS_FROM_VERIFIED_RESULT:'Vendimi i kuletës ose biletës nuk përputhet me provat.',
 MATCH_FINISHED_STILL_PENDING:'Ndeshja ka përfunduar, por bileta nuk është shlyer ende.',
 PROVIDER_EVIDENCE_INCOMPLETE:'Burimi real nuk ka kronologjinë/statistikat e plota.',
 RECOVERY_REQUIRED:'Mungojnë ngjarje nga ndërprerja e lidhjes. Duhet API rezervë.',
 MATCH_LIVE:'Ndeshja vazhdon. Bileta mbetet në pritje të përfundimit.'
};

export default function RealMoneyMarketLab(){
 const [report,setReport]=useState<RealReport>({mode:'REAL_MONEY',adminBalance:0,currency:'LEK',runs:[],cases:[]});
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [stake,setStake]=useState(100),[ticketCount,setTicketCount]=useState(6);
 const [accepted,setAccepted]=useState(false),[phrase,setPhrase]=useState('');
 const [runId,setRunId]=useState<string|null>(null),[search,setSearch]=useState('');
 const [showOnlyProblems,setShowOnlyProblems]=useState(false);
 const requestKey=useRef<string|null>(null);
 const load=useCallback(async()=>{
  try{const {data}=await apiClient.get<RealReport>('/admin/market-lab/real',{params:{limit:12}});
   setReport(data);setRunId(old=>old??data.runs?.[0]?.id??null);setError('');
  }catch(e:any){setError(e.response?.data?.message??'Raporti i basteve reale nuk u ngarkua.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();const id=window.setInterval(()=>void load(),12000);
  return()=>window.clearInterval(id);},[load]);
 const selected=report.runs.find(r=>r.id===runId)??report.runs[0];
 const selectedCases=useMemo(()=>report.cases.filter(c=>(!selected||c.run_id===selected.id)&&
  (!showOnlyProblems||c.audit_status==='MISMATCH'||c.audit_status==='UNSETTLED'||
   c.audit_status==='NO_EVIDENCE'||c.placement_status==='REJECTED')&&
  (!search.trim()||[c.match_name,c.market_name,c.outcome_name,c.ticket_id??'',String(c.match_id)]
   .some(x=>x.toLowerCase().includes(search.trim().toLowerCase())))),[report.cases,selected,search,showOnlyProblems]);
 const budget=stake*ticketCount;
 const valid=Number.isInteger(stake)&&stake>=100&&stake<=1000&&Number.isInteger(ticketCount)&&
  ticketCount>=1&&ticketCount<=20&&budget<=20000;
 const start=async()=>{
  if(busy||!valid||!accepted||phrase.trim().toUpperCase()!=='REAL')return;
  setBusy(true);setNotice('');setError('');
  const id=requestKey.current??crypto.randomUUID();requestKey.current=id;
  try{
   const {data}=await apiClient.post('/admin/market-lab/real-runs',{
    stakePerTicket:stake,ticketCount,requestId:id
   });
   requestKey.current=null;setRunId(data.runId);setAccepted(false);setPhrase('');
   setNotice(data.existing?'Kjo kërkesë ekziston tashmë. Asnjë biletë nuk u dublua.':
    data.queued>0?'U regjistruan '+data.queued+' përzgjedhje për baste REALE. Serveri po përdor kuotat dhe bilancin real.':
    'Nuk u gjetën tregje live të mbështetura. Asnjë lek nuk u zbrit.');
   await load();
  }catch(e:any){setError(e.response?.data?.message??'Nisja dështoi. Nuk do të krijohet një kërkesë e re nëse e provon sërish.');}
  finally{setBusy(false);}
 };
 const refresh=async()=>{
  if(busy)return;setBusy(true);
  try{await apiClient.post('/admin/market-lab/real-check');await load();}
  catch(e:any){setError(e.response?.data?.message??'Rikontrolli dështoi.');}
  finally{setBusy(false);}
 };
 return <section aria-label="Testet me para reale" className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-6">
  <header className="rounded-2xl border border-amber-500/40 bg-secondary p-5">
   <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200"><Landmark size={14}/> PARA REALE · API REALE</div>
   <h2 className="text-xl font-black text-white">Testim i tregjeve me bileta dhe shlyerje reale</h2>
   <p className="mt-2 max-w-3xl text-sm text-text-secondary">Biletat vendosen nga <strong>bilanci i administratorit</strong> përmes motorit të zakonshëm të basteve, me koeficientë të verifikuar në server. Fitimet, humbjet dhe biletat në pritje janë reale. Fondet e lojtarëve nuk përdoren.</p>
   <div className="mt-4 flex flex-wrap items-end gap-3">
    <div className="rounded-xl border border-tertiary bg-primary p-3 text-sm">
     <p className="text-xs text-text-secondary">Bilanci aktual Admin</p>
     <p className="font-black text-white">{formatted.format(report.adminBalance)} {report.currency}</p>
    </div>
    <label className="text-xs font-bold text-text-secondary">LEK për biletë
     <input type="number" min={100} max={1000} step={100} value={stake}
      onChange={e=>{setStake(Number(e.target.value));requestKey.current=null;}}
      className="mt-1 block min-h-11 w-36 rounded-lg border border-tertiary bg-primary px-3 text-sm text-white"/>
    </label>
    <label className="text-xs font-bold text-text-secondary">Bileta maksimale
     <input type="number" min={1} max={20} step={1} value={ticketCount}
      onChange={e=>{setTicketCount(Number(e.target.value));requestKey.current=null;}}
      className="mt-1 block min-h-11 w-36 rounded-lg border border-tertiary bg-primary px-3 text-sm text-white"/>
    </label>
    <div className="rounded-lg border border-amber-500/30 p-3 text-sm"><span className="block text-xs text-text-secondary">Shuma maksimale që mund të zbritet</span><strong>{formatted.format(budget)} LEK</strong></div>
   </div>
   {!valid&&<p className="mt-3 text-sm text-rose-300">Minimumi 100 LEK, maksimumi 1000 LEK për biletë, 20 bileta dhe 20 000 LEK për test.</p>}
   <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-white">
    <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-1"/>
    <span>E konfirmoj që këto janë baste me <strong>para reale</strong>, që bilanci im mund të ulet dhe rezultati mund të jetë humbje. Nuk kërkoj anulim automatik të rezultateve.</span>
   </label>
   <div className="mt-3 flex flex-wrap items-end gap-2">
    <label className="text-xs text-text-secondary">Shkruaj REAL për të autorizuar vendosjen
     <input value={phrase} onChange={e=>setPhrase(e.target.value)} placeholder="REAL"
      className="mt-1 block min-h-11 w-40 rounded-lg border border-tertiary bg-primary px-3 text-sm text-white"/>
    </label>
    <button type="button" disabled={busy||!accepted||!valid||phrase.trim().toUpperCase()!=='REAL'}
     onClick={()=>void start()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-5 font-black text-slate-950 disabled:opacity-40"><Play size={16}/> Vendos baste reale</button>
    <button type="button" onClick={()=>void refresh()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-tertiary px-3 text-sm text-white disabled:opacity-50"><RefreshCcw size={16}/> Kontrollo tani</button>
   </div>
   <p className="mt-3 text-xs text-text-secondary">Kuotat mund të ndryshojnë. Nëse serveri refuzon një kuotë ose bilanci nuk mjafton, ajo biletë nuk vendoset dhe nuk zbritet asnjë shumë për të. Nuk përdoren përzgjedhje të sajuara.</p>
  </header>
  {notice&&<p role="status" className="rounded-lg border border-emerald-500/30 bg-secondary p-3 text-sm text-emerald-300">{notice}</p>}
  {error&&<p role="alert" className="rounded-lg border border-rose-500/30 bg-secondary p-3 text-sm text-rose-300">{error}</p>}
  {loading?<p>Po lexoj biletat reale…</p>:!report.runs.length?
   <div className="rounded-xl border border-tertiary bg-secondary p-6 text-center text-sm text-text-secondary">Nuk ka ende teste me para reale. Nuk është zbritur asnjë shumë nga ky laborator.</div>:
  <>
   <div className="flex flex-wrap items-center gap-3">
    <label className="text-xs text-text-secondary">Seanca
     <select value={selected?.id??''} onChange={e=>setRunId(e.target.value)}
      className="mt-1 block min-h-10 max-w-full rounded-lg border border-tertiary bg-secondary px-3 text-sm text-white">
      {report.runs.map(r=><option value={r.id} key={r.id}>{date(r.created_at)} · {r.cases} përzgjedhje reale</option>)}
     </select>
    </label>
    <div className="text-xs text-text-secondary">Totali i zbritur dhe paguar është nga regjistri real i biletave, jo simulim.</div>
   </div>
   <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
    {[
     {label:'Bileta reale',value:selected?.placed??0,icon:Ticket},
     {label:'Në radhë',value:selected?.queued??0,icon:Clock3},
     {label:'Përputhen',value:selected?.passed??0,icon:CheckCircle2},
     {label:'Probleme',value:(selected?.mismatched??0)+(selected?.unsettled??0)+(selected?.missing_evidence??0),icon:AlertTriangle},
     {label:'Zbritur LEK',value:formatted.format(Number(selected?.debited??0)),icon:Landmark},
     {label:'Paguar LEK',value:formatted.format(Number(selected?.paid_back??0)),icon:Landmark}
    ].map(x=><div key={x.label} className="rounded-xl border border-tertiary bg-secondary p-3"><div className="flex items-center justify-between text-xs text-text-secondary"><span>{x.label}</span><x.icon size={15}/></div><p className="mt-2 text-xl font-black tabular-nums text-white">{x.value}</p></div>)}
   </div>
   <div className="rounded-xl border border-tertiary bg-secondary p-3 text-xs">
    <h3 className="mb-2 font-bold text-white">Mbulimi nga API-ja reale</h3>
    <div className="flex flex-wrap gap-2">
     {Object.entries(selected?.coverage??{}).map(([name,details])=><span key={name}
      className={'rounded-lg border px-2 py-1 '+(details.selected?'border-emerald-500/30 text-emerald-300':'border-tertiary text-text-secondary')}>
      {name}: {details.selected} {details.available?'':'(mungon në feed)'}
     </span>)}
    </div>
   </div>
   <section className="overflow-hidden rounded-xl border border-tertiary bg-secondary">
    <div className="flex flex-wrap items-center gap-3 border-b border-tertiary p-3">
     <div className="relative flex-1"><Search size={15} className="absolute left-3 top-3 text-text-secondary"/>
      <input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Kërko biletë reale"
       placeholder="Kërko ndeshje, treg, ID bilete" className="min-h-10 w-full rounded-lg border border-tertiary bg-primary py-2 pl-10 pr-2 text-sm text-white"/>
     </div>
     <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showOnlyProblems}
       onChange={e=>setShowOnlyProblems(e.target.checked)}/> Vetëm problematiket</label>
    </div>
    <div role="region" tabIndex={0} className="max-h-[660px] overflow-auto">
     <table className="w-full min-w-[800px] text-left text-xs">
      <thead className="sticky top-0 bg-[#172231] text-slate-200"><tr className="[&_th]:px-3 [&_th]:py-3"><th>Ndeshja / Tregu</th><th>Bileta reale</th><th>Shuma</th><th>Bilanci i biletës</th><th>Stitch</th><th>Prova</th></tr></thead>
      <tbody>{selectedCases.map(item=><tr key={item.id} className="border-t border-tertiary [&_td]:px-3 [&_td]:py-3">
       <td><strong className="block text-white">{item.match_name}</strong><span>{item.market_name} · {item.outcome_name}</span></td>
       <td className="max-w-[190px] break-all"><span className="font-semibold text-white">{item.placement_status}</span><p className="mt-1">{item.ticket_id??'Pa biletë'}</p></td>
       <td>{item.actual_stake?formatted.format(Number(item.actual_stake))+' LEK':'—'}</td>
       <td><span className="font-bold">{item.ticket_status??'—'}</span><p className="text-text-secondary">{item.actual_payout&&item.ticket_status==='WON'?'Paguar '+formatted.format(Number(item.actual_payout))+' LEK':''}</p></td>
       <td><span className={'inline-flex rounded-full border px-2 py-1 font-semibold '+(auditStyle[item.audit_status]??auditStyle.WAITING)}>{auditLabels[item.audit_status]??item.audit_status}</span>
        {item.expected_status&&<p className="mt-1 text-text-secondary">Pritej: {item.expected_status}</p>}</td>
       <td className="max-w-[230px] text-text-secondary">{item.placement_status==='REJECTED'?item.rejected_reason:
        reasons[item.audit_reason??'']??item.audit_reason??'Në ndjekje'}</td>
      </tr>)}</tbody>
     </table>
    </div>
    {!selectedCases.length&&<p className="p-5 text-sm text-text-secondary">Asnjë biletë për filtrat e zgjedhur.</p>}
   </section>
  </>}
  <div className="flex items-start gap-2 rounded-xl border border-tertiary bg-secondary p-3 text-xs text-text-secondary">
   <ShieldAlert size={19} className="shrink-0 text-amber-300"/>
   <p>Auditimi është i pavarur nga shlyerja reale. Nëse API-ja nuk konfirmon ngjarjet, një biletë mund të mbetet PENDING dhe Stitch do ta raportojë, jo ta kthejë automatikisht në WON, LOST ose VOID. Korrigjimet manuale bëhen nga seksioni ekzistues i verifikimit.</p>
  </div>
 </section>;
}
