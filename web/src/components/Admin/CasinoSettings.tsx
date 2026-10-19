import { useEffect, useState } from 'react';
import { AlertTriangle, Dices, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../api/client';

type Settings={enabled:boolean;deploymentEnabled:boolean;realMoneyAvailable:boolean;profile:string;certified:boolean;theoreticalRtp:number|null;warning:string};
export default function CasinoSettings(){
  const [data,setData]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async()=>{
    setBusy(true);setError('');
    try{const r=await apiClient.get<Settings>('/admin/casino/settings');setData(r.data);}
    catch(e:any){setError(e.response?.data?.message||'Nuk u ngarkuan cilësimet');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load();},[]);
  const change=async(enabled:boolean)=>{
    if(!data)return;
    if(enabled&&!window.confirm('Aktivizimi përdor fondet e përbashkëta të përdoruesve. Konfirmo vetëm pasi të jenë kryer kontrollet e licencimit, RTP-së, matematikës dhe sigurisë.'))return;
    setBusy(true);setError('');
    try{const r=await apiClient.patch<Settings>('/admin/casino/settings',{enabled});setData(r.data);}
    catch(e:any){setError(e.response?.data?.message||'Ndryshimi nuk u ruajt');}
    finally{setBusy(false);}
  };
  return <section className="mx-auto max-w-5xl space-y-4 px-3 pb-10 pt-5 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div>
      <h2 className="text-xl font-black text-white">Cilësimet e Kazinosë</h2>
      <p className="mt-1 text-sm text-text-secondary">Konfigurimi i lojërave dhe kontrolli i modalitetit financiar.</p>
    </div><button onClick={()=>void load()} disabled={busy} className="flex items-center gap-2 rounded-lg border border-tertiary bg-secondary px-3 py-2 text-sm font-semibold text-white"><RefreshCw size={16}/>Rifresko</button></div>
    {error&&<p role="alert" className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-rose-200">{error}</p>}
    <div className="rounded-xl border border-tertiary bg-secondary p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-3"><Dices className="text-amber-300"/><div>
        <h3 className="font-bold text-white">Sizzling Hot Deluxe</h3><p className="text-xs text-text-secondary">Profili matematikor: {data?.profile||'...'}</p>
      </div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">RTP teorike</p><p className="mt-1 font-bold text-white">{data?.theoreticalRtp==null?'Pa verifikim':data.theoreticalRtp+'%'}</p></div>
        <div className="rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">Certifikimi</p><p className="mt-1 font-bold text-amber-300">{data?.certified?'I verifikuar':'Nuk është certifikuar'}</p></div>
        <div className="rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">Modaliteti</p><p className="mt-1 font-bold text-white">{data?.realMoneyAvailable?'Fonde të përbashkëta':'Demo / i çaktivizuar'}</p></div>
      </div>
      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <AlertTriangle className="mr-2 inline" size={18}/>
        Ndryshimi arbitrar i RTP-së gjatë lojës ose sipas përdoruesit nuk lejohet. Për të shtuar profil tjetër RTP duhen reel strips, tabela pagesash dhe verifikim matematikor për një version të pandryshueshëm.
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-tertiary pt-4">
        <div className="min-w-0"><p className="font-bold text-white">Lejo lojën me bilancin e përdoruesit</p><p className="text-xs text-text-secondary">Kërkon CASINO_REAL_MONEY_ENABLED=true në server dhe kontroll administrativ.</p></div>
        <button type="button" disabled={!data||busy||(!data.enabled&&!data.deploymentEnabled)||!data.certified}
          onClick={()=>void change(!data!.enabled)}
          className={'min-h-11 rounded-lg px-5 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50 '+(data?.enabled?'bg-rose-500 text-white':'bg-emerald-500 text-slate-950')}>
          {data?.enabled?'Çaktivizo':'Aktivizo'}
        </button>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-text-secondary"><ShieldCheck size={16} className="shrink-0"/>Aktivizimi është i bllokuar derisa të regjistrohet një profil i certifikuar. Konfigurimi ruan historikun e ndryshimeve në regjistrin e adminit.</p>
    </div>
  </section>;
}
