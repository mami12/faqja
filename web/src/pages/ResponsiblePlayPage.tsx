import { FormEvent, useEffect, useState } from 'react';
import Header from '../components/Layout/Header';
import { apiClient } from '../api/client';

interface Controls {
  dailyLimit: number | null;
  weeklyLimit: number | null;
  monthlyLimit: number | null;
  pendingLimits: Record<string, number | null> | null;
  limitsEffectiveAt: string | null;
  selfExcludedUntil: string | null;
}

const EMPTY: Controls = {
  dailyLimit: null,
  weeklyLimit: null,
  monthlyLimit: null,
  pendingLimits: null,
  limitsEffectiveAt: null,
  selfExcludedUntil: null,
};

export default function ResponsiblePlayPage() {
  const [controls, setControls] = useState<Controls>(EMPTY);
  const [limits, setLimits] = useState({ dailyLimit: '', weeklyLimit: '', monthlyLimit: '' });
  const [exclusionDays, setExclusionDays] = useState('7');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadControls = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/me/controls');
      setControls(response.data);
      setLimits({
        dailyLimit: response.data.dailyLimit?.toString() ?? '',
        weeklyLimit: response.data.weeklyLimit?.toString() ?? '',
        monthlyLimit: response.data.monthlyLimit?.toString() ?? '',
      });
      setError('');
    } catch (requestError: any) {
      console.error(requestError);
      setError(requestError.response?.data?.message || 'Nuk u ngarkuan kufijtë e llogarisë.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadControls(); }, []);

  const saveLimits = async (event: FormEvent) => {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, value.trim() ? Number(value) : null]));
    if (Object.values(values).some((value) => value !== null && (!Number.isFinite(value) || value <= 0))) {
      setError('Vendos shuma pozitive ose lëre bosh për të mos vendosur kufi.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/me/controls/limits', values);
      await loadControls();
      alert('Kufijtë u ruajtën. Rritja ose heqja e kufirit hyn në fuqi pas 7 ditësh; ulja zbatohet menjëherë.');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Ruajtja e kufijve dështoi.');
    } finally {
      setSaving(false);
    }
  };

  const exclude = async () => {
    const days = Number(exclusionDays);
    const confirmed = window.confirm(`Do të bllokohen bastet në këtë llogari për ${days} ditë. Vetëpërjashtimi nuk mund të anulohet para përfundimit. Të vazhdohet?`);
    if (!confirmed) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiClient.post('/me/controls/self-exclusion', { days });
      setControls(response.data);
      alert('Vetëpërjashtimi u aktivizua. Hyrja në llogari mbetet e mundur, por nuk mund të vendosësh baste.');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Aktivizimi i vetëpërjashtimit dështoi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-primary text-white">
      <Header />
      <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header>
          <h1 className="text-2xl font-black">Lojë e përgjegjshme</h1>
          <p className="mt-1 text-sm text-text-secondary">Vendos kufij për shumat që luan dhe merr pushim kur të nevojitet.</p>
        </header>
        {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
        {controls.selfExcludedUntil && new Date(controls.selfExcludedUntil).getTime() > Date.now() && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            Vetëpërjashtimi është aktiv deri më <strong>{new Date(controls.selfExcludedUntil).toLocaleString('sq-AL')}</strong>. Nuk mund të vendosësh baste gjatë kësaj periudhe.
          </div>
        )}
        <section className="rounded-2xl border border-tertiary bg-secondary p-5">
          <h2 className="text-lg font-black">Kufijtë e shumës së basteve</h2>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">Kufijtë llogariten mbi bastet e vendosura. Ulja zbatohet menjëherë; rritja ose heqja e kufirit ka periudhë pritjeje 7-ditore.</p>
          {loading ? <div className="py-8 text-center text-text-secondary">Duke ngarkuar cilësimet…</div> : (
            <form onSubmit={saveLimits} className="mt-5 space-y-4">
              {([
                ['dailyLimit', 'Kufi ditor (Lëk)'],
                ['weeklyLimit', 'Kufi javor (Lëk)'],
                ['monthlyLimit', 'Kufi mujor (Lëk)'],
              ] as const).map(([key, label]) => (
                <label key={key} className="block text-sm font-semibold text-slate-200">{label}
                  <input type="number" min="0.01" step="0.01" value={limits[key]} onChange={(event) => setLimits((current) => ({ ...current, [key]: event.target.value }))} placeholder="Pa kufi" className="mt-1 block w-full rounded-lg border border-tertiary bg-primary px-3 py-2.5 text-white" />
                  {controls.pendingLimits && Object.prototype.hasOwnProperty.call(controls.pendingLimits, key) && (
                    <span className="mt-1 block text-xs text-amber-300">
                      Ndryshim në pritje: {controls.pendingLimits[key] === null ? 'pa kufi' : `${controls.pendingLimits[key]} Lëk`}
                    </span>
                  )}
                </label>
              ))}
              {controls.limitsEffectiveAt && <p className="text-xs text-amber-300">Ndryshimet në pritje hyjnë në fuqi: {new Date(controls.limitsEffectiveAt).toLocaleString('sq-AL')}</p>}
              <button disabled={saving} className="rounded-lg bg-accent-green px-5 py-2.5 text-sm font-bold text-primary disabled:opacity-50">{saving ? 'Duke ruajtur…' : 'Ruaj kufijtë'}</button>
            </form>
          )}
        </section>
        <section className="rounded-2xl border border-rose-500/25 bg-secondary p-5">
          <h2 className="text-lg font-black">Vetëpërjashtimi</h2>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">Bllokon vendosjen e basteve për periudhën e zgjedhur. Nuk mund të hiqet para kohe; mund ta zgjasësh, por jo ta shkurtohesh.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select value={exclusionDays} onChange={(event) => setExclusionDays(event.target.value)} className="rounded-lg border border-tertiary bg-primary px-3 py-2.5 text-sm text-white">
              <option value="1">1 ditë</option><option value="7">7 ditë</option><option value="30">30 ditë</option><option value="180">6 muaj</option><option value="365">12 muaj</option>
            </select>
            <button onClick={exclude} disabled={saving} className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              Aktivizo vetëpërjashtimin
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
