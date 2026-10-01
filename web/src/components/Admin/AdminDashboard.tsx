import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { Users, Activity, Euro, Target } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface Stats {
  users: number;
  activeBets: number;
  totalStake: number;
  revenue: number;
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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6">
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
  );
}