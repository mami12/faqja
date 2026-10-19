import { useState } from 'react';
import Header from '../components/Layout/Header';
import AdminDashboard from '../components/Admin/AdminDashboard';
import UserManagement from '../components/Admin/UserManagement';
import MatchControl from '../components/Admin/MatchControl';
import BetBuilderManager from '../components/Admin/BetBuilderManager';
import LiveRiskManager from '../components/Admin/LiveRiskManager';
import TicketAudit from '../components/Admin/TicketAudit';
import { useLanguage } from '../context/LanguageContext';
import AdminAuditLog from '../components/Admin/AdminAuditLog';
import TransactionHistoryPage from './TransactionHistoryPage';
import CasinoFinanceCenter from '../components/Finance/CasinoFinanceCenter';
import CasinoSettings from '../components/Admin/CasinoSettings';
import { LayoutDashboard, Users, Trophy, Ticket, ClipboardList, Receipt, ShieldCheck, ChevronRight, Layers, ShieldAlert, Dices } from 'lucide-react';

type AdminTab = 'dashboard' | 'users' | 'matches' | 'builders' | 'risk' | 'tickets' | 'transactions' | 'audit' | 'casino-finance' | 'casino-settings';
const sections: { title: string; items: { id: AdminTab; label: string; description: string; icon: typeof Users }[] }[] = [
  {
    title: 'Përmbledhja',
    items: [{ id: 'dashboard', label: 'Paneli kryesor', description: 'Statistikat dhe financat', icon: LayoutDashboard }],
  },
  {
    title: 'Menaxhimi',
    items: [
      { id: 'users', label: 'Përdoruesit', description: 'Lojtarë, menaxherë dhe bilance', icon: Users },
      { id: 'matches', label: 'Ndeshjet dhe kuotat', description: 'Pezullime dhe ndryshime kuotash', icon: Trophy },
      { id: 'builders', label: 'Bet Builder', description: 'Kombinime universale nga API', icon: Layers },
      { id: 'risk', label: 'Menaxhimi i rrezikut', description: 'Mbyllja e tregjeve dhe kufijtë e basteve LIVE', icon: ShieldAlert },
      { id: 'tickets', label: 'Skedinat', description: 'Kontrolli i basteve', icon: Ticket },
      { id: 'casino-settings', label: 'Cilësimet Kazino / RTP', description: 'Profile të verifikuara dhe aktivizimi', icon: Dices },
    ],
  },
  {
    title: 'Raportet',
    items: [
      { id: 'transactions', label: 'Transaksionet', description: 'Lëvizjet financiare', icon: Receipt },
      { id: 'casino-finance', label: 'Financat Sport + Kazino', description: 'Përdoruesit, fitimet dhe humbjet', icon: Dices },
      { id: 'audit', label: 'Regjistri', description: 'Historiku i veprimeve', icon: ClipboardList },
    ],
  },
];
const allItems = sections.flatMap(section => section.items);

export default function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const active = allItems.find(item => item.id === tab)!;
  const ActiveIcon = active.icon;

  return (
    <div className="min-h-[100dvh] bg-primary flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0 w-full">
        <aside className="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col border-r border-tertiary bg-secondary/75 px-3 py-5">
          <div className="flex items-center gap-3 px-3 pb-6 border-b border-tertiary/70">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-accent-green/15 text-accent-green">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="font-black text-white">Administrimi</div>
              <div className="text-xs text-text-secondary">Qendra e kontrollit</div>
            </div>
          </div>
          <nav aria-label="Menuja e administratorit" className="mt-5 space-y-5">
            {sections.map(section => (
              <div key={section.title}>
                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-text-secondary">{section.title}</div>
                <div className="space-y-1">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    const selected = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={selected ? 'page' : undefined}
                        onClick={() => setTab(item.id)}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${selected ? 'bg-accent-green/15 text-accent-green ring-1 ring-accent-green/30' : 'text-text-secondary hover:text-white hover:bg-tertiary/70'}`}
                      >
                        <Icon size={19} className="shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold">{item.label}</span>
                          <span className="block truncate text-[11px] opacity-75">{item.description}</span>
                        </span>
                        {selected && <ChevronRight size={15} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="lg:hidden sticky top-0 z-20 border-b border-tertiary bg-secondary/95 backdrop-blur-md">
            <nav aria-label="Menuja e administratorit" className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {allItems.map(item => {
                const Icon = item.icon;
                const selected = item.id === tab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => setTab(item.id)}
                    className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold whitespace-nowrap transition-colors ${selected ? 'bg-accent-green text-primary' : 'bg-primary text-text-secondary hover:text-white'}`}
                  >
                    <Icon size={15} /> {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <main className="min-w-0 pb-10">
            <div className="mx-auto max-w-7xl px-3 pt-5 pb-1 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary border border-tertiary text-accent-green">
                  <ActiveIcon size={19} />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white">{active.label}</h1>
                  <p className="text-xs sm:text-sm text-text-secondary">{active.description}</p>
                </div>
              </div>
            </div>
            {tab === 'dashboard' && <AdminDashboard />}
            {tab === 'users' && <UserManagement />}
            {tab === 'matches' && <MatchControl />}
            {tab === 'builders' && <BetBuilderManager />}
            {tab === 'risk' && <LiveRiskManager />}
            {tab === 'tickets' && <TicketAudit />}
            {tab === 'transactions' && <TransactionHistoryPage embedded />}
            {tab === 'audit' && <AdminAuditLog />}
            {tab === 'casino-finance' && <CasinoFinanceCenter role="admin" />}
            {tab === 'casino-settings' && <CasinoSettings />}
          </main>
        </div>
      </div>
    </div>
  );
}
