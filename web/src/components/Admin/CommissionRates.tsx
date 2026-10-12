import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { apiClient } from '../../api/client';

interface Rates {
  single: number;
  double: number;
  multi: number;
}

export default function CommissionRates() {
  const [rates, setRates] = useState<Rates>({ single: 3, double: 5, multi: 7 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/admin/commission-rates')
      .then((response) => setRates(response.data))
      .catch((error) => {
        console.error(error);
        alert('Nuk u lexuan normat e komisionit.');
      })
      .finally(() => setLoading(false));
  }, []);

  const setRate = (tier: keyof Rates, value: string) => {
    setRates((current) => ({ ...current, [tier]: value === '' ? 0 : Number(value) }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (Object.values(rates).some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      alert('Çdo komision duhet të jetë nga 0% deri në 100%.');
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.patch('/admin/commission-rates', rates);
      setRates(response.data);
      alert('Normat e komisionit u ruajtën.');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Ruajtja e komisioneve dështoi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-secondary p-5">
      <div className="mb-4">
        <h3 className="text-lg font-black text-white">Komisionet e menaxherëve</h3>
        <p className="mt-1 text-xs text-text-secondary">Ndryshimi zbatohet për bastet e reja. Bastet e vendosura ruajnë komisionin e regjistruar.</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {([
          ['single', 'Teke (1 zgjedhje)'],
          ['double', 'Dyshe (2 zgjedhje)'],
          ['multi', 'Shumëfishe (3+)'],
        ] as const).map(([tier, label]) => (
          <label key={tier} className="flex-1 text-xs font-semibold text-text-secondary">
            {label}
            <div className="mt-1 flex items-center rounded-lg border border-tertiary bg-primary px-3">
              <input
                aria-label={label}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={loading ? '' : rates[tier]}
                onChange={(event) => setRate(tier, event.target.value)}
                disabled={loading || saving}
                className="w-full bg-transparent py-2.5 text-sm font-bold text-white outline-none"
              />
              <span className="text-accent-yellow">%</span>
            </div>
          </label>
        ))}
        <button
          type="submit"
          disabled={loading || saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-green px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
        >
          <Save size={16} /> {saving ? 'Duke ruajtur…' : 'Ruaj normat'}
        </button>
      </form>
    </section>
  );
}
