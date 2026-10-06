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
    <header className="shrink-0 bg-secondary/95 backdrop-blur-md border-b border-tertiary text-text-primary z-20">
      <div className="h-14 sm:h-16 flex items-center justify-between gap-2 px-3 sm:px-6">
        {/* Brand & Drawer toggle */}
        <div className="flex items-center gap-2 min-w-0">
          {onToggleNav && (
            <button
              onClick={onToggleNav}
              className="lg:hidden p-2 -ml-1 rounded-lg text-text-secondary hover:text-white hover:bg-tertiary/80 transition"
              aria-label={t('nav.sports')}
            >
              <Menu size={20} />
            </button>
          )}
          <div
            className="flex items-center gap-2 cursor-pointer group select-none py-1"
            onClick={() => navigate('/')}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-accent-green flex items-center justify-center text-primary shadow-glow-green group-hover:scale-105 transition-transform">
              <Zap size={18} className="fill-primary text-primary" />
            </div>
            <div className="flex items-baseline gap-1 truncate">
              <span className="text-base sm:text-lg font-black tracking-tight text-white group-hover:text-slate-100 transition">
                NETFLY
              </span>
              <span className="text-base sm:text-lg font-black tracking-wider text-accent-green">
                SPORT
              </span>
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Switcher Pill */}
          <div className="relative flex items-center bg-primary/70 border border-tertiary/80 hover:border-tertiary rounded-lg px-2 py-1 text-xs transition">
            <Globe size={13} className="text-text-secondary mr-1.5 shrink-0" />
            <select
              value={lang}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="bg-transparent text-[11px] sm:text-xs font-semibold text-text-primary focus:outline-none cursor-pointer pr-1"
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

              {/* Wallet / Balance Pill (both desktop & mobile) */}
              <div className="flex items-center gap-1.5 bg-primary/90 border border-tertiary px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg shadow-inner-glow">
                <Wallet size={14} className="text-accent-yellow shrink-0" />
                <div className="flex flex-col text-left">
                  <span className="text-[9px] uppercase font-bold text-text-secondary leading-none hidden sm:inline">
                    {user.username || t('admin.balance')}
                  </span>
                  <span className="font-extrabold text-accent-yellow text-xs sm:text-sm tabular-nums whitespace-nowrap leading-tight">
                    {user.balance.toFixed(2)} <span className="text-[10px] font-semibold text-amber-300/80">Lëk</span>
                  </span>
                </div>
              </div>

              {/* Desktop logout */}
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
