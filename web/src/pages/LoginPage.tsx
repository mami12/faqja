import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.login_failed'));
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center relative">
      <div className="bg-secondary p-8 rounded-2xl shadow-2xl w-full max-w-md border border-tertiary">
        <h1 className="text-3xl font-black text-center text-accent-green mb-1 tracking-widest">NETFLY SPORT</h1>
        <p className="text-center text-xs text-text-secondary mb-8 uppercase tracking-wider">{t('auth.login_subtitle')}</p>
        
        {error && <div className="bg-red-500/20 text-red-500 p-3 rounded-lg mb-4 text-sm text-center font-medium">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs text-text-secondary uppercase font-bold block mb-1">{t('auth.username')}</label>
            <input 
              type="text" 
              placeholder={t('auth.username')} 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
              required
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary uppercase font-bold block mb-1">{t('auth.password')}</label>
            <input 
              type="password" 
              placeholder={t('auth.password')} 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green"
              required
            />
          </div>
          <button type="submit" className="w-full bg-accent-green hover:bg-emerald-600 text-primary font-black py-3 rounded-lg transition mt-4 shadow-lg shadow-accent-green/20">
            {t('auth.login_btn')}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-secondary/80">
          {t('auth.admin_only_note')}
        </p>
      </div>
    </div>
  );
}
