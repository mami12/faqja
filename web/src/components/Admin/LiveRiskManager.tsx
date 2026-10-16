import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { AlertTriangle, RotateCcw, Save, ShieldAlert, Plus, Trash2 } from 'lucide-react';

type LeaderRule = { minute: number; goals: number; maxOdds: number };
type LowOddsRule = { minute: number; maxOdds: number };
type LimitKey = 'maxLiveStake' | 'maxLivePayout' | 'maxMatchExposure';
type RiskSettings = {
  enabled: boolean;
  leaderRules: LeaderRule[];
  lowOddsRules: LowOddsRule[];
  limits: Record<LimitKey, number | null>;
};

const clone = (value: RiskSettings): RiskSettings => JSON.parse(JSON.stringify(value));
const moneyFields: { key: LimitKey; label: string; detail: string }[] = [
  { key:'maxLiveStake',label:'Shuma maksimale LIVE',detail:'Gjithsej për kërkesë, edhe kur ka shumë kolona' },
  { key:'maxLivePayout',label:'Pagesa maksimale LIVE',detail:'Shuma e pagesave të mundshme të kolonave LIVE' },
  { key:'maxMatchExposure',label:'Ekspozimi maksimal për ndeshje',detail:'Shuma konservative e pagesave të mundshme të biletave PENDING për të njëjtën ndeshje' },
];

export default function LiveRiskManager() {
  const [value,setValue] = useState<RiskSettings | null>(null);
  const [defaults,setDefaults] = useState<RiskSettings | null>(null);
  const [saving,setSaving] = useState(false);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get<{ settings: RiskSettings; defaults: RiskSettings }>('/admin/live-risk');
      setValue(clone(data.settings)); setDefaults(clone(data.defaults));
    } catch(e: any) { setError(e.response?.data?.message ?? 'Nuk u lexuan parametrat e riskut.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const editLeader = (i: number, patch: Partial<LeaderRule>) =>
    setValue(old => old && ({...old,leaderRules:old.leaderRules.map((r,j)=>i===j?{...r,...patch}:r)}));
  const editOdds = (i: number, patch: Partial<LowOddsRule>) =>
    setValue(old => old && ({...old,lowOddsRules:old.lowOddsRules.map((r,j)=>i===j?{...r,...patch}:r)}));
  const inputClasses = 'w-full min-w-0 rounded border border-tertiary bg-primary px-2 py-2 text-sm font-semibold text-white outline-none focus:border-accent-green';
  const save = async () => {
    if (!value || saving) return;
    setSaving(true);setError('');setMessage('');
    try {
      const {data} = await apiClient.put<{ settings: RiskSettings }>('/admin/live-risk',{settings:value});
      setValue(clone(data.settings));
      setMessage('Parametrat u ruajtën në databazë dhe zbatohen nga serveri.');
    } catch(e: any){setError(e.response?.data?.message ?? 'Ruajtja dështoi.');}
    finally{setSaving(false);}
  };

  if (loading) return <div className="px-6 py-10 text-text-secondary">Duke ngarkuar Live Risk Manager...</div>;
  if (!value) return (
    <div className="m-6 space-y-3 text-sm text-rose-300">{error}
      <button className="block rounded bg-secondary px-4 py-2 text-white" onClick={()=>void load()}>Riprovo</button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-6">
      <div className="rounded-xl border border-tertiary bg-secondary p-4 text-sm text-text-secondary">
        <div className="flex items-center gap-2 font-bold text-white"><ShieldAlert size={20} className="text-accent-green"/> Rregulla automatike për bastet LIVE</div>
        <p className="mt-2">Këto rregulla bllokojnë vetëm zgjedhjen e rrezikshme, jo domosdoshmërisht gjithë marketin. Dryni shfaqet në UI dhe serveri e refuzon bastin edhe nëse klienti e anashkalon butonin.</p>
        <p className="mt-1">Koeficientët e ulët nuk janë baste të sigurta. Kufijtë këtu janë parametra risku që mund t'i ndryshosh, jo garanci të një fitimi.</p>
      </div>
      {error && <div role="alert" className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {message && <div role="status" className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-tertiary bg-secondary p-4">
        <div>
          <h3 className="font-bold text-white">Live Risk Manager</h3>
          <p className="text-xs text-text-secondary">Aktivizimi i përgjithshëm i rregullave automatike dhe kufijve financiarë</p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded bg-primary px-3 py-2 text-sm text-white">
          <input type="checkbox" checked={value.enabled} onChange={e=>setValue({...value,enabled:e.target.checked})}/>
          {value.enabled ? 'Aktiv' : 'Joaktiv'}
        </label>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-tertiary bg-secondary p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white">1X2: skuadra që kryeson</h3>
              <p className="mt-1 text-xs text-text-secondary">Blloko vetëm 1 ose 2 kur plotësohen të gjitha kushtet e rreshtit.</p>
            </div>
            <button type="button" title="Shto rregull" disabled={value.leaderRules.length >= 12}
              className="rounded bg-primary p-2 text-accent-green disabled:opacity-40"
              onClick={()=>setValue({...value,leaderRules:[...value.leaderRules,{minute:70,goals:2,maxOdds:1.6}]})}><Plus size={18}/></button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_30px] gap-2 text-[11px] text-text-secondary">
            <span>Minuta ≥</span><span>Avantazhi ≥</span><span>Kuota ≤</span><span/>
          </div>
          {value.leaderRules.map((rule,i)=>(
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_30px] items-center gap-2">
              <input className={inputClasses} type="number" min={0} max={120} step={1}
                aria-label={`Minuta e rregullit ${i+1}`} value={rule.minute}
                onChange={e=>editLeader(i,{minute:Number(e.target.value)})}/>
              <input className={inputClasses} type="number" min={1} max={20} step={1}
                aria-label={`Avantazhi në gola ${i+1}`} value={rule.goals}
                onChange={e=>editLeader(i,{goals:Number(e.target.value)})}/>
              <input className={inputClasses} type="number" min={1.01} max={100} step={0.01}
                aria-label={`Koeficienti ${i+1}`} value={rule.maxOdds}
                onChange={e=>editLeader(i,{maxOdds:Number(e.target.value)})}/>
              <button type="button" aria-label={`Hiq rregullin ${i+1}`}
                className="text-rose-300 hover:text-rose-100"
                onClick={()=>setValue({...value,leaderRules:value.leaderRules.filter((_,j)=>j!==i)})}><Trash2 size={16}/></button>
            </div>
          ))}
        </section>

        <section className="space-y-3 rounded-xl border border-tertiary bg-secondary p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white">Të gjitha marketet: koeficientë të ulët</h3>
              <p className="mt-1 text-xs text-text-secondary">Zbatohet edhe për X, golat, kartonat, kornet dhe përbërësit e Bet Builder.</p>
            </div>
            <button type="button" title="Shto rregull" disabled={value.lowOddsRules.length >= 12}
              className="rounded bg-primary p-2 text-accent-green disabled:opacity-40"
              onClick={()=>setValue({...value,lowOddsRules:[...value.lowOddsRules,{minute:80,maxOdds:1.2}]})}><Plus size={18}/></button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_30px] gap-2 text-[11px] text-text-secondary">
            <span>Minuta ≥</span><span>Kuota ≤</span><span/>
          </div>
          {value.lowOddsRules.map((rule,i)=>(
            <div key={i} className="grid grid-cols-[1fr_1fr_30px] items-center gap-2">
              <input className={inputClasses} type="number" min={0} max={120} step={1}
                aria-label={`Minuta e kuotave ${i+1}`} value={rule.minute}
                onChange={e=>editOdds(i,{minute:Number(e.target.value)})}/>
              <input className={inputClasses} type="number" min={1.01} max={100} step={0.01}
                aria-label={`Koeficienti i ulët ${i+1}`} value={rule.maxOdds}
                onChange={e=>editOdds(i,{maxOdds:Number(e.target.value)})}/>
              <button type="button" aria-label={`Hiq pragun ${i+1}`}
                className="text-rose-300 hover:text-rose-100"
                onClick={()=>setValue({...value,lowOddsRules:value.lowOddsRules.filter((_,j)=>j!==i)})}><Trash2 size={16}/></button>
            </div>
          ))}
        </section>
      </div>

      <section className="space-y-3 rounded-xl border border-tertiary bg-secondary p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-accent-yellow"/>
          <h3 className="font-bold text-white">Kufijtë financiarë LIVE (Lek)</h3>
        </div>
        <p className="text-xs text-text-secondary">Vlera bosh e çaktivizon vetëm atë kufi. Ekspozimi llogaritet me shumën bruto të të gjitha pagesave të mundshme PENDING për çdo ndeshje, prandaj është kufi konservativ.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {moneyFields.map(field=>(
            <label key={field.key} className="space-y-1">
              <span className="block text-sm font-bold text-white">{field.label}</span>
              <span className="block min-h-[30px] text-xs text-text-secondary">{field.detail}</span>
              <input className={inputClasses} type="number" step="100" min="100"
                placeholder="Pa kufi" value={value.limits[field.key] ?? ''}
                onChange={e=>setValue({...value,limits:{
                  ...value.limits,[field.key]:e.target.value === '' ? null : Number(e.target.value),
                }})}/>
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={!defaults || saving} onClick={()=>defaults && setValue(clone(defaults))}
          className="inline-flex items-center gap-2 rounded border border-tertiary bg-secondary px-4 py-2 text-xs font-bold text-text-secondary hover:text-white">
          <RotateCcw size={15}/> Kthe parametrat fillestarë (pa ruajtur)
        </button>
        <button type="button" disabled={saving} onClick={save}
          className="inline-flex items-center gap-2 rounded bg-accent-green px-6 py-3 text-sm font-black text-primary disabled:opacity-50">
          <Save size={17}/> {saving ? 'Duke ruajtur...' : 'Ruaj parametrat'}
        </button>
      </div>
    </div>
  );
}
