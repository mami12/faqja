import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

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
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  const links = (
    <>
      {user?.role === 'ADMIN' && (
        <button className="hover:text-white text-left" onClick={() => go('/admin')}>
          {t('nav.admin')}
        </button>
      )}
      {user?.role === 'MANAGER' && (
        <button className="hover:text-white text-left" onClick={() => go('/manager')}>
          {t('manager.my_users')}
        </button>
      )}
      {user?.role === 'PLAYER' && (
        <button className="hover:text-white text-left" onClick={() => go('/my-bets')}>
          {t('nav.myBets')}
        </button>
      )}
    </>
  );

  return (
    <header className="shrink-0 bg-secondary border-b border-tertiary text-text-primary">
      <div className="h-14 sm:h-16 flex items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex items-center gap-1 min-w-0">
          {onToggleNav && (
            <button
              onClick={onToggleNav}
              className="lg:hidden p-2 -ml-1 rounded hover:bg-tertiary"
              aria-label={t('nav.sports')}
            >
              <Menu size={20} />
            </button>
          )}
          <div
            className="text-base sm:text-xl font-bold text-accent-green cursor-pointer truncate"
            onClick={() => navigate('/')}
          >
            NETFLY SPORT
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Language Switcher */}
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="bg-primary border border-tertiary rounded px-1 sm:px-2 py-1 text-[11px] sm:text-xs text-text-primary focus:outline-none focus:border-accent-green cursor-pointer max-w-[5rem] sm:max-w-[5.5rem]"
          >
            <option value="al">Shqip</option>
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
          </select>

          {user && (
            <>
              {/* wide screens: everything inline */}
              <div className="hidden md:flex items-center gap-6">
                {links}
                <div className="font-semibold text-accent-yellow whitespace-nowrap">{user.balance.toFixed(2)} Lëk</div>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className="text-accent-red hover:text-red-400"
                >
                  {t('nav.logout')}
                </button>
              </div>

              {/* small screens: the balance stays, the rest goes behind the menu button */}
              <div className="md:hidden font-semibold text-accent-yellow text-sm whitespace-nowrap">
                {user.balance.toFixed(2)} Lëk
              </div>
              <button
                className="md:hidden p-2 rounded hover:bg-tertiary"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="account"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          )}
        </div>
      </div>

      {menuOpen && user && (
        <div className="md:hidden border-t border-tertiary px-4 py-1 text-sm space-y-1">
          {links}
          <button
            className="block w-full text-left py-2 text-accent-red"
            onClick={() => {
              setMenuOpen(false);
              logout();
              navigate('/login');
            }}
          >
            {t('nav.logout')}
          </button>
        </div>
      )}
    </header>
  );
}
