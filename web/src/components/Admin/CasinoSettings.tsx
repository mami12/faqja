import { useEffect, useState } from 'react';
import { Dices, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client';

type Settings={enabled:boolean;deploymentEnabled:boolean;mathApproved:boolean;realMoneyAvailable:boolean;profile:string;certified:boolean;theoreticalRtp:number|null;warning:string;profiles:Array<{id:string;label:string;theoreticalRtp:number;certified:boolean}>};
type Totals={casinoStake:number;casinoPayout:number;casinoSpins:number};
export default function CasinoSettings(){
  const [data,setData]=useState<Settings|null>(null),[totals,setTotals]=useState<Totals|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [selectedProfile,setSelectedProfile]=useState('');
  const load=async()=>{
    setBusy(true);setError('');
    try{const [r,finance]=await Promise.all([apiClient.get<Settings>('/admin/casino/settings'),apiClient.get<{totals:Totals}>('/admin/casino/finance')]);setData(r.data);setSelectedProfile(r.data.profile);setTotals(finance.data.totals);}
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
  const updateProfile=async()=>{
    if(!data||!selectedProfile||selectedProfile===data?.profile)return;
    setBusy(true);setError('');
    try{
      const res=await apiClient.patch<Settings>('/admin/casino/profile',{profile:selectedProfile});
      setData(res.data);setSelectedProfile(res.data.profile);
    }catch(e:any){setError(e.response?.data?.message||'Nuk u ruajt RTP');}
    finally{setBusy(false);}
  };
  return <section className="mx-auto max-w-5xl space-y-4 px-3 pb-10 pt-5 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div>
      <h2 className="text-xl font-black text-white">Cilësimet e Kazinosë</h2>
      <p className="mt-1 text-sm text-text-secondary">Konfigurimi i Sizzling Hot dhe kontrolli i portofolit të përbashkët.</p>
    </div><button onClick={()=>void load()} disabled={busy} className="flex items-center gap-2 rounded-lg border border-tertiary bg-secondary px-3 py-2 text-sm font-semibold text-white"><RefreshCw size={16}/>Rifresko</button></div>
    {error&&<p role="alert" className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-rose-200">{error}</p>}
    <div className="rounded-xl border border-tertiary bg-secondary p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-3"><Dices className="text-amber-300"/><div>
        <h3 className="font-bold text-white">Sizzling Hot Deluxe</h3>
      </div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">RTP teorike</p><p className="mt-1 font-bold text-white">{data?.theoreticalRtp==null?'Pa verifikim':data.theoreticalRtp+'%'}</p></div>
        <div className="rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">RTP i vëzhguar</p><p className="mt-1 font-bold text-white">{totals?.casinoStake ? (100*totals.casinoPayout/totals.casinoStake).toFixed(2)+"%" : "Pa spins"}</p><p className="text-[10px] text-text-secondary">Nga {totals?.casinoSpins||0} spins (nuk është RTP teorike)</p></div>
      </div>
      <div className="mt-4 space-y-3 rounded-lg border border-tertiary bg-primary p-4">
        <h4 className="font-bold text-white">RTP · Vetëm Sizzling Hot Deluxe</h4>
        <p className="text-xs text-text-secondary">Ky kontroll ndryshon shumën e fitimeve, jo sa shpesh shfaqen kombinime fituese në animacion. Nuk ndikon lojërat e tjera të kazinosë.</p>
        <label className="block space-y-2 text-sm text-white">
          <span>RTP: {selectedProfile.startsWith('SCHOOL_RTP_') ? selectedProfile.split('_').slice(-1)[0] : Math.round(data?.theoreticalRtp ?? 0)}%</span>
          <input aria-label="RTP nga 0 deri në 100" type="range" min="0" max="100" step="1"
            className="w-full accent-amber-400" disabled={busy}
            value={selectedProfile.startsWith('SCHOOL_RTP_') ? Number(selectedProfile.split('_').slice(-1)[0]) : Math.round(data?.theoreticalRtp ?? 0)}
            onChange={e=>setSelectedProfile('SCHOOL_RTP_'+e.target.value)} />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[210px] flex-1 space-y-1 text-xs text-text-secondary">
            <span>Zgjidh profilin</span>
            <select value={selectedProfile} onChange={e=>setSelectedProfile(e.target.value)}
              disabled={busy} className="block min-h-11 w-full rounded-lg border border-tertiary bg-secondary px-3 text-white">
              {(data?.profiles||[]).map(p=><option key={p.id} value={p.id}>{p.theoreticalRtp.toFixed(2)}% RTP</option>)}
            </select>
          </label>
          <button type="button" disabled={busy||!selectedProfile||selectedProfile===data?.profile}
            onClick={()=>void updateProfile()} className="min-h-11 rounded-lg bg-amber-400 px-5 font-bold text-slate-950 disabled:opacity-40">Ruaj RTP</button>
        </div>

      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-tertiary pt-4">
        <div className="min-w-0"><p className="font-bold text-white">Lejo lojën me bilancin e përdoruesit</p><p className="text-xs text-text-secondary">Përdor të njëjtin bilanc si bastet sportive.</p></div>
        <button type="button" disabled={!data||busy}
          onClick={()=>void change(!data!.enabled)}
          className={'min-h-11 rounded-lg px-5 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50 '+(data?.enabled?'bg-rose-500 text-white':'bg-emerald-500 text-slate-950')}>
          {data?.enabled?'Çaktivizo':'Aktivizo'}
        </button>
      </div>
    </div>
  </section>;
}
