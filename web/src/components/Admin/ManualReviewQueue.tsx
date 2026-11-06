import {useEffect,useState} from 'react';
import {apiClient} from '../../api/client';
import {AlertTriangle,RefreshCw} from 'lucide-react';

type ReviewItem={
 lineId:string;ticketId:string;matchId:string;marketName:string;matchName:string;
 outcomeName:string;marketLine:string;lineStatus:string;ticketStatus:string;
 username:string|null;placedAt:string;stake:string|number;odds:string|number;
 notificationActive:boolean;noticeExpiresAt:string;
 finalScore:string|null;reason:string;conflicts?:Record<string,unknown>|null;
};
type Decision={status:string};
const fresh:Decision={status:'PENDING'};
const placedAt=(value:string)=>new Date(value).toLocaleString('sq-AL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
export default function ManualReviewQueue({onlyLineId,onSaved}:{onlyLineId?:string;onSaved?:()=>void}={}){
 const [items,setItems]=useState<ReviewItem[]>([]);
 const [decisions,setDecisions]=useState<Record<string,Decision>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){
  try{
   const res=await apiClient.get('/admin/settlement-review-queue',{params:{limit:200}});
   setItems(Array.isArray(res.data?.items)?res.data.items.filter((item:ReviewItem)=>!onlyLineId||item.lineId===onlyLineId):[]);
   setError('');
  }catch(e:any){setError(e.response?.data?.message??'Lista e verifikimeve nuk u ngarkua.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();const id=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(id);},[onlyLineId]);
 const change=(id:string,key:keyof Decision,value:string)=>setDecisions(prev=>({
  ...prev,[id]:{...(prev[id]??fresh),[key]:value}
 }));
 async function decide(item:ReviewItem,entry:Decision){
  setBusy(item.lineId);setError('');setNotice('');
  try{
   const res=await apiClient.post('/admin/manual-settlement',{
    lineId:item.lineId,status:entry.status,
   });
   setNotice('Vendimi u regjistrua për '+(res.data.changed?.length??0)+' biletë/a.');
   setDecisions(prev=>{const next={...prev};delete next[item.lineId];return next;});
   onSaved?.();
   await load();
  }catch(e:any){setError(e.response?.data?.message??'Vendimi manual dështoi.');}
  finally{setBusy(null);}
 }
 return <div className="mx-auto max-w-7xl p-3 sm:p-6 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-lg font-bold text-white flex gap-2 items-center"><AlertTriangle size={18}/> Bileta për verifikim manual ({items.length})</h2>
    <p className="text-xs text-text-secondary">Njoftimi qëndron aktiv 48 orë nga shfaqja e parë. Përzgjedhjet e pazgjidhura mbeten në këtë listë për kontroll.</p></div>
   <button type="button" onClick={()=>void load()} className="px-3 py-2 border border-tertiary rounded-lg flex items-center gap-2 text-sm"><RefreshCw size={14}/> Rifresko</button>
  </div>
  {error&&<p role="alert" className="text-rose-400 text-sm">{error}</p>}
  {notice&&<p role="status" className="text-accent-green text-sm">{notice}</p>}
  {loading&&<p className="text-text-secondary">Duke ngarkuar…</p>}
  {!loading&&!items.length&&<p className="bg-secondary border border-tertiary rounded-xl p-4 text-text-secondary">Nuk ka bileta që kërkojnë verifikim manual.</p>}
  {items.map(item=>{
   const decision=decisions[item.lineId]??fresh;
   return <section key={item.lineId} className="bg-secondary rounded-xl border border-tertiary p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2">
     <div><h3 className="font-bold text-white">{item.matchName}</h3>
      <p className="text-xs text-text-secondary">Bileta: {item.ticketId} · Përdoruesi: {item.username??'—'} · Vendosur: {placedAt(item.placedAt)} · Ndeshja: {item.matchId}</p>
      <p className="text-xs text-text-secondary">Tregu: {item.marketName} {item.marketLine} · Zgjedhja: {item.outcomeName} · Koef.: {item.odds} · Basti: {item.stake} lekë</p>
      {item.finalScore&&<p className="text-sm">Rezultati final: {item.finalScore}</p>}</div>
     <span className="text-xs text-amber-300 font-bold">{item.lineStatus==='VOID'?'E PAVLEFSHME':'NË PRITJE'}</span>
    </div>
    <div className="max-w-xs">
     <label className="text-xs font-semibold space-y-1">Vendimi
      <select value={decision.status} onChange={e=>change(item.lineId,'status',e.target.value)} className="w-full bg-primary border border-tertiary rounded-lg p-2 text-white">
       <option value="PENDING">Në pritje</option><option value="WON">Fituese</option><option value="LOST">Humbëse</option><option value="VOID">E pavlefshme</option>
      </select>
     </label>
    </div>
    <div className="flex flex-wrap gap-3 items-center justify-between">
     <p className="text-[11px] text-text-secondary">Vendimet Fituese/Humbëse/E pavlefshme mund të ndryshojnë bilancin. Sistemi regjistron administratorin dhe diferencën financiare.</p>
     <button type="button" disabled={busy!==null}
      onClick={()=>void decide(item,decision)} className="bg-accent-green text-primary rounded-lg px-4 py-2 font-bold text-sm disabled:opacity-40">
      {busy===item.lineId?'Duke ruajtur…':'Ruaj vendimin'}
     </button>
    </div>
   </section>;
  })}
 </div>;
}
