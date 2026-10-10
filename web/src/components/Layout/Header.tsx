import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Globe, Wallet, LogOut, Shield, Users, Ticket, Zap } from 'lucide-react';

interface Props {
  /** small screens only: opens the sports / leagues drawer (the desktop rail is always there) */
  onToggleNav?: () => void;
}

/**
 * The top bar, from a wide desktop down to a phone. The account actions that need room
 * (admin panel, my bets, logout) move into a menu below `md`, so nothing is cut off and the
 * balance stays visible while a bet is being placed.
 */
export default function Header({ onToggleNav }: Props) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  const isActive = (path: string) => location.pathname === path;

  const links = (
    <>
      {user?.role === 'ADMIN' && (
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            isActive('/admin')
              ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
              : 'text-text-secondary hover:text-white hover:bg-tertiary/60'
          }`}
          onClick={() => go('/admin')}
        >
          <Shield size={14} />
          <span>{t('nav.admin')}</span>
        </button>
      )}
      {user?.role === 'MANAGER' && (
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            isActive('/manager')
              ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
              : 'text-text-secondary hover:text-white hover:bg-tertiary/60'
          }`}
          onClick={() => go('/manager')}
        >
          <Users size={14} />
          <span>{t('manager.my_users')}</span>
        </button>
      )}
      {user?.role === 'PLAYER' && (
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            isActive('/my-bets')
              ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
              : 'text-text-secondary hover:text-white hover:bg-tertiary/60'
          }`}
          onClick={() => go('/my-bets')}
        >
          <Ticket size={14} />
          <span>{t('nav.myBets')}</span>
        </button>
      )}
    </>
  );

  return (
    <header className="shrink-0 z-20 border-b border-white/10 bg-[#091321]/90 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {onToggleNav && (
            <button
              onClick={onToggleNav}
              className="rounded-xl border border-white/10 bg-[#101b2a] p-2 text-text-secondary transition hover:border-emerald-500/40 hover:text-white lg:hidden"
              aria-label={t('nav.sports')}
            >
              <Menu size={18} />
            </button>
          )}
          <div
            className="group flex cursor-pointer items-center gap-2 py-1 select-none"
            onClick={() => navigate('/')}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-transform group-hover:scale-105">
              <Zap size={17} className="fill-current" />
            </div>
            <div className="flex items-baseline gap-1 truncate">
              <span className="text-base font-black tracking-tight text-white transition sm:text-lg">
                FAQJA
              </span>
              <span className="text-base font-black tracking-wider text-emerald-400 sm:text-lg">
                SPORT
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="relative flex items-center rounded-xl border border-white/10 bg-[#101b2a] px-2 py-1 text-xs transition hover:border-emerald-500/30">
            <Globe size={13} className="mr-1.5 shrink-0 text-text-secondary" />
            <select
              value={lang}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="cursor-pointer bg-transparent pr-1 text-[11px] font-semibold text-text-primary focus:outline-none sm:text-xs"
            >
              <option value="al" className="bg-secondary text-white">Shqip</option>
              <option value="en" className="bg-secondary text-white">English</option>
              <option value="de" className="bg-secondary text-white">Deutsch</option>
              <option value="fr" className="bg-secondary text-white">Français</option>
            </select>
          </div>

          {user && (
            <>
              {/* Desktop links */}
              <div className="hidden md:flex items-center gap-2">
                {links}
              </div>

              <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-emerald-500/10 px-2.5 py-1.5 shadow-inner shadow-amber-500/10 sm:px-3">
                <Wallet size={14} className="shrink-0 text-amber-300" />
                <div className="flex flex-col text-left">
                  <span className="hidden text-[9px] font-bold uppercase tracking-[0.12em] text-text-secondary/80 sm:inline">
                    {user.username || t('admin.balance')}
                  </span>
                  <span className="text-xs font-extrabold tabular-nums text-amber-300 sm:text-sm">
                    {user.balance.toFixed(2)} <span className="text-[10px] font-semibold text-amber-200/80">Lëk</span>
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-text-secondary hover:text-accent-red hover:bg-accent-red/10 border border-transparent hover:border-accent-red/20 transition-all"
                title={t('nav.logout')}
              >
                <LogOut size={14} />
                <span>{t('nav.logout')}</span>
              </button>

              {/* Mobile hamburger menu toggle */}
              <button
                className="md:hidden p-2 rounded-lg text-text-secondary hover:text-white hover:bg-tertiary transition"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="account menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {menuOpen && user && (
        <div className="md:hidden border-t border-tertiary bg-secondary/95 backdrop-blur-md px-4 py-3 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="text-[10px] font-black uppercase tracking-wider text-text-secondary mb-1">
            {user.role} &bull; {user.username}
          </div>
          <div className="flex flex-col space-y-1">
            {links}
          </div>
          <div className="pt-2 border-t border-tertiary/60">
            <button
              className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg text-xs font-bold text-accent-red hover:bg-accent-red/10 transition"
              onClick={() => {
                setMenuOpen(false);
                logout();
                navigate('/login');
              }}
            >
              <LogOut size={15} />
              <span>{t('nav.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
