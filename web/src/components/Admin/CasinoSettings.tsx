import { useEffect, useState } from 'react';
import { Dices, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client';

type Profile={id:string;label:string;theoreticalRtp:number};
type Game={gameId:string;title:string;profile:string|null;theoreticalRtp:number|null;profiles:Profile[];configurationError:string|null;configurationWarning:string|null};
type Settings={enabled:boolean;games:Game[];warning:string|null};
type Totals={casinoStake:number;casinoPayout:number;casinoSpins:number};
const percent=(value:number|null)=>value==null?'Pa profil aktiv':`${value.toFixed(3)}%`;

export default function CasinoSettings(){
 const [data,setData]=useState<Settings|null>(null),[totals,setTotals]=useState<Totals|null>(null);
 const [selected,setSelected]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{
  setBusy(true);setError('');
  try{
   const [settings,finance]=await Promise.all([apiClient.get<Settings>('/admin/casino/settings'),apiClient.get<{totals:Totals}>('/admin/casino/finance')]);
   setData(settings.data);setTotals(finance.data.totals);
   setSelected(Object.fromEntries(settings.data.games.map(game=>[game.gameId,game.profile??game.profiles[0]?.id??''])));
  }catch(e:any){setError(e.response?.data?.message||'Nuk u ngarkuan cilësimet');}finally{setBusy(false);}
 };
 useEffect(()=>{void load();},[]);
 const save=async(gameId:string)=>{
  setBusy(true);setError('');
  try{
   const response=await apiClient.patch<Settings>('/admin/casino/profile',{gameId,profile:selected[gameId]});
   setData(response.data);
   const game=response.data.games.find(item=>item.gameId===gameId);
   if(game?.profile)setSelected(previous=>({...previous,[gameId]:game.profile!}));
  }catch(e:any){setError(e.response?.data?.message||'Profili nuk u ruajt');}finally{setBusy(false);}
 };
 const change=async()=>{
  if(!data)return;setBusy(true);setError('');
  try{const response=await apiClient.patch<Settings>('/admin/casino/settings',{enabled:!data.enabled});setData(response.data);}
  catch(e:any){setError(e.response?.data?.message||'Ndryshimi nuk u ruajt');}finally{setBusy(false);}
 };
 return <section className="mx-auto max-w-5xl space-y-4 px-3 pb-10 pt-5 sm:px-6">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-xl font-black text-white">Cilësimet e Kazinosë</h2><p className="mt-1 text-sm text-text-secondary">Profilet e lojërave dhe portofoli i përbashkët.</p></div>
   <button onClick={()=>void load()} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-lg border border-tertiary bg-secondary px-3 py-2 text-sm font-semibold text-white"><RefreshCw size={16}/>Rifresko</button>
  </div>
  {error&&<p role="alert" className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-rose-200">{error}</p>}
  {data?.warning&&<p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">{data.warning}</p>}
  <div className="rounded-xl border border-tertiary bg-secondary p-4 sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><h3 className="font-bold text-white">Lejo lojërat me bilancin e përdoruesit</h3><p className="mt-1 text-xs text-text-secondary">I njëjti bilanc si te bastet sportive.</p></div>
    <button type="button" disabled={!data||busy} onClick={()=>void change()} className={'min-h-11 rounded-lg px-5 py-2 font-bold disabled:opacity-50 '+(data?.enabled?'bg-rose-500 text-white':'bg-emerald-500 text-slate-950')}>{data?.enabled?'Çaktivizo':'Aktivizo'}</button>
   </div>
   <p className="mt-4 text-sm text-text-secondary">Profili i çdo loje zbatohet njësoj për të gjithë përdoruesit, nga rrotullimi tjetër me pagesë. Bonusët e nisur dhe fitimet në pritje ruajnë kushtet e tyre.</p>
   <p className="mt-2 text-sm text-text-secondary">RTP është kthimi mesatar afatgjatë, jo përqindja e rrotullimeve fituese. Mund të zgjedhësh vetëm profilet reale të mbështetura nga loja.</p>
   <div className="mt-4 rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">Kthimi i vëzhguar në të gjitha lojërat</p><p className="mt-1 font-bold text-white">{totals?.casinoStake?percent(100*totals.casinoPayout/totals.casinoStake):'Pa rrotullime'}</p><p className="mt-1 text-xs text-text-secondary">Nga {totals?.casinoSpins??0} rrotullime; kjo shifër ndryshon nga RTP teorike.</p></div>
  </div>
  <div className="grid gap-4 md:grid-cols-2">
   {(data?.games??[]).map(game=>{
    const id=selected[game.gameId]??'',index=game.profiles.findIndex(profile=>profile.id===id);
    const choice=game.profiles[index],supported=index>=0;
    return <article key={game.gameId} className="space-y-4 rounded-xl border border-tertiary bg-secondary p-4 sm:p-5">
     <h3 className="flex items-center gap-2 font-bold text-white"><Dices size={19} className="text-amber-300"/>{game.title}</h3>
     <div className="rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">RTP aktive e ruajtur</p><p className="mt-1 text-lg font-black text-white">{percent(game.theoreticalRtp)}</p></div>
     {(game.configurationError||game.configurationWarning)&&<p role="alert" className="text-sm text-amber-200">{game.configurationError||game.configurationWarning}</p>}
     <label className="block space-y-2 text-sm text-white"><span>Zgjedhja e re: {choice?percent(choice.theoreticalRtp):'Zgjidh një profil të mbështetur'}</span>
      <input type="range" min={0} max={Math.max(0,game.profiles.length-1)} step={1} value={Math.max(0,index)} disabled={busy||game.profiles.length<2}
       aria-label={`${game.title}: profilet e RTP-së`} className="w-full accent-amber-400" onChange={event=>setSelected(previous=>({...previous,[game.gameId]:game.profiles[Number(event.target.value)].id}))}/>
      <span className="flex justify-between text-xs text-text-secondary"><span>Më ulët {percent(game.profiles[0]?.theoreticalRtp??null)}</span><span>Më lart {percent(game.profiles[game.profiles.length-1]?.theoreticalRtp??null)}</span></span>
     </label>
     <label className="block space-y-1 text-xs text-text-secondary"><span>Profilet e mbështetura</span>
      <select value={id} disabled={busy} onChange={event=>setSelected(previous=>({...previous,[game.gameId]:event.target.value}))} className="block min-h-11 w-full rounded-lg border border-tertiary bg-primary px-3 text-white">
       {!supported&&<option value={id} disabled>Zgjidh një profil të mbështetur</option>}
       {game.profiles.map(profile=><option key={profile.id} value={profile.id}>{percent(profile.theoreticalRtp)}</option>)}
      </select>
     </label>
     <button type="button" disabled={busy||!supported||id===game.profile} onClick={()=>void save(game.gameId)} className="min-h-11 w-full rounded-lg bg-amber-400 px-4 font-bold text-slate-950 disabled:opacity-40">Ruaj profilin për këtë lojë</button>
    </article>;
   })}
  </div>
 </section>;
}
