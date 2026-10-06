import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { Zap, User, Lock, ArrowRight } from 'lucide-react';

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
    <div className="min-h-[100dvh] bg-primary flex items-center justify-center relative px-4 py-8">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-accent-green/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="bg-secondary/95 backdrop-blur-xl p-6 sm:p-10 rounded-3xl shadow-2xl w-full max-w-md border border-tertiary/80 relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-accent-green flex items-center justify-center text-primary shadow-glow-green mb-3">
            <Zap size={26} className="fill-primary text-primary" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-2xl font-black text-white tracking-tight">NETFLY</h1>
            <span className="text-2xl font-black text-accent-green tracking-wider">SPORT</span>
          </div>
          <p className="text-xs text-text-secondary mt-1 font-semibold uppercase tracking-wider">
            {t('auth.login_subtitle')}
          </p>
        </div>
        
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs text-center font-semibold animate-in shake duration-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-text-secondary uppercase font-bold tracking-wider block">
              {t('auth.username')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                <User size={16} />
              </div>
              <input 
                type="text" 
                placeholder={t('auth.username')} 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-primary/90 border border-tertiary/80 rounded-xl pl-10 pr-3.5 py-3 text-sm text-white placeholder-text-secondary/50 focus:outline-none focus:border-accent-green focus:ring-1 focus:ring-accent-green transition"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-text-secondary uppercase font-bold tracking-wider block">
              {t('auth.password')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                <Lock size={16} />
              </div>
              <input 
                type="password" 
                placeholder={t('auth.password')} 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-primary/90 border border-tertiary/80 rounded-xl pl-10 pr-3.5 py-3 text-sm text-white placeholder-text-secondary/50 focus:outline-none focus:border-accent-green focus:ring-1 focus:ring-accent-green transition"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-emerald-600 to-accent-green hover:brightness-105 active:scale-[0.99] text-primary font-black py-3.5 rounded-xl transition shadow-glow-green text-sm flex items-center justify-center gap-2 mt-2"
          >
            <span>{t('auth.login_btn')}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <p className="text-center text-xs text-text-secondary/70 border-t border-tertiary/50 pt-4">
          {t('auth.admin_only_note')}
        </p>
      </div>
    </div>
  );
}
