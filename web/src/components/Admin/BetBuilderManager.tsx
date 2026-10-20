import {useEffect,useState} from 'react';
import {Check,Plus,Save,Trash2,Pencil,RotateCcw,X} from 'lucide-react';
import {apiClient} from '../../api/client';

type Leg={market:string;outcome:string;line:string};
type Option=Leg&{label:string};
type Category={market:string;title:string;options:Option[]};
type Template={id:string;name:string;legs:Leg[];active:boolean};
const initial=():Template=>({id:'',name:'',legs:[],active:true});
const key=(leg:Leg)=>[leg.market,leg.outcome,leg.line].join(':');
const label=(leg:Leg)=>leg.market==='BTTS'?'BTTS '+leg.outcome:leg.outcome+(leg.line?' '+leg.line:'');
const order=['1X2','DC','BTTS','TOTAL'];
const pairs=['1X2+BTTS','1X2+TOTAL','BTTS+TOTAL','DC+TOTAL'];

export default function BetBuilderManager(){
 const [templates,setTemplates]=useState<Template[]>([]),[catalog,setCatalog]=useState<Category[]>([]);
 const [draft,setDraft]=useState<Template>(initial),[category,setCategory]=useState('1X2');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=async()=>{
  const [saved,options]=await Promise.all([apiClient.get<Template[]>('/admin/bet-builders'),apiClient.get<Category[]>('/admin/bet-builders/catalog')]);
  setTemplates(saved.data);setCatalog(options.data);
 };
 useEffect(()=>{void refresh().catch(e=>setError(e.response?.data?.message||'Nuk u ngarkuan tregjet.'));},[]);
 const sorted=[...draft.legs].sort((a,b)=>order.indexOf(a.market)-order.indexOf(b.market));
 const name=sorted.map(label).join(' + '),complete=sorted.length===2;
 const compatible=(option:Leg)=>{
  const other=draft.legs.find(l=>l.market!==option.market);
  return !other||pairs.includes([other.market,option.market].sort().join('+'));
 };
 const choose=(option:Option)=>{
  setError('');setNotice('');
  const leg={market:option.market,outcome:option.outcome,line:option.line};
  setDraft(value=>{
   if(value.legs.some(l=>key(l)===key(leg)))return {...value,legs:value.legs.filter(l=>key(l)!==key(leg))};
   const remaining=value.legs.filter(l=>l.market!==leg.market);
   if(remaining.length>=2)return value;
   return {...value,legs:[...remaining,leg]};
  });
 };
 const reset=()=>{setDraft(initial());setError('');setNotice('');};
 const save=async()=>{
  if(!complete||busy)return;setBusy(true);setError('');setNotice('');
  try{await apiClient.post('/admin/bet-builders',{id:draft.id||null,legs:sorted,active:draft.active});await refresh();setDraft(initial());setNotice('Bet Builder u ruajt.');}
  catch(e:any){setError(e.response?.data?.message||'Ruajtja dështoi.');}finally{setBusy(false);}
 };
 const remove=async(id:string)=>{
  if(!window.confirm('Ta fshijmë këtë kombinim? Biletat e vjetra ruhen.'))return;
  setBusy(true);setError('');try{await apiClient.delete('/admin/bet-builders/'+id);await refresh();if(draft.id===id)setDraft(initial());}
  catch(e:any){setError(e.response?.data?.message||'Fshirja dështoi.');}finally{setBusy(false);}
 };
 const edit=(item:Template)=>{
  setNotice('');setError(item.legs.length!==2?'Zgjidh saktësisht 2 tregje për këtë kombinim.':'');
  setDraft({...item,legs:item.legs.length===2?item.legs.map(l=>({...l})):[]});
 };
 return <div className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-6">
  <div className="rounded-xl border border-tertiary bg-secondary p-4 text-sm text-text-secondary">
   Zgjidh një kategori, kliko saktësisht 2 zgjedhje nga dy tregje të ndryshme dhe shtyp Save. Emri krijohet automatikisht.
   <p className="mt-2">Kombinimi shfaqet në ndeshjet me kuotë të kombinuar nga furnizuesi. Kuota ndryshon sipas ndeshjes.</p>
  </div>
  {error&&<div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
  {notice&&<div role="status" className="rounded-lg border border-emerald-500/30 p-3 text-sm text-emerald-300">{notice}</div>}
  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
   <section className="space-y-4 rounded-xl border border-tertiary bg-secondary p-4">
    <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-white">{draft.id?'Modifiko Bet Builder':'Bet Builder i ri'}</h2><button type="button" onClick={reset} disabled={busy} className="flex min-h-11 items-center gap-1 px-2 text-xs text-text-secondary"><RotateCcw size={16}/>Pastro</button></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Kategoritë e tregjeve">
     {catalog.map(item=><button key={item.market} type="button" aria-pressed={category===item.market} onClick={()=>setCategory(item.market)} className={'min-h-11 rounded-lg border px-3 py-2 text-xs font-bold '+(category===item.market?'border-accent-green bg-accent-green text-primary':'border-tertiary bg-primary text-white')}>{item.title}</button>)}
    </div>
    <div role="group" aria-label="Zgjedhjet e tregut" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
     {(catalog.find(c=>c.market===category)?.options||[]).map(option=>{
      const selected=draft.legs.some(l=>key(l)===key(option));
      const full=complete&&!draft.legs.some(l=>l.market===option.market);
      return <button key={key(option)} type="button" aria-pressed={selected} disabled={busy||(!selected&&(full||!compatible(option)))} onClick={()=>choose(option)} className={'flex min-h-14 items-center justify-center gap-2 rounded-lg border px-3 py-3 font-bold disabled:opacity-30 '+(selected?'border-accent-green bg-accent-green/20 text-accent-green':'border-tertiary bg-primary text-white hover:border-accent-green')}>
       {selected&&<Check size={16}/>}<span>{option.label}</span>
      </button>;
     })}
    </div>
    <div className="rounded-lg border border-tertiary bg-primary p-3">
     <p className="mb-3 text-sm font-bold text-white">Zgjedhur: {draft.legs.length}/2</p>
     <div className="flex min-h-11 flex-wrap gap-2">{sorted.map(leg=><button key={key(leg)} type="button" disabled={busy} aria-label={'Hiq '+label(leg)} onClick={()=>setDraft({...draft,legs:draft.legs.filter(l=>key(l)!==key(leg))})} className="flex items-center gap-2 rounded-lg bg-accent-green/15 px-3 py-2 text-sm text-accent-green">{label(leg)}<X size={14}/></button>)}
      {!draft.legs.length&&<span className="text-sm text-text-secondary">Kliko zgjedhjen e parë.</span>}
     </div>
     <p className="mt-3 break-words text-sm text-white" aria-live="polite">{name||'Emri do të plotësohet automatikisht.'}</p>
    </div>
    <label className="flex min-h-11 items-center gap-2 text-sm text-white"><input type="checkbox" disabled={busy} checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Aktiv në ndeshjet e përshtatshme</label>
    <button type="button" onClick={()=>void save()} disabled={busy||!complete} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 py-3 font-bold text-primary disabled:opacity-40"><Save size={17}/>{busy?'Duke ruajtur…':'Save Bet Builder'}</button>
   </section>
   <section className="space-y-3 rounded-xl border border-tertiary bg-secondary p-4">
    <div className="flex items-center justify-between"><h2 className="font-bold text-white">Kombinimet e ruajtura</h2><button type="button" disabled={busy} onClick={reset} className="flex min-h-11 items-center gap-1 rounded px-3 text-sm font-bold text-accent-green"><Plus size={15}/>I ri</button></div>
    {!templates.length&&<p className="text-sm text-text-secondary">Nuk ka kombinime të ruajtura.</p>}
    {templates.map(item=><div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-tertiary bg-primary p-3">
     <div><div className="font-bold text-white">{item.name}</div><div className="mt-1 text-xs text-text-secondary">{item.legs.map(label).join(' + ')}</div><div className={'mt-2 text-xs '+(item.active?'text-emerald-300':'text-text-secondary')}>{item.active?'Aktiv':'Joaktiv'}</div></div>
     <div className="flex"><button type="button" disabled={busy} aria-label={'Modifiko '+item.name} onClick={()=>edit(item)} className="min-h-11 min-w-11 text-accent-yellow"><Pencil size={17}/></button><button type="button" disabled={busy} aria-label={'Fshi '+item.name} onClick={()=>void remove(item.id)} className="min-h-11 min-w-11 text-rose-300"><Trash2 size={17}/></button></div>
    </div>)}
   </section>
  </div>
 </div>;
}
