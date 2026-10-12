import { useState } from 'react';
import Header from '../components/Layout/Header';
import AdminDashboard from '../components/Admin/AdminDashboard';
import UserManagement from '../components/Admin/UserManagement';
import MatchControl from '../components/Admin/MatchControl';
import TicketAudit from '../components/Admin/TicketAudit';
import { useLanguage } from '../context/LanguageContext';
import AdminAuditLog from '../components/Admin/AdminAuditLog';
import TransactionHistoryPage from './TransactionHistoryPage';
import { LayoutDashboard, Users, Trophy, Ticket, ClipboardList, Receipt } from 'lucide-react';

const tabIcons: Record<string, any> = {
  dashboard: LayoutDashboard,
  users: Users,
  matches: Trophy,
  tickets: Ticket,
  audit: ClipboardList,
  transactions: Receipt,
};

export default function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'dashboard' | 'users' | 'matches' | 'tickets' | 'audit' | 'transactions'>('dashboard');
  const tabs = ['dashboard', 'users', 'matches', 'tickets', 'transactions', 'audit'] as const;

  return (
    <div className="min-h-[100dvh] bg-primary flex flex-col">
      <Header />
      <div className="bg-secondary/95 border-b border-tertiary px-3 sm:px-6">
        <div className="flex gap-2 sm:gap-4 overflow-x-auto py-2">
          {tabs.map(tabId => {
            const Icon = tabIcons[tabId];
            const isSelected = tab === tabId;
            return (
              <button 
                key={tabId}
                onClick={() => setTab(tabId)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  isSelected 
                    ? 'bg-accent-green text-primary shadow-sm' 
                    : 'text-text-secondary hover:text-white hover:bg-tertiary/60'
                }`}
              >
                {Icon && <Icon size={16} />}
                <span>{tabId === 'transactions' ? 'Transaksionet' : tabId === 'audit' ? 'Regjistri' : t(`admin.${tabId}`)}</span>
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
        {tab === 'transactions' && <TransactionHistoryPage embedded />}
        {tab === 'audit' && <AdminAuditLog />}
      </div>
    </div>
  );
}
