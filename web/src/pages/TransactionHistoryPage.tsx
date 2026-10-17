import { FormEvent, useEffect, useState } from 'react';
import type { Ticket } from '../types';
import { formatMarketSelectionLabel, formatTicketSelection } from '../utils/sportsbookLabels';
import { useLanguage } from '../context/LanguageContext';
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

interface TransactionSummary {
  winnings: number;
  losses: number;
  net: number;
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


type BetFilter = 'ALL' | 'WON' | 'LOST' | 'PENDING' | 'CANCELLED' | 'REJECTED';
type RejectedAttempt = {
  kind: 'REJECTED';
  id: string;
  status: 'REJECTED';
  placedAt: string;
  stake: number | null;
  selectionCount: number;
  reason: string;
};
type BetActivity = (Ticket & { kind: 'TICKET' }) | RejectedAttempt;

const BET_FILTER_LABELS: Record<BetFilter, string> = {
  ALL: 'Të gjitha',
  WON: 'Fituese',
  LOST: 'Humbëse',
  PENDING: 'Në pritje',
  CANCELLED: 'Të anulluara',
  REJECTED: 'Të refuzuara',
};
const BET_STATUS_LABELS: Record<string, string> = {
  WON: 'Fitues', LOST: 'Humbës', PENDING: 'Në pritje',
  CANCELLED: 'Anulluar', REVERTED: 'Anulluar', VOID: 'Rimbursuar',
  REJECTED: 'Refuzuar',
};
const betStatusClass = (status: string) =>
  status === 'WON' ? 'text-emerald-300' :
  status === 'PENDING' ? 'text-amber-300' :
  ['CANCELLED', 'REVERTED', 'VOID'].includes(status) ? 'text-slate-300' :
  'text-rose-300';

export default function TransactionHistoryPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [betFilter, setBetFilter] = useState<BetFilter>('ALL');
  const [betEntries, setBetEntries] = useState<BetActivity[]>([]);
  const [betRange, setBetRange] = useState<ReturnType<typeof toDateRange>>({ from: undefined, to: undefined });
  const [betRefresh, setBetRefresh] = useState(0);
  const [betLoading, setBetLoading] = useState(false);
  const [betError, setBetError] = useState('');

  const fetchTransactions = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError('');
    setBetRange(toDateRange(from, to));
    const endpoint = user?.role === 'ADMIN'
      ? '/admin/transactions'
      : user?.role === 'MANAGER'
        ? '/manager/transactions'
        : '/me/transactions';
    try {
      const params = { ...toDateRange(from, to), limit: 500 };
      const [response, summaryResponse] = await Promise.all([
        apiClient.get(endpoint, { params }),
        user?.role === 'PLAYER'
          ? apiClient.get('/me/transactions/summary', { params })
          : Promise.resolve(null),
      ]);
      setTransactions(response.data);
      setSummary(summaryResponse?.data ?? null);
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

  useEffect(() => {
    if (user?.role !== 'PLAYER') return;
    let active = true;
    setBetLoading(true);
    setBetError('');
    void apiClient.get('/me/bets', {
      params: { status: betFilter, ...betRange, limit: 500 },
    }).then(response => {
      if (active) setBetEntries(response.data);
    }).catch((e: any) => {
      if (active) setBetError(e.response?.data?.message || 'Nuk u ngarkuan bastet.');
    }).finally(() => {
      if (active) setBetLoading(false);
    });
    return () => { active = false; };
  }, [user?.role, user?.id, betFilter, betRange, betRefresh]);

  return (
    <div className="min-h-[100dvh] bg-primary text-white">
      {!embedded && <Header />}
      <main className={`mx-auto w-full max-w-7xl space-y-3 p-3 sm:p-5 ${embedded ? '' : 'flex-1'}`}>
        <header>
          <h1 className="text-lg sm:text-xl font-bold">Historiku i transaksioneve</h1>
          <p className="mt-1 text-xs text-text-secondary">
            {user?.role === 'ADMIN' ? 'Të gjitha lëvizjet financiare në platformë.'
              : user?.role === 'MANAGER' ? 'Transaksionet e portofolit tënd dhe të lojtarëve të tu.'
                : 'Depozitat, bastet dhe pagesat e llogarisë tënde.'}
          </p>
        </header>
        <form onSubmit={fetchTransactions} className="flex flex-col gap-2 border border-tertiary bg-secondary p-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-semibold text-text-secondary">Nga data
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block w-full border border-tertiary bg-primary px-3 py-2 text-white" />
          </label>
          <label className="flex-1 text-xs font-semibold text-text-secondary">Deri më
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block w-full border border-tertiary bg-primary px-3 py-2 text-white" />
          </label>
          <button type="submit" className="bg-accent-yellow px-5 py-2.5 text-sm font-bold text-[#17212c] hover:brightness-110">Filtro</button>
        </form>
        {user?.role === 'PLAYER' && summary && (
          <section aria-label="Përmbledhja e fitimeve dhe humbjeve" className="grid gap-2 sm:grid-cols-3">
            {[
              { label: 'Fitimet', value: summary.winnings, color: 'text-amber-200' },
              { label: 'Humbjet', value: summary.losses, color: 'text-rose-300' },
              { label: 'Bilanci neto', value: summary.net, color: summary.net >= 0 ? 'text-amber-200' : 'text-rose-300' },
            ].map((item) => (
              <div key={item.label} className="border border-tertiary bg-secondary p-3">
                <div className="text-xs font-semibold text-text-secondary">{item.label}</div>
                <div className={`mt-1 font-mono text-xl font-black ${item.color}`}>
                  {item.value.toFixed(2)} Lëk
                </div>
              </div>
            ))}
          </section>
        )}
        {user?.role === 'PLAYER' && (
          <section aria-label="Bastet e mia sipas statusit" className="border border-tertiary bg-secondary">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-tertiary bg-[#303d4d] p-3">
              <div>
                <h2 className="text-sm font-bold text-white">Bastet e mia</h2>
                <p className="mt-1 text-[11px] text-text-secondary">
                  Shiko kuponët sipas statusit dhe datës së vendosjes.
                </p>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-200">
                  Statusi
                  <select value={betFilter} onChange={e => setBetFilter(e.target.value as BetFilter)}
                    aria-label="Filtro bastet sipas statusit"
                    className="min-w-[155px] border border-[#64748b] bg-[#182432] px-2 py-2 text-xs text-white focus:outline-none focus:border-accent-yellow">
                    {(Object.keys(BET_FILTER_LABELS) as BetFilter[]).map(status => (
                      <option key={status} value={status}>{BET_FILTER_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => setBetRefresh(n => n + 1)}
                  className="border border-tertiary bg-[#435269] px-3 py-2 text-xs font-semibold text-white hover:bg-[#52647c]">
                  Rifresko
                </button>
              </div>
            </div>
            {betFilter === 'REJECTED' && (
              <p className="border-b border-tertiary/60 px-3 py-2 text-[11px] text-text-secondary">
                Këtu shfaqen kërkesat e refuzuara nga serveri pas aktivizimit të këtij regjistrimi.
                Ato nuk janë bileta të pranuara dhe nuk kanë zbritur para nga llogaria.
              </p>
            )}
            {betLoading ? <div className="p-8 text-center text-text-secondary text-xs">Duke ngarkuar bastet…</div> :
              betError ? <div className="p-6 text-center text-rose-300 text-xs" role="alert">{betError}</div> :
              betEntries.length === 0 ? (
                <div className="p-8 text-center text-text-secondary text-xs">Nuk ka baste për këtë filtër dhe periudhë.</div>
              ) : (
                <>
                  <p className="border-b border-tertiary/60 px-3 py-2 text-[11px] text-text-secondary">
                    {betEntries.length} rezultate {betEntries.length === 500 ? '(maksimumi 500 më të fundit për filtrin)' : ''}
                  </p>
                  <div className="max-h-[560px] divide-y divide-tertiary/70 overflow-y-auto">
                    {betEntries.map(entry => (
                      <details key={entry.kind + entry.id} className="group px-3 py-2.5 open:bg-[#283747]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] font-bold text-white">{entry.id.slice(0,8).toUpperCase()}</span>
                              <span className={'text-[11px] font-bold ' + betStatusClass(entry.status)}>
                                {BET_STATUS_LABELS[entry.status] ?? entry.status}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-200">
                              {entry.kind === 'REJECTED'
                                ? 'Kërkesë e refuzuar (' + entry.selectionCount + ' zgjedhje)'
                                : entry.lines?.map(line => line.matchName).filter((name, idx, all) => all.indexOf(name) === idx).join(' · ') || 'Biletë'}
                            </div>
                            <div className="mt-1 text-[10px] text-text-secondary">
                              {new Date(entry.placedAt).toLocaleString('sq-AL')}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-bold tabular-nums text-amber-200">
                              {entry.stake == null ? '—' : entry.stake.toFixed(2) + ' Lëk'}
                            </div>
                            <div className="text-[10px] text-text-secondary">Shuma</div>
                            <span className="text-[10px] text-text-secondary">Detajet ▾</span>
                          </div>
                        </summary>
                        {entry.kind === 'REJECTED' ? (
                          <div className="mt-3 border-t border-tertiary/60 pt-2 text-xs text-rose-200">
                            Arsyeja: {entry.reason}
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2 border-t border-tertiary/60 pt-2">
                            {entry.lines?.map(line => (
                              <div key={line.id} className="flex items-start justify-between gap-2 text-[11px]">
                                <div className="min-w-0">
                                  <div className="font-semibold text-white">{line.matchName}</div>
                                  <div className="text-text-secondary">
                                    {formatMarketSelectionLabel(line.marketName, line.marketLine, t)} ·{' '}
                                    {formatTicketSelection(line.outcomeName, line.marketName, line.matchName, t, line.outcomeCode, line.marketLine)}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="font-mono text-amber-200">@{line.oddsAtPlacement.toFixed(2)}</div>
                                  <div className={betStatusClass(line.status)}>{BET_STATUS_LABELS[line.status] ?? line.status}</div>
                                </div>
                              </div>
                            ))}
                            <div className="flex flex-wrap justify-between gap-2 border-t border-tertiary/60 pt-2 text-[11px]">
                              <span className="text-slate-300">Koeficienti total: <strong>{entry.totalOdds.toFixed(2)}</strong></span>
                              <span className="text-slate-300">
                                {entry.status === 'WON' ? 'Pagesa' : 'Pagesa e mundshme'}:
                                <strong className="ml-1 text-amber-200">{entry.potentialPayout.toFixed(2)} Lëk</strong>
                              </span>
                            </div>
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                </>
              )}
          </section>
        )}
        <section className="overflow-hidden border border-tertiary bg-secondary">
          {!loading && !error && <div className="border-b border-tertiary bg-[#394758] px-3 py-2 text-[11px] font-semibold text-slate-200">{transactions.length} transaksione</div>}
          {loading ? <div className="p-16 text-center text-text-secondary">Duke ngarkuar transaksionet…</div>
            : error ? <div role="alert" className="p-8 text-center text-rose-300">{error}</div>
              : transactions.length === 0 ? <div className="p-12 text-center text-text-secondary">Nuk ka transaksione për këtë periudhë.</div>
                : (
                  <>
                    {/* MOBILE VIEW: Cards (< md) */}
                    <div className="block md:hidden divide-y divide-tertiary/60">
                      {transactions.map((transaction) => {
                        const isPositive = transaction.amount >= 0;
                        return (
                          <div key={transaction.id} className="px-3 py-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-white text-xs">
                                  {TYPE_LABELS[transaction.type] ?? transaction.type}
                                </div>
                                {user?.role !== 'PLAYER' && (
                                  <div className="text-[11px] text-text-secondary font-medium">
                                    Llogaria: <span className="text-white font-semibold">{transaction.username}</span>
                                  </div>
                                )}
                              </div>
                              <span className={`text-sm font-black tabular-nums ${isPositive ? 'text-amber-300' : 'text-rose-300'}`}>
                                {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)} Lëk
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-text-secondary pt-1 border-t border-tertiary/40">
                              <span>Bilanci pas: <strong className="text-white font-mono">{transaction.balanceAfter.toFixed(2)} Lëk</strong></span>
                              <span>{new Date(transaction.createdAt).toLocaleString('sq-AL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            {transaction.description && (
                              <div className="text-[11px] text-text-secondary bg-primary/50 px-2 py-1 border-l-2 border-tertiary">
                                {transaction.description}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP VIEW: Table (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full min-w-[780px] text-left text-sm">
                        <thead className="bg-[#394758] text-[11px] uppercase text-text-secondary font-bold tracking-wider">
                          <tr>
                            <th className="p-3">Data & Ora</th>
                            {user?.role !== 'PLAYER' && <th className="p-3">Llogaria</th>}
                            <th className="p-3">Lloji</th>
                            <th className="p-3">Përshkrimi</th>
                            <th className="p-3 text-right">Shuma</th>
                            <th className="p-3 text-right">Bilanci pas veprimit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-tertiary/60">
                          {transactions.map((transaction) => (
                            <tr key={transaction.id} className="text-white hover:bg-primary/40 transition">
                              <td className="p-3 whitespace-nowrap text-xs text-text-secondary tabular-nums">
                                {new Date(transaction.createdAt).toLocaleString('sq-AL')}
                              </td>
                              {user?.role !== 'PLAYER' && <td className="p-3 font-semibold">{transaction.username}</td>}
                              <td className="p-3 font-semibold text-xs">{TYPE_LABELS[transaction.type] ?? transaction.type}</td>
                              <td className="p-3 text-xs text-text-secondary">{transaction.description || '—'}</td>
                              <td className={`p-3 text-right font-mono font-black tabular-nums ${transaction.amount >= 0 ? 'text-amber-300' : 'text-rose-300'}`}>
                                {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)} Lëk
                              </td>
                              <td className="p-3 text-right font-mono tabular-nums text-xs font-bold text-text-secondary">{transaction.balanceAfter.toFixed(2)} Lëk</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
        </section>
      </main>
    </div>
  );
}
