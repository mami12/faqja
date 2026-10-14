import { FormEvent, useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { toDateRange } from '../../utils/dateFilters';

interface AuditEntry {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: { input?: Record<string, unknown> };
  createdAt: string;
}

export default function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEntries = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.get('/admin/audit-log', { params: { ...toDateRange(from, to), limit: 500 } });
      setEntries(result.data);
    } catch (requestError: any) {
      console.error(requestError);
      setError(requestError.response?.data?.message || 'Nuk u ngarkua regjistri i veprimeve.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchEntries(); }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header>
        <h2 className="text-2xl font-black text-white">Regjistri i veprimeve</h2>
        <p className="mt-1 text-sm text-text-secondary">Regjistron ndryshimet financiare, llogaritë, kuotat dhe rezultatet e kryera nga administratori ose menaxherët.</p>
      </header>
      <form onSubmit={fetchEntries} className="flex flex-col gap-3 rounded-2xl border border-tertiary bg-secondary p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-semibold text-text-secondary">Nga data
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block w-full rounded-lg border border-tertiary bg-primary px-3 py-2 text-white" />
        </label>
        <label className="flex-1 text-xs font-semibold text-text-secondary">Deri më
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block w-full rounded-lg border border-tertiary bg-primary px-3 py-2 text-white" />
        </label>
        <button type="submit" className="rounded-lg bg-accent-green px-5 py-2.5 text-sm font-bold text-primary">Filtro</button>
      </form>
      <section className="overflow-hidden rounded-2xl border border-tertiary bg-secondary">
        {loading ? <div className="p-8 text-center text-text-secondary">Duke ngarkuar regjistrin…</div>
          : error ? <div role="alert" className="p-8 text-center text-rose-300">{error}</div>
            : entries.length === 0 ? <div className="p-8 text-center text-text-secondary">Nuk ka veprime në këtë periudhë.</div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-tertiary/60 text-xs uppercase text-text-secondary">
                      <tr><th className="p-3">Data</th><th className="p-3">Kush</th><th className="p-3">Veprimi</th><th className="p-3">Objekti</th><th className="p-3">Detajet</th></tr>
                    </thead>
                    <tbody className="divide-y divide-tertiary">
                      {entries.map((entry) => (
                        <tr key={entry.id} className="text-white">
                          <td className="p-3 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString('sq-AL')}</td>
                          <td className="p-3">{entry.actorName} <span className="text-xs text-text-secondary">({entry.actorRole === 'ADMIN' ? 'Admin' : 'Menaxher'})</span></td>
                          <td className="p-3 font-mono text-xs">{entry.action}</td>
                          <td className="p-3">{entry.targetType}{entry.targetId ? ` · ${entry.targetId}` : ''}</td>
                          <td className="p-3 text-xs text-text-secondary">{JSON.stringify(entry.details?.input ?? {})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </section>
    </div>
  );
}
