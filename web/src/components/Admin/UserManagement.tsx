import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { User } from '../../types';
import { Plus, ShieldAlert, CheckCircle, Ban, ArrowDownRight, ArrowUpRight, Trash2, Edit3, Users as UsersIcon, Search, X, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const PRESET_AMOUNTS = [100, 500, 1000, 2000, 5000, 10000];

export default function UserManagement() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'PLAYER' | 'MANAGER' | 'ADMIN'>('ALL');
  
  // New User Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState('100');
  const [role, setRole] = useState('PLAYER');
  const [managerId, setManagerId] = useState('');

  // Edit User Form State
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('');

  const managers = users.filter(u => u.role === 'MANAGER');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/users');
      setUsers(res.data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/admin/users', {
        username,
        password,
        initialBalance: parseFloat(initialBalance) || 0,
        role,
        managerId: role === 'PLAYER' ? managerId || null : null
      });
      setShowCreateModal(false);
      setUsername('');
      setPassword('');
      setInitialBalance('100');
      setRole('PLAYER');
      setManagerId('');
      fetchUsers();
      alert(t('admin.user_created'));
    } catch (e: any) {
      alert(e.response?.data?.error || t('admin.create_failed'));
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const data: any = {};
      if (editUsername && editUsername !== selectedUser.username) data.username = editUsername;
      if (editPassword) data.password = editPassword;
      if (editRole && editRole !== selectedUser.role) data.role = editRole;
      if (Object.keys(data).length > 0) {
        await apiClient.patch(`/admin/users/${selectedUser.id}`, data);
      }
      setShowEditModal(false);
      setSelectedUser(null);
      setEditUsername('');
      setEditPassword('');
      setEditRole('');
      fetchUsers();
      alert(t('admin.user_updated'));
    } catch (e: any) {
      alert(e.response?.data?.error || t('admin.update_failed'));
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This will permanently remove the account and all related data.`)) return;
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      fetchUsers();
      alert(t('admin.user_deleted'));
    } catch (e: any) {
      alert(e.response?.data?.error || t('admin.delete_failed'));
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await apiClient.patch(`/admin/users/${userId}/status`, { status: newStatus });
      fetchUsers();
    } catch (e: any) {
      alert(e.response?.data?.error || t('admin.status_failed'));
    }
  };

  const handleBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !amount) return;
    try {
      const val = parseFloat(amount);
      if (showBalanceModal === 'deposit') {
        await apiClient.post(`/admin/users/${selectedUser.id}/deposit`, { amount: val });
      } else {
        await apiClient.post(`/admin/users/${selectedUser.id}/withdraw`, { amount: val });
      }
      setShowBalanceModal(null);
      setSelectedUser(null);
      setAmount('');
      fetchUsers();
      alert(t('admin.balance_updated'));
    } catch (e: any) {
      alert(e.response?.data?.error || t('admin.transaction_failed'));
    }
  };

  const openEditModal = (u: User) => {
    setSelectedUser(u);
    setEditUsername(u.username);
    setEditPassword('');
    setEditRole(u.role);
    setShowEditModal(true);
  };

  const filteredUsers = users.filter(u => {
    if (selectedManagerId && u.managerId !== selectedManagerId) return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return u.username.toLowerCase().includes(q);
    }
    return true;
  });

  const filterByManager = (mgrId: string) => {
    setSelectedManagerId(mgrId);
    setRoleFilter('ALL');
  };
  const activeManager = managers.find(m => m.id === selectedManagerId);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
      case 'MANAGER': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    }
  };
  const roleLabel = (role: string) => ({
    ADMIN: 'Administrator',
    MANAGER: 'Menaxher',
    PLAYER: 'Lojtar',
  }[role] || role);
  const statusLabel = (status: string) => ({
    ACTIVE: 'Aktiv',
    FROZEN: 'Ngrirë',
    BANNED: 'Bllokuar',
  }[status] || status);

  const playerCount = users.filter(u => u.role === 'PLAYER').length;
  const managerCount = users.filter(u => u.role === 'MANAGER').length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">{t('admin.users')}</h2>
          <p className="text-text-secondary text-xs sm:text-sm">{t('admin.manage_players')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchUsers}
            className="p-2.5 bg-tertiary/70 hover:bg-tertiary text-text-secondary hover:text-white rounded-xl text-xs font-bold transition active:scale-95"
            title="Rifresko përdoruesit"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-accent-green' : ''} />
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none bg-accent-green hover:bg-emerald-600 text-primary px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-accent-green/20 transition active:scale-95"
          >
            <Plus size={18} /> {t('admin.create_user')}
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-secondary p-3 sm:p-4 rounded-2xl border border-tertiary space-y-3 shadow-md">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kërko me emër përdoruesi..."
              className="w-full bg-primary border border-tertiary rounded-xl pl-9 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-text-secondary focus:outline-none focus:border-accent-green"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Manager Filter */}
          {managers.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-auto">
                <select
                  value={selectedManagerId}
                  onChange={e => setSelectedManagerId(e.target.value)}
                  className="w-full sm:w-auto bg-primary border border-tertiary rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-accent-green"
                >
                  <option value="">{t('admin.all_users')}</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.username} ({m._count?.managedUsers || 0} lojtarë)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pt-1">
          {[
            { id: 'ALL', label: 'Të Gjithë', count: users.length },
            { id: 'PLAYER', label: 'Lojtarë', count: playerCount },
            { id: 'MANAGER', label: 'Menaxherë', count: managerCount },
            { id: 'ADMIN', label: 'Administratorë', count: adminCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
                roleFilter === tab.id
                  ? 'bg-accent-green text-primary font-black shadow-sm'
                  : 'bg-primary/80 text-text-secondary hover:text-white hover:bg-tertiary/60'
              }`}
            >
              {tab.label} <span className="opacity-75 text-[11px]">({tab.count})</span>
            </button>
          ))}
          <span className="ml-auto text-[11px] text-text-secondary font-medium whitespace-nowrap pl-2">
            Duke shfaqur {filteredUsers.length}
          </span>
        </div>
      </div>

      {/* Active Manager Filter Banner */}
      {activeManager && (
        <div className="bg-amber-500/15 border border-amber-500/30 rounded-2xl p-3 sm:p-4 flex items-center justify-between text-xs sm:text-sm text-amber-200 shadow-md">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Lojtarët e menaxherit:</span>
            <span className="font-black text-amber-300 bg-amber-500/25 border border-amber-500/40 px-2.5 py-1 rounded-xl">
              ⭐ @{activeManager.username}
            </span>
            <span className="text-text-secondary text-xs">({filteredUsers.length} lojtarë të lidhur)</span>
          </div>
          <button
            onClick={() => { setSelectedManagerId(''); }}
            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 active:scale-95"
          >
            <X size={15} /> Hiq Filtrin
          </button>
        </div>
      )}

      {/* USERS CONTENT */}
      {loading ? (
        <div className="p-16 text-center text-text-secondary bg-secondary rounded-2xl border border-tertiary flex flex-col items-center justify-center gap-3">
          <RefreshCw size={26} className="animate-spin text-accent-green" />
          <span className="text-sm font-semibold">{t('admin.loading_accounts')}</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center text-text-secondary bg-secondary rounded-2xl border border-tertiary space-y-2">
          <UsersIcon size={32} className="mx-auto opacity-30 text-white" />
          <div className="text-sm font-bold text-white">Nuk u gjet asnjë përdorues</div>
          <p className="text-xs">Provoni të ndryshoni filtrat ose fjalën e kërkimit.</p>
        </div>
      ) : (
        <>
          {/* MOBILE VIEW: Touch-Friendly User Cards (< md) */}
          <div className="block md:hidden space-y-3">
            {filteredUsers.map(u => (
              <div key={u.id} className="bg-secondary p-4 rounded-2xl border border-tertiary shadow-md space-y-3">
                {/* User Info Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm uppercase shadow-sm ${
                      u.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                      u.role === 'MANAGER' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      {u.username.substring(0, 2)}
                    </span>
                    <div>
                      <div className="font-bold text-white text-base leading-tight">{u.username}</div>
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        {u.manager?.username ? `Menaxher: ${u.manager.username}` : (u.role === 'MANAGER' ? `${u._count?.managedUsers || 0} lojtarë të menaxhuar` : 'I pavarur')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${getRoleBadge(u.role)}`}>
                      {roleLabel(u.role)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                      u.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                      u.status === 'FROZEN' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {u.status === 'ACTIVE' && <CheckCircle size={10} />}
                      {u.status === 'FROZEN' && <ShieldAlert size={10} />}
                      {u.status === 'BANNED' && <Ban size={10} />}
                      {statusLabel(u.status)}
                    </span>
                  </div>
                </div>

                {/* Manager Relationship Callout for Players and Managers */}
                {u.role === 'PLAYER' && (
                  <div className="bg-primary/90 border border-tertiary/80 rounded-xl p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-text-secondary text-[11px] font-semibold">Menaxheri:</span>
                      {u.manager?.username ? (
                        <span className="font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg truncate">
                          ⭐ @{u.manager.username}
                        </span>
                      ) : (
                        <span className="text-text-secondary italic text-[11px]">I pavarur (pa menaxher)</span>
                      )}
                    </div>
                    {u.managerId && (
                      <button
                        onClick={() => filterByManager(u.managerId!)}
                        className="text-[11px] font-bold text-accent-green hover:underline shrink-0 ml-2"
                      >
                        Lojtarët e tij →
                      </button>
                    )}
                  </div>
                )}

                {u.role === 'MANAGER' && (
                  <div className="bg-purple-500/10 border border-purple-500/25 rounded-xl p-2.5 flex items-center justify-between text-xs">
                    <span className="text-text-secondary text-[11px] font-semibold">
                      Menaxhon: <strong className="text-purple-300 font-black">{u._count?.managedUsers || 0} lojtarë</strong>
                    </span>
                    <button
                      onClick={() => filterByManager(u.id)}
                      className="text-[11px] font-bold text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 px-2.5 py-1 rounded-lg transition"
                    >
                      Shiko Lojtarët e Tij →
                    </button>
                  </div>
                )}

                {/* Balance Display */}
                <div className="bg-primary/80 px-3.5 py-2.5 rounded-xl border border-tertiary/70 flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">{t('admin.balance')}</span>
                  <span className="text-lg font-black text-accent-green tabular-nums">
                    {u.balance.toFixed(2)} {u.currency || 'Lëk'}
                  </span>
                </div>

                {/* Action Buttons Row */}
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <button 
                    onClick={() => { setSelectedUser(u); setShowBalanceModal('deposit'); }}
                    className="flex-1 py-2 px-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 active:bg-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border border-emerald-500/25 transition active:scale-95"
                  >
                    <ArrowUpRight size={14} /> {t('admin.deposit')}
                  </button>
                  <button 
                    onClick={() => { setSelectedUser(u); setShowBalanceModal('withdraw'); }}
                    className="flex-1 py-2 px-2.5 bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/30 text-amber-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border border-amber-500/25 transition active:scale-95"
                  >
                    <ArrowDownRight size={14} /> {t('admin.withdraw')}
                  </button>
                  <button 
                    onClick={() => openEditModal(u)}
                    className="p-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 rounded-xl text-xs font-bold border border-blue-500/25 transition active:scale-95"
                    title={t('admin.edit_user')}
                  >
                    <Edit3 size={15} />
                  </button>

                  {u.role !== 'ADMIN' && (
                    <>
                      {u.status === 'ACTIVE' ? (
                        <button 
                          onClick={() => handleStatusChange(u.id, 'FROZEN')}
                          className="px-2.5 py-2 bg-tertiary hover:bg-amber-500/20 text-text-secondary hover:text-amber-400 rounded-xl text-xs font-semibold transition active:scale-95"
                        >
                          {t('admin.freeze')}
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleStatusChange(u.id, 'ACTIVE')}
                          className="px-2.5 py-2 bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold transition active:scale-95"
                        >
                          {t('admin.activate')}
                        </button>
                      )}
                      {u.status !== 'BANNED' && (
                        <button 
                          onClick={() => handleStatusChange(u.id, 'BANNED')}
                          className="px-2.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition active:scale-95"
                        >
                          {t('admin.ban')}
                        </button>
                      )}
                      <button 
                        onClick={() => handleDeleteUser(u.id, u.username)}
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition active:scale-95"
                        title={t('admin.delete_user')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP VIEW: Clean Responsive Table (>= md) */}
          <div className="hidden md:block bg-secondary rounded-2xl border border-tertiary shadow-xl overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-text-primary text-sm">
              <thead className="bg-tertiary/60 uppercase text-[11px] text-text-secondary font-bold tracking-wider">
                <tr>
                  <th className="p-4">{t('admin.username')}</th>
                  <th className="p-4">{t('admin.role')}</th>
                  <th className="p-4">{t('admin.status')}</th>
                  <th className="p-4">{t('admin.balance')}</th>
                  <th className="p-4">{t('admin.manager')}</th>
                  <th className="p-4 text-right">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tertiary/60">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-primary/40 transition">
                    <td className="p-4 font-semibold text-white flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs uppercase ${
                        u.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' :
                        u.role === 'MANAGER' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {u.username.substring(0, 2)}
                      </span>
                      {u.username}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${getRoleBadge(u.role)}`}>
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                        u.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                        u.status === 'FROZEN' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {u.status === 'ACTIVE' && <CheckCircle size={12} />}
                        {u.status === 'FROZEN' && <ShieldAlert size={12} />}
                        {u.status === 'BANNED' && <Ban size={12} />}
                        {statusLabel(u.status)}
                      </span>
                    </td>
                    <td className="p-4 text-base font-black text-white tabular-nums">
                      {u.balance.toFixed(2)} <span className="text-xs text-text-secondary font-medium">{u.currency || 'Lëk'}</span>
                    </td>
                    <td className="p-4 text-xs">
                      {u.role === 'PLAYER' ? (
                        u.manager?.username ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-black text-xs inline-flex items-center gap-1">
                              ⭐ @{u.manager.username}
                            </span>
                            <button
                              onClick={() => filterByManager(u.managerId!)}
                              className="text-[10px] text-accent-green hover:underline font-bold"
                              title="Filtro lojtarët e këtij menaxheri"
                            >
                              Lojtarët →
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-secondary/50 italic text-xs">I pavarur</span>
                        )
                      ) : u.role === 'MANAGER' ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-black text-xs inline-flex items-center gap-1">
                            👥 {u._count?.managedUsers || 0} lojtarë
                          </span>
                          <button
                            onClick={() => filterByManager(u.id)}
                            className="text-[10px] text-purple-300 hover:text-purple-200 underline font-bold"
                            title="Shfaq të gjithë lojtarët e këtij menaxheri"
                          >
                            Shfaq →
                          </button>
                        </div>
                      ) : (
                        <span className="text-text-secondary/40 text-xs">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button 
                          onClick={() => { setSelectedUser(u); setShowBalanceModal('deposit'); }}
                          className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                          title={t('admin.add_money')}
                        >
                          <ArrowUpRight size={13} /> {t('admin.deposit')}
                        </button>
                        <button 
                          onClick={() => { setSelectedUser(u); setShowBalanceModal('withdraw'); }}
                          className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                          title={t('admin.withdraw_money')}
                        >
                          <ArrowDownRight size={13} /> {t('admin.withdraw')}
                        </button>
                        <button 
                          onClick={() => openEditModal(u)}
                          className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          title={t('admin.edit_user')}
                        >
                          <Edit3 size={14} />
                        </button>
                        {u.role !== 'ADMIN' && (
                          <>
                            {u.status === 'ACTIVE' ? (
                              <button 
                                onClick={() => handleStatusChange(u.id, 'FROZEN')}
                                className="px-2 py-1 bg-tertiary hover:bg-amber-500/20 text-text-secondary hover:text-amber-400 rounded-lg text-xs font-semibold transition"
                              >
                                {t('admin.freeze')}
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleStatusChange(u.id, 'ACTIVE')}
                                className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold transition"
                              >
                                {t('admin.activate')}
                              </button>
                            )}
                            {u.status !== 'BANNED' && (
                              <button 
                                onClick={() => handleStatusChange(u.id, 'BANNED')}
                                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold transition"
                              >
                                {t('admin.ban')}
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold transition"
                              title={t('admin.delete_user')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* CREATE USER MODAL (Bottom-sheet on mobile, centered modal on desktop) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-secondary border-t sm:border border-tertiary rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg sm:text-xl font-bold text-white">{t('admin.create_user')}</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-text-secondary hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-text-secondary mb-5">{t('admin.users_cannot_register')}</p>
            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('admin.username')}</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. player1" 
                  required
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('auth.password')}</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.password')} 
                  required
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('admin.role')}</label>
                <select 
                  value={role} 
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                >
                  <option value="PLAYER">Lojtar</option>
                  <option value="MANAGER">Menaxher</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>
              {role === 'PLAYER' && managers.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('admin.assign_manager')}</label>
                  <select 
                    value={managerId} 
                    onChange={e => setManagerId(e.target.value)}
                    className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                  >
                    <option value="">{t('admin.no_manager')}</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.username}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('admin.initial_balance')}</label>
                <input 
                  type="number" 
                  value={initialBalance} 
                  onChange={e => setInitialBalance(e.target.value)}
                  placeholder="100" 
                  min="0"
                  step="0.01"
                  required
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                />
              </div>
              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-xl font-bold text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary rounded-xl font-black text-sm transition shadow-lg shadow-accent-green/20"
                >
                  {t('admin.create_account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-secondary border-t sm:border border-tertiary rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg sm:text-xl font-bold text-white">{t('admin.edit_user')}: {selectedUser.username}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-text-secondary hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditUser} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('admin.username')}</label>
                <input 
                  type="text" 
                  value={editUsername} 
                  onChange={e => setEditUsername(e.target.value)}
                  required
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('auth.password')} ({t('admin.leave_blank')})</label>
                <input 
                  type="password" 
                  value={editPassword} 
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder={t('admin.leave_blank')}
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">{t('admin.role')}</label>
                <select 
                  value={editRole} 
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-sm focus:outline-none focus:border-accent-green"
                >
                  <option value="PLAYER">Lojtar</option>
                  <option value="MANAGER">Menaxher</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>
              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-xl font-bold text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary rounded-xl font-black text-sm transition shadow-lg shadow-accent-green/20"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BALANCE MODAL (Deposit/Withdraw) with Quick Preset Chips */}
      {showBalanceModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-secondary border-t sm:border border-tertiary rounded-t-3xl sm:rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg sm:text-xl font-bold text-white capitalize">
                {t(`admin.${showBalanceModal}_funds`)}
              </h3>
              <button onClick={() => setShowBalanceModal(null)} className="text-text-secondary hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="bg-primary/70 p-3 rounded-xl border border-tertiary/70 mb-4 text-xs space-y-1">
              <div className="text-text-secondary flex justify-between">
                <span>{t('admin.player')}:</span>
                <strong className="text-white text-sm">{selectedUser.username}</strong>
              </div>
              <div className="text-text-secondary flex justify-between">
                <span>{t('admin.current_balance')}:</span>
                <strong className="text-accent-green text-sm font-black">{selectedUser.balance.toFixed(2)} Lëk</strong>
              </div>
            </div>

            <form onSubmit={handleBalanceSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.amount')}</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" 
                    min="1"
                    step="0.01"
                    required
                    autoFocus
                    className="w-full bg-primary border border-tertiary rounded-xl p-3 pr-12 text-white focus:outline-none focus:border-accent-green text-xl font-black tabular-nums"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-text-secondary">Lëk</span>
                </div>
              </div>

              {/* Quick Preset Amount Chips */}
              <div>
                <span className="text-[11px] font-semibold text-text-secondary block mb-1.5">Zgjedhje e shpejtë:</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {PRESET_AMOUNTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className="py-1.5 rounded-lg bg-tertiary hover:bg-tertiary/80 text-white font-bold text-xs active:scale-95 transition"
                    >
                      +{preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowBalanceModal(null)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-xl font-bold text-xs sm:text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit"
                  className={`flex-1 py-3 rounded-xl font-black text-xs sm:text-sm transition shadow-lg active:scale-95 ${
                    showBalanceModal === 'deposit' 
                      ? 'bg-accent-green hover:bg-emerald-600 text-primary shadow-accent-green/20' 
                      : 'bg-amber-500 hover:bg-amber-600 text-primary shadow-amber-500/20'
                  }`}
                >
                  {t(`admin.confirm_${showBalanceModal}`)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}