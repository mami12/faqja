import { useState } from 'react';
import Header from '../components/Layout/Header';
import AdminDashboard from '../components/Admin/AdminDashboard';
import UserManagement from '../components/Admin/UserManagement';
import MatchControl from '../components/Admin/MatchControl';
import TicketAudit from '../components/Admin/TicketAudit';
import { useLanguage } from '../context/LanguageContext';

export default function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'dashboard' | 'users' | 'matches' | 'tickets'>('dashboard');

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <Header />
      <div className="bg-secondary border-b border-tertiary px-6">
        <div className="flex gap-8">
          {['dashboard', 'users', 'matches', 'tickets'].map(tabId => (
            <button 
              key={tabId}
              onClick={() => setTab(tabId as any)}
              className={`py-4 font-semibold capitalize ${tab === tabId ? 'text-accent-green border-b-2 border-accent-green' : 'text-text-secondary hover:text-white'}`}
            >
              {t(`admin.${tabId}`)}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {tab === 'dashboard' && <AdminDashboard />}
        {tab === 'users' && <UserManagement />}
        {tab === 'matches' && <MatchControl />}
        {tab === 'tickets' && <TicketAudit />}
      </div>
    </div>
  );
}
