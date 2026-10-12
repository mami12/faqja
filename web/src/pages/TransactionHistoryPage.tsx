import { FormEvent, useEffect, useState } from 'react';
import Header from '../components/Layout/Header';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toDateRange } from '../utils/dateFilters';

interface Transaction {
  id: string;
  username: string;
  userRole: string;
  amount: number;
  type: string;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Depozitim',
  WITHDRAWAL: 'Tërheqje',
  BET_PLACED: 'Bast i vendosur',
  BET_WON: 'Bast fitues',
  BET_REFUND: 'Rimbursim basti',
  TICKET_REVERT: 'Anulim bilete',
  MANAGER_PLAYER_FUNDING: 'Fonde dhënë lojtarit',
  MANAGER_PLAYER_RETURN: 'Fonde të kthyera nga lojtari',
  MANAGER_COMMISSION_DEBIT: 'Komision i zbritur',
  MANAGER_COMMISSION_REFUND: 'Komision i kthyer',
  MANAGER_PAYOUT_DEDUCTION: 'Pagesë fitimi',
  MANAGER_LOST_COLLECTED: 'Fonde nga bast humbës',
};

export default function TransactionHistoryPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTransactions = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = user?.role === 'ADMIN'
      ? '/admin/transactions'
      : user?.role === 'MANAGER'
        ? '/manager/transactions'
        : '/me/transactions';
    try {
      const response = await apiClient.get(endpoint, { params: { ...toDateRange(from, to), limit: 500 } });
      setTransactions(response.data);
    } catch (requestError: any) {
      console.error(requestError);
      setError(requestError.response?.data?.message || 'Nuk u ngarkua historiku i transaksioneve.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTransactions();
  }, [user?.role]);

  return (
    <div className="min-h-[100dvh] bg-primary text-white">
      {!embedded && <Header />}
      <main className={`mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 ${embedded ? '' : 'flex-1'}`}>
        <header>
          <h1 className="text-2xl font-black">Historiku i transaksioneve</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {user?.role === 'ADMIN' ? 'Të gjitha lëvizjet financiare në platformë.'
              : user?.role === 'MANAGER' ? 'Transaksionet e portofolit tënd dhe të lojtarëve të tu.'
                : 'Depozitat, bastet dhe pagesat e llogarisë tënde.'}
          </p>
        </header>
        <form onSubmit={fetchTransactions} className="flex flex-col gap-3 rounded-2xl border border-tertiary bg-secondary p-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-semibold text-text-secondary">Nga data
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block w-full rounded-lg border border-tertiary bg-primary px-3 py-2 text-white" />
          </label>
          <label className="flex-1 text-xs font-semibold text-text-secondary">Deri më
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block w-full rounded-lg border border-tertiary bg-primary px-3 py-2 text-white" />
          </label>
          <button type="submit" className="rounded-lg bg-accent-green px-5 py-2.5 text-sm font-bold text-primary">Filtro</button>
        </form>
        <section className="overflow-hidden rounded-2xl border border-tertiary bg-secondary">
          {loading ? <div className="p-8 text-center text-text-secondary">Duke ngarkuar transaksionet…</div>
            : error ? <div role="alert" className="p-8 text-center text-rose-300">{error}</div>
              : transactions.length === 0 ? <div className="p-8 text-center text-text-secondary">Nuk ka transaksione për këtë periudhë.</div>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="bg-tertiary/60 text-xs uppercase text-text-secondary">
                        <tr>
                          <th className="p-3">Data</th>
                          {user?.role !== 'PLAYER' && <th className="p-3">Llogaria</th>}
                          <th className="p-3">Lloji</th>
                          <th className="p-3">Përshkrimi</th>
                          <th className="p-3 text-right">Shuma</th>
                          <th className="p-3 text-right">Bilanci pas veprimit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-tertiary">
                        {transactions.map((transaction) => (
                          <tr key={transaction.id} className="text-white">
                            <td className="p-3 whitespace-nowrap">{new Date(transaction.createdAt).toLocaleString('sq-AL')}</td>
                            {user?.role !== 'PLAYER' && <td className="p-3">{transaction.username}</td>}
                            <td className="p-3">{TYPE_LABELS[transaction.type] ?? transaction.type}</td>
                            <td className="p-3 text-text-secondary">{transaction.description || '—'}</td>
                            <td className={`p-3 text-right font-mono font-bold ${transaction.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)} Lëk
                            </td>
                            <td className="p-3 text-right font-mono">{transaction.balanceAfter.toFixed(2)} Lëk</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
        </section>
      </main>
    </div>
  );
}
