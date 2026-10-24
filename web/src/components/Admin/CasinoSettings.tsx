import { useEffect, useState } from 'react';
import { Dices, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client';
import {casinoPercent as percent, casinoStakeLimits, type CasinoSettingsData as Settings, type CasinoGameSettings} from '../../types/casino';

type Totals={casinoStake:number;casinoPayout:number;casinoSpins:number};
type Draft={mode:'original'|'custom';rtp:string;hitFrequency:string};
const toDraft=(game:CasinoGameSettings):Draft=>({mode:game.controls?.mode??'original',rtp:String(game.controls?.rtp??game.effectiveRtp??game.theoreticalRtp??95),hitFrequency:String(game.controls?.hitFrequency??10)});
const draftError=(draft:Draft)=>{
 if(draft.mode!=='custom')return '';
 const rtp=Number(draft.rtp),hit=Number(draft.hitFrequency);
 if(draft.rtp.trim()===''||draft.hitFrequency.trim()===''||!Number.isFinite(rtp)||!Number.isFinite(hit)||rtp<0||rtp>100||hit<0||hit>100)return 'RTP dhe hit frequency duhet të jenë nga 0% deri në 100%.';
 if((rtp===0)!==(hit===0))return 'Për RTP 0% vendos edhe hit frequency 0%. Për RTP mbi 0%, hit frequency duhet të jetë mbi 0%.';
 return '';
};

export default function CasinoSettings(){
 const [data,setData]=useState<Settings|null>(null),[totals,setTotals]=useState<Totals|null>(null);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [selected,setSelected]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{
  setBusy(true);setError('');
  try{
   const [settings,finance]=await Promise.all([apiClient.get<Settings>('/admin/casino/settings'),apiClient.get<{totals:Totals}>('/admin/casino/finance')]);
   setData(settings.data);setTotals(finance.data.totals);
   setSelected(Object.fromEntries(settings.data.games.map(game=>[game.gameId,game.profile??game.profiles[0]?.id??''])));
   setDrafts(Object.fromEntries(settings.data.games.map(game=>[game.gameId,toDraft(game)])));
  }catch(e:any){setError(e.response?.data?.message||'Nuk u ngarkuan cilësimet');}finally{setBusy(false);}
 };
 useEffect(()=>{void load();},[]);
 const save=async(gameId:string)=>{
  const draft=drafts[gameId];
  if(!draft)return;
  const invalid=draftError(draft);
  if(invalid){setError(invalid);return;}
  setBusy(true);setError('');
  try{
   const previous=data?.games.find(item=>item.gameId===gameId);
   if(draft.mode==='original'&&selected[gameId]!==previous?.profile){
    const profileResponse=await apiClient.patch<Settings>('/admin/casino/profile',{gameId,profile:selected[gameId]});
    setData(profileResponse.data);
   }
   const response=await apiClient.patch<Settings>('/admin/casino/controls',{gameId,mode:draft.mode,rtp:Number(draft.rtp),hitFrequency:Number(draft.hitFrequency)});
   setData(response.data);
   const game=response.data.games.find(item=>item.gameId===gameId);
   if(game){
    if(game.profile)setSelected(previous=>({...previous,[gameId]:game.profile!}));
    setDrafts(previous=>({...previous,[gameId]:toDraft(game)}));
   }
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
   <p className="mt-2 text-sm text-text-secondary">RTP është kthimi mesatar afatgjatë. Hit frequency është përqindja e rrotullimeve me pagesë që kthejnë një shumë mbi zero, duke përfshirë bonusin e atij rrotullimi, përpara lojës opsionale Gamble / Double Up. Edhe një kthim më i vogël se basti llogaritet si hit.</p>
   <p className="mt-2 text-sm text-text-secondary">Modaliteti origjinal përdor profilin e motorit. Modaliteti i personalizuar ndryshon shpërndarjen e rezultateve sipas dy vlerave që ruan; lojtarit i shfaqen këto kushte përpara hapjes së lojës.</p>
   {data?.stakeLimits&&<p className="mt-3 font-semibold text-white">Basti për të gjitha lojërat: {casinoStakeLimits(data.stakeLimits)}.</p>}
   <div className="mt-4 rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">Kthimi i vëzhguar në të gjitha lojërat</p><p className="mt-1 font-bold text-white">{totals?.casinoStake?percent(100*totals.casinoPayout/totals.casinoStake):'Pa rrotullime'}</p><p className="mt-1 text-xs text-text-secondary">Nga {totals?.casinoSpins??0} rrotullime; kjo shifër ndryshon nga RTP teorike.</p></div>
  </div>
  <div className="grid gap-4 md:grid-cols-2">
   {(data?.games??[]).map(game=>{
    const id=selected[game.gameId]??'',index=game.profiles.findIndex(profile=>profile.id===id);
    const choice=game.profiles[index],supported=index>=0;
    const draft=drafts[game.gameId]??toDraft(game),invalid=draftError(draft);
    const original=toDraft(game),changed=draft.mode!==original.mode||draft.rtp!==original.rtp||draft.hitFrequency!==original.hitFrequency||(draft.mode==='original'&&id!==game.profile);
    const edit=(patch:Partial<Draft>)=>setDrafts(previous=>({...previous,[game.gameId]:{...draft,...patch}}));
    return <article key={game.gameId} className="space-y-4 rounded-xl border border-tertiary bg-secondary p-4 sm:p-5">
     <h3 className="flex items-center gap-2 font-bold text-white"><Dices size={19} className="text-amber-300"/>{game.title}</h3>
     <div className="rounded-lg bg-primary p-3"><p className="text-xs text-text-secondary">Aktive: {game.controls?.mode==='custom'?'E personalizuar':'Origjinale'}</p><p className="mt-1 text-lg font-black text-white">RTP {percent(game.effectiveRtp??game.theoreticalRtp)}</p><p className="mt-1 text-sm text-text-secondary">Hit frequency: {percent(game.effectiveHitFrequency)}</p></div>
     {(game.configurationError||game.configurationWarning)&&<p role="alert" className="text-sm text-amber-200">{game.configurationError||game.configurationWarning}</p>}
     <label className="block space-y-1 text-sm text-white"><span>Modaliteti për këtë lojë</span>
      <select aria-label={`${game.title}: modaliteti`} value={draft.mode} disabled={busy} onChange={event=>edit({mode:event.target.value as Draft['mode']})} className="block min-h-11 w-full rounded-lg border border-tertiary bg-primary px-3">
       <option value="original">Origjinal · profilet e motorit</option><option value="custom">I personalizuar · RTP dhe hit frequency</option>
      </select>
     </label>
     {draft.mode==='custom'?<div className="space-y-4">
      {([{key:'rtp',label:'RTP'},{key:'hitFrequency',label:'Hit frequency'}] as const).map(control=><label key={control.key} className="block space-y-2 text-sm text-white"><span>{control.label} e re (%)</span>
       <div className="flex items-center gap-3"><input type="range" aria-label={`${game.title}: ${control.label} rrëshqitës`} min={0} max={100} step={0.01} value={Number(draft[control.key])||0} disabled={busy} onChange={event=>edit({[control.key]:event.target.value})} className="min-w-0 flex-1 accent-amber-400"/>
        <input type="number" aria-label={`${game.title}: ${control.label}`} min={0} max={100} step={0.01} value={draft[control.key]} disabled={busy} onChange={event=>edit({[control.key]:event.target.value})} className="min-h-11 w-24 rounded-lg border border-tertiary bg-primary px-2 text-white"/>
       </div><span className="flex justify-between text-xs text-text-secondary"><span>0%</span><span>100%</span></span>
      </label>)}
      {Number(draft.rtp)===0&&Number(draft.hitFrequency)===0&&<p className="rounded-lg border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-200">Me 0% rrotullimet e reja me pagesë nuk japin asnjë fitim. Bonusët e pranuar më parë ruajnë kushtet e tyre.</p>}
      {invalid&&<p role="alert" className="text-sm text-rose-200">{invalid}</p>}
      {game.customLimits&&<p className="text-xs text-text-secondary">Kthimi mesatar për një rrotullim që paguan duhet të jetë brenda {game.customLimits.minWinMultiplier}×–{game.customLimits.maxWinMultiplier}× basti. Serveri kontrollon nëse çifti RTP / hit frequency realizohet nga loja.</p>}
     </div>:<>
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
     </>}
     <button type="button" disabled={busy||!changed||Boolean(invalid)||(draft.mode==='original'&&!supported)} onClick={()=>void save(game.gameId)} className="min-h-11 w-full rounded-lg bg-amber-400 px-4 font-bold text-slate-950 disabled:opacity-40">Ruaj cilësimet për këtë lojë</button>
    </article>;
   })}
  </div>
 </section>;
}
