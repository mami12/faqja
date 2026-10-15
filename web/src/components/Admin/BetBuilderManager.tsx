import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { apiClient } from '../../api/client';

type MarketKind = '1X2' | 'DC' | 'BTTS' | 'TOTAL';
type Leg = { market: MarketKind; outcome: string; line: string };
type Template = { id: string; name: string; legs: Leg[]; active: boolean };
const OUTCOMES: Record<MarketKind, string[]> = {
  '1X2': ['1','X','2'], DC: ['1X','12','X2'],
  BTTS: ['Yes','No'], TOTAL: ['Over','Under'],
};
const initial = (): Template => ({
  id: '', name: '', active: false,
  legs: [{ market:'1X2',outcome:'1',line:'' }, { market:'BTTS',outcome:'Yes',line:'' }],
});
const totalLines = ['0.5','1.5','2.5','3.5','4.5','5.5','6.5'];

export default function BetBuilderManager() {
  const [templates,setTemplates] = useState<Template[]>([]);
  const [draft,setDraft] = useState<Template>(initial);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const refresh = async () => {
    const {data} = await apiClient.get<Template[]>('/admin/bet-builders');
    setTemplates(data);
  };
  useEffect(() => { refresh().catch(e => setError(e.response?.data?.message || 'Nuk u ngarkuan kombinimet.')); },[]);
  const editLeg = (index: number, patch: Partial<Leg>) =>
    setDraft(prev => ({...prev,legs:prev.legs.map((leg,i) => {
      if (i !== index) return leg;
      const next = {...leg,...patch};
      if (patch.market) { next.outcome = OUTCOMES[patch.market][0]; next.line = patch.market === 'TOTAL' ? '2.5' : ''; }
      return next;
    })}));
  const save = async () => {
    setBusy(true);setError('');setNotice('');
    try {
      await apiClient.post('/admin/bet-builders', {
        id:draft.id || null,name:draft.name,legs:draft.legs,active:draft.active,
      });
      await refresh();setDraft(initial());setNotice('Kombinimi u ruajt.');
    } catch(e: any) {setError(e.response?.data?.message || 'Ruajtja dështoi.');}
    finally {setBusy(false);}
  };
  const remove = async (id: string) => {
    if (!window.confirm('Ta fshijmë këtë kombinim? Biletat e vjetra ruhen.')) return;
    setBusy(true);setError('');
    try {await apiClient.delete('/admin/bet-builders/'+id);await refresh();if(draft.id===id)setDraft(initial());}
    catch(e: any){setError(e.response?.data?.message || 'Fshirja dështoi.');}
    finally{setBusy(false);}
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-6">
      <div className="rounded-xl border border-tertiary bg-secondary p-4 text-sm text-text-secondary">
        Krijo kombinimin një herë. Shfaqet automatikisht në çdo ndeshje që ka të gjitha marketet aktive.
        Koeficienti = shumëzimi i kuotave aktuale të API-së. Basti ruan koeficientin e pranuar.
        <p className="mt-2 text-amber-200">Kujdes: shumëzimi i tregjeve të lidhura nuk është model probabilistik i kalibruar. Aktivizo vetëm kombinime të kontrolluara.</p>
      </div>
      {error && <div role="alert" className="border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div className="border border-emerald-500/30 p-3 text-sm text-emerald-300">{notice}</div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="space-y-3 rounded-xl border border-tertiary bg-secondary p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">Kombinimet e krijuara</h2>
            <button type="button" onClick={() => {setDraft(initial());setError('');}} className="flex items-center gap-1 rounded bg-accent-green px-3 py-2 text-xs font-bold text-primary"><Plus size={14}/> I ri</button>
          </div>
          {!templates.length && <p className="text-sm text-text-secondary">Nuk ka kombinime të krijuara.</p>}
          {templates.map(item => (
            <div key={item.id} className="rounded-lg border border-tertiary bg-primary p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-white">{item.name}</div>
                  <div className="mt-1 text-xs text-text-secondary">{item.legs.map(l => l.market+' '+l.outcome+(l.line?' '+l.line:'')).join(' + ')}</div>
                  <div className={item.active?'mt-2 text-xs text-emerald-300':'mt-2 text-xs text-text-secondary'}>{item.active?'Aktiv në markete':'Joaktiv'}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" title="Modifiko" onClick={() => setDraft({...item,legs:item.legs.map(l=>({...l}))})} className="text-accent-yellow"><Pencil size={16}/></button>
                  <button type="button" title="Fshi" disabled={busy} onClick={() => remove(item.id)} className="text-rose-300"><Trash2 size={16}/></button>
                </div>
              </div>
            </div>
          ))}
        </section>
        <section className="space-y-4 rounded-xl border border-tertiary bg-secondary p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">{draft.id?'Modifiko Bet Builder':'Bet Builder i ri'}</h2>
            <button type="button" onClick={() => setDraft(initial())} title="Pastro" className="text-text-secondary"><RotateCcw size={17}/></button>
          </div>
          <label className="block space-y-1 text-xs text-text-secondary">
            Emri që do të shfaqet te ndeshjet
            <input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}
              placeholder="1X + Over 2.5" maxLength={80}
              className="w-full rounded border border-tertiary bg-primary px-3 py-2 text-sm text-white outline-none focus:border-accent-green"/>
          </label>
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-text-secondary">Marketet (2–5)</div>
            {draft.legs.map((leg,i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-tertiary bg-primary p-2">
                <select aria-label="Marketi" value={leg.market} onChange={e=>editLeg(i,{market:e.target.value as MarketKind})}
                  className="min-w-0 rounded bg-secondary p-2 text-xs text-white">
                  <option value="1X2">1X2</option><option value="DC">Double Chance</option>
                  <option value="BTTS">BTTS</option><option value="TOTAL">Total Goals</option>
                </select>
                <select aria-label="Zgjedhja" value={leg.outcome} onChange={e=>editLeg(i,{outcome:e.target.value})}
                  className="min-w-0 rounded bg-secondary p-2 text-xs text-white">
                  {OUTCOMES[leg.market].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
                <button type="button" title="Hiq" disabled={draft.legs.length<=2}
                  onClick={()=>setDraft({...draft,legs:draft.legs.filter((_,j)=>i!==j)})}
                  className="px-1 text-rose-300 disabled:opacity-30"><Trash2 size={15}/></button>
                {leg.market==='TOTAL' && (
                  <label className="col-span-3 flex items-center gap-3 text-xs text-text-secondary">
                    Line
                    <select value={leg.line} onChange={e=>editLeg(i,{line:e.target.value})}
                      className="rounded bg-secondary px-3 py-2 text-white">
                      {totalLines.map(l=><option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                )}
              </div>
            ))}
            <button type="button" disabled={draft.legs.length>=5}
              onClick={()=>setDraft({...draft,legs:[...draft.legs,{market:'TOTAL',outcome:'Over',line:'2.5'}]})}
              className="flex items-center gap-1 text-xs font-bold text-accent-green disabled:opacity-30"><Plus size={14}/> Shto market</button>
          </div>
          <label className="flex items-center gap-2 text-sm text-white">
            <input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>
            Aktivizo për të gjitha ndeshjet e përshtatshme
          </label>
          <button type="button" onClick={save} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded bg-accent-green px-4 py-3 font-bold text-primary disabled:opacity-50">
            <Save size={17}/> {busy?'Duke ruajtur...':'Ruaj Bet Builder'}
          </button>
        </section>
      </div>
    </div>
  );
}
