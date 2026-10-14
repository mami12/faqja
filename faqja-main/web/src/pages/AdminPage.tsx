import { useState } from 'react';
import Header from '../components/Layout/Header';
import AdminDashboard from '../components/Admin/AdminDashboard';
import UserManagement from '../components/Admin/UserManagement';
import MatchControl from '../components/Admin/MatchControl';
import TicketAudit from '../components/Admin/TicketAudit';
import { useLanguage } from '../context/LanguageContext';
import { LayoutDashboard, Users, Trophy, Ticket } from 'lucide-react';

const tabIcons: Record<string, any> = {
  dashboard: LayoutDashboard,
  users: Users,
  matches: Trophy,
  tickets: Ticket,
};

export default function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'dashboard' | 'users' | 'matches' | 'tickets'>('dashboard');

  return (
    <div className="min-h-[100dvh] bg-primary flex flex-col">
      <Header />
      <div className="bg-secondary/95 border-b border-tertiary px-3 sm:px-6">
        <div className="flex gap-2 sm:gap-4 overflow-x-auto py-2">
          {['dashboard', 'users', 'matches', 'tickets'].map(tabId => {
            const Icon = tabIcons[tabId];
            const isSelected = tab === tabId;
            return (
              <button 
                key={tabId}
                onClick={() => setTab(tabId as any)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  isSelected 
                    ? 'bg-accent-green text-primary shadow-sm' 
                    : 'text-text-secondary hover:text-white hover:bg-tertiary/60'
                }`}
              >
                {Icon && <Icon size={16} />}
                <span>{t(`admin.${tabId}`)}</span>
              </button>
            );
          })}
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
