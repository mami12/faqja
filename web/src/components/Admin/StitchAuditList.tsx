import {useEffect,useState} from 'react';
import {apiClient} from '../../api/client';

export type StitchAudit = {
 id: string; line_id: string; ticket_id: string; match_name: string; market_name: string; outcome_name: string;
 actual_status: string; expected_status: string | null;
 verdict: 'MATCH' | 'MISMATCH' | 'MISSING_EVIDENCE';
 evidence?: {reason?: string; source?: string; counts?: Record<string,number>};
};

const results:Record<string,string>={WON:'Fituese',LOST:'Humbëse',VOID:'E pavlefshme'};

export default function StitchAuditList({audits,missingOnly=false}:{audits:StitchAudit[];missingOnly?:boolean}){
 const visible=missingOnly?audits.filter(item=>item.verdict==='MISSING_EVIDENCE'):audits;
 return <section aria-label="Testet e biletave të shlyera" className="space-y-2">
  <h3 className="font-bold">{missingOnly?'Bileta ku mungon prova':'Testet e biletave të shlyera'}</h3>
  {!visible.length&&<p className="text-sm">S’ka raste për të shfaqur në listën e fundit.</p>}
  {visible.map(item=><article key={item.id} className="space-y-1 rounded-xl border border-tertiary bg-secondary p-3">
   <h4 className="font-semibold">{item.match_name}</h4>
   <p className="text-sm">{item.market_name} · {item.outcome_name}</p>
   <p className="break-all text-xs">Bileta · {item.ticket_id}</p>
   <p className="text-sm">
    {item.verdict==='MATCH'?'Përputhet. Sistemi dhe testi dhanë të njëjtin rezultat.':
     item.verdict==='MISMATCH'?'Nuk përputhet. Kontrolloje përzgjedhjen me dorë.':
     item.evidence?.reason==='RECOVERY_OPEN'?'Mungon historiku nga koha kur burimi u ndërpre.':
      'Nuk kemi kronologjinë e plotë të ndeshjes për të kontrolluar këtë bast.'}
   </p>
   <p className="text-sm">Sistemi · <strong>{results[item.actual_status]??item.actual_status}</strong>
    {item.expected_status&&<> · Testi · <strong>{results[item.expected_status]??item.expected_status}</strong></>}
   </p>
   {typeof item.evidence?.counts?.goal==='number'&&<p className="text-sm">Gola të konfirmuar · {item.evidence.counts.goal}</p>}
  </article>)}
 </section>;
}

export function StitchMissingEvidence(){
 const [audits,setAudits]=useState<StitchAudit[]|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  apiClient.get<{audits:StitchAudit[]}>('/admin/live-event-test',{params:{audit:'missing'},signal:controller.signal})
   .then(({data})=>setAudits(Array.isArray(data.audits)?data.audits:[]))
   .catch(()=>{if(!controller.signal.aborted)setError(true);});
  return ()=>controller.abort();
 },[]);
 if(error)return <p role="alert">Lista e provave që mungojnë nuk u ngarkua.</p>;
 return audits?<StitchAuditList audits={audits} missingOnly />:<p>Po kontrolloj biletat…</p>;
}
