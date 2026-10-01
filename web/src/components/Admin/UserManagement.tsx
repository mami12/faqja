import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { User } from '../../types';
import { Plus, ShieldAlert, CheckCircle, Ban, ArrowDownRight, ArrowUpRight, Trash2, Edit3, Users as UsersIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

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

  const filteredUsers = selectedManagerId
    ? users.filter(u => u.managerId === selectedManagerId)
    : users;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-500/20 text-purple-400';
      case 'MANAGER': return 'bg-amber-500/20 text-amber-400';
      default: return 'bg-blue-500/20 text-blue-400';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('admin.users')}</h2>
          <p className="text-text-secondary text-sm">{t('admin.manage_players')}</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-accent-green hover:bg-emerald-600 text-primary px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition"
        >
          <Plus size={18} /> {t('admin.create_user')}
        </button>
      </div>

      {/* Manager Filter */}
      {managers.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <UsersIcon size={16} className="text-text-secondary" />
          <select
            value={selectedManagerId}
            onChange={e => setSelectedManagerId(e.target.value)}
            className="bg-secondary border border-tertiary rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green"
          >
            <option value="">{t('admin.all_users')}</option>
            {managers.map(m => (
              <option key={m.id} value={m.id}>
                {m.username} ({m._count?.managedUsers || 0} {t('admin.users')})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-secondary rounded-xl border border-tertiary shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-secondary">{t('admin.loading_accounts')}</div>
        ) : (
          <table className="w-full text-left text-text-primary text-sm">
            <thead className="bg-tertiary/60 uppercase text-xs text-text-secondary">
              <tr>
                <th className="p-4">{t('admin.username')}</th>
                <th className="p-4">{t('admin.role')}</th>
                <th className="p-4">{t('admin.status')}</th>
                <th className="p-4">{t('admin.balance')}</th>
                <th className="p-4">{t('admin.manager')}</th>
                <th className="p-4 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tertiary">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-primary/40 transition">
                  <td className="p-4 font-semibold text-white flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                      u.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' :
                      u.role === 'MANAGER' ? 'bg-amber-500/20 text-amber-400' : 'bg-accent-blue/20 text-accent-blue'
                    }`}>
                      {u.username.substring(0, 2)}
                    </span>
                    {u.username}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getRoleBadge(u.role)}`}>
                      {u.role}
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
                      {u.status}
                    </span>
                  </td>
                  <td className="p-4 text-base font-bold text-white">
                    {u.balance.toFixed(2)} {u.currency || 'Lëk'}
                  </td>
                  <td className="p-4 text-xs text-text-secondary">
                    {u.manager?.username || (u.role === 'MANAGER' ? `${u._count?.managedUsers || 0} users` : '-')}
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button 
                        onClick={() => { setSelectedUser(u); setShowBalanceModal('deposit'); }}
                        className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold flex items-center gap-1"
                        title={t('admin.add_money')}
                      >
                        <ArrowUpRight size={14} /> {t('admin.deposit')}
                      </button>
                      <button 
                        onClick={() => { setSelectedUser(u); setShowBalanceModal('withdraw'); }}
                        className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-xs font-semibold flex items-center gap-1"
                        title={t('admin.withdraw_money')}
                      >
                        <ArrowDownRight size={14} /> {t('admin.withdraw')}
                      </button>
                      <button 
                        onClick={() => openEditModal(u)}
                        className="p-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue rounded-lg text-xs font-semibold flex items-center gap-1"
                        title={t('admin.edit_user')}
                      >
                        <Edit3 size={14} />
                      </button>
                      {u.role !== 'ADMIN' && (
                        <>
                          {u.status === 'ACTIVE' ? (
                            <button 
                              onClick={() => handleStatusChange(u.id, 'FROZEN')}
                              className="px-2 py-1 bg-tertiary hover:bg-amber-500/20 text-text-secondary hover:text-amber-400 rounded-lg text-xs font-semibold"
                            >
                              {t('admin.freeze')}
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleStatusChange(u.id, 'ACTIVE')}
                              className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold"
                            >
                              {t('admin.activate')}
                            </button>
                          )}
                          {u.status !== 'BANNED' && (
                            <button 
                              onClick={() => handleStatusChange(u.id, 'BANNED')}
                              className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold"
                            >
                              {t('admin.ban')}
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold"
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
        )}
      </div>

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">{t('admin.create_user')}</h3>
            <p className="text-sm text-text-secondary mb-6">{t('admin.users_cannot_register')}</p>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.username')}</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. player1" 
                  required
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('auth.password')}</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.password')} 
                  required
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.role')}</label>
                <select 
                  value={role} 
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                >
                  <option value="PLAYER">PLAYER</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              {role === 'PLAYER' && managers.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.assign_manager')}</label>
                  <select 
                    value={managerId} 
                    onChange={e => setManagerId(e.target.value)}
                    className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                  >
                    <option value="">{t('admin.no_manager')}</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.username}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.initial_balance')}</label>
                <input 
                  type="number" 
                  value={initialBalance} 
                  onChange={e => setInitialBalance(e.target.value)}
                  placeholder="100" 
                  min="0"
                  step="0.01"
                  required
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary rounded-lg font-bold text-sm transition shadow-lg shadow-accent-green/20"
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">{t('admin.edit_user')}: {selectedUser.username}</h3>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.username')}</label>
                <input 
                  type="text" 
                  value={editUsername} 
                  onChange={e => setEditUsername(e.target.value)}
                  required
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('auth.password')} ({t('admin.leave_blank')})</label>
                <input 
                  type="password" 
                  value={editPassword} 
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder={t('admin.leave_blank')}
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.role')}</label>
                <select 
                  value={editRole} 
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
                >
                  <option value="PLAYER">PLAYER</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary rounded-lg font-bold text-sm transition shadow-lg shadow-accent-green/20"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BALANCE MODAL */}
      {showBalanceModal && selectedUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 capitalize">
              {t(`admin.${showBalanceModal}_funds`)}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {t('admin.player')}: <strong className="text-white">{selectedUser.username}</strong> | {t('admin.current_balance')}: <strong className="text-accent-green">{selectedUser.balance.toFixed(2)} Lëk</strong>
            </p>
            <form onSubmit={handleBalanceSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">{t('admin.amount')}</label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 50" 
                  min="1"
                  step="0.01"
                  required
                  autoFocus
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-lg font-bold"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowBalanceModal(null)}
                  className="flex-1 py-2.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit"
                  className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition ${
                    showBalanceModal === 'deposit' 
                      ? 'bg-accent-green hover:bg-emerald-600 text-primary' 
                      : 'bg-amber-500 hover:bg-amber-600 text-primary'
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