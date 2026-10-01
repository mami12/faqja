import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="h-16 bg-secondary flex items-center justify-between px-6 border-b border-tertiary text-text-primary">
      <div className="text-xl font-bold text-accent-green cursor-pointer" onClick={() => navigate('/')}>
        NETFLY SPORT
      </div>
      
      <div className="flex items-center gap-6">
        {/* Language Switcher */}
        <select
          value={lang}
          onChange={e => setLanguage(e.target.value as any)}
          className="bg-primary border border-tertiary rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-green cursor-pointer"
        >
          <option value="al">Shqip</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
        </select>

        {user && (
          <>
            {user.role === 'ADMIN' && (
              <div className="cursor-pointer hover:text-white" onClick={() => navigate('/admin')}>
                {t('nav.admin')}
              </div>
            )}
            {user.role === 'MANAGER' && (
              <div className="cursor-pointer hover:text-white" onClick={() => navigate('/manager')}>
                {t('manager.my_users')}
              </div>
            )}
            {user.role === 'PLAYER' && (
              <div className="cursor-pointer hover:text-white" onClick={() => navigate('/my-bets')}>
                {t('nav.myBets')}
              </div>
            )}
            
            <div className="font-semibold text-accent-yellow">
              {user.balance.toFixed(2)} Lëk
            </div>

            <button onClick={() => { logout(); navigate('/login'); }} className="text-accent-red hover:text-red-400">
              {t('nav.logout')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}