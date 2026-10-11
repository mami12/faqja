import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { Users, Activity, Euro, Target } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface Stats {
  users: number;
  activeBets: number;
  totalStake: number;
  revenue: number;
  managers?: Array<{
    id: string;
    username: string;
    playerCount: number;
    playerBalance: number;
    balance: number;
    totalStake: number;
    wonPayouts: number;
    lostStake: number;
    commission: number;
    netDifference: number;
  }>;
}

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<Stats>({ users: 0, activeBets: 0, totalStake: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/admin/stats')
      .then(res => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { title: t('admin.total_users'), value: stats.users, icon: Users, color: 'text-blue-500' },
    { title: t('admin.active_bets_today'), value: stats.activeBets, icon: Activity, color: 'text-accent-yellow' },
    { title: t('admin.total_stake_today'), value: `${stats.totalStake.toFixed(2)} Lëk`, icon: Euro, color: 'text-accent-green' },
    { title: t('admin.total_revenue'), value: `${stats.revenue.toFixed(2)} Lëk`, icon: Target, color: 'text-accent-red' },
  ];

  if (loading) {
    return (
      <div className="p-12 text-center text-text-secondary">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {cards.map((c, i) => (
          <div key={i} className="bg-secondary p-6 rounded-lg border border-tertiary flex items-center gap-4">
            <div className={`p-4 bg-primary rounded-full ${c.color}`}>
              <c.icon size={24} />
            </div>
            <div>
              <div className="text-text-secondary text-sm">{c.title}</div>
              <div className="text-2xl font-bold text-white">{c.value}</div>
            </div>
          </div>
        ))}
      </div>
      <section className="bg-secondary rounded-xl border border-tertiary overflow-hidden">
        <div className="p-5 border-b border-tertiary">
          <h3 className="text-lg font-bold text-white">Pasqyra financiare e menaxherëve</h3>
          <p className="text-sm text-text-secondary">Bilanci, aktiviteti i lojtarëve dhe diferenca neto</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-tertiary/60 uppercase text-[11px] text-text-secondary">
              <tr>
                <th className="p-3">Menaxheri</th>
                <th className="p-3 text-right">Lojtarë</th>
                <th className="p-3 text-right">Fonde të luajtura</th>
                <th className="p-3 text-right">Pagesa fituese</th>
                <th className="p-3 text-right">Humbje</th>
                <th className="p-3 text-right">Komision</th>
                <th className="p-3 text-right">Bilanci i lojtarëve</th>
                <th className="p-3 text-right">Bilanci</th>
                <th className="p-3 text-right">Diferenca</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tertiary">
              {stats.managers?.map((manager) => (
                <tr key={manager.id} className="text-white">
                  <td className="p-3 font-semibold">{manager.username}</td>
                  <td className="p-3 text-right">{manager.playerCount}</td>
                  <td className="p-3 text-right">{manager.totalStake.toFixed(2)} Lëk</td>
                  <td className="p-3 text-right">{manager.wonPayouts.toFixed(2)} Lëk</td>
                  <td className="p-3 text-right">{manager.lostStake.toFixed(2)} Lëk</td>
                  <td className="p-3 text-right">{manager.commission.toFixed(2)} Lëk</td>
                  <td className="p-3 text-right">{manager.playerBalance.toFixed(2)} Lëk</td>
                  <td className="p-3 text-right">{manager.balance.toFixed(2)} Lëk</td>
                  <td className={`p-3 text-right font-bold ${manager.netDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {manager.netDifference >= 0 ? '+' : ''}{manager.netDifference.toFixed(2)} Lëk
                  </td>
                </tr>
              ))}
              {!stats.managers?.length && (
                <tr><td colSpan={9} className="p-6 text-center text-text-secondary">Nuk ka menaxherë për t’u shfaqur.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="text-xs text-text-secondary px-1">
        Komisioni për skedina të mbyllura: 3% për 1 zgjedhje, 5% për 2 dhe 7% për 3 ose më shumë.
      </div>
    </div>
  );
}