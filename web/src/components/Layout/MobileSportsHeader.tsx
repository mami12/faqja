import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid, CircleUserRound, Receipt, MessagesSquare,
  Settings, LogOut, Wallet, X, Bell, Ticket,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBetslip } from '../../context/BetslipContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useLanguage } from '../../context/LanguageContext';
import { countBetslipMatches } from '../../utils/betslipMatchCount';

type Panel = 'account' | 'notifications' | null;

interface Props {
  onOpenLeagues: () => void;
  onOpenBetslip: () => void;
}

/**
 * Reference-style mobile-only top bar. Real login name and real betslip state,
 * never a hardcoded sample name or static yellow badge.
 */
export default function MobileSportsHeader({ onOpenLeagues, onOpenBetslip }: Props) {
  const { user, logout } = useAuth();
  const { selections } = useBetslip();
  const { notifications, clearAllNotifications, dismissNotification } = useFavorites();
  const { lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);
  const matchCount = countBetslipMatches(selections);

  const toggle = (next: Panel) => setPanel(current => current === next ? null : next);
  const go = (path: string) => { setPanel(null); navigate(path); };

  return (
    <div className="relative z-30 shrink-0 md:hidden">
      <header className="flex h-[53px] items-center justify-between bg-[#182b4d] text-white">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-label="Hap sportet dhe ligat" onClick={() => {setPanel(null);onOpenLeagues();}}
            className="flex h-[53px] w-[51px] shrink-0 items-center justify-center border-r border-[#0c1a32] text-white transition hover:bg-[#263f66]">
            <LayoutGrid size={27} strokeWidth={2.5}/>
          </button>
          <button type="button" onClick={() => toggle('account')}
            aria-label={`Profili i ${user?.username ?? 'përdoruesit'}`}
            aria-expanded={panel === 'account'}
            className="flex min-w-0 items-center gap-2 px-1.5 py-1 text-left hover:text-amber-200">
            <CircleUserRound size={30} strokeWidth={2} className="shrink-0 text-white"/>
            <span className="max-w-[125px] truncate text-[12px] font-bold leading-tight">
              {user?.username ?? ''}
            </span>
          </button>
        </div>
        <div className="flex h-full shrink-0 items-center gap-0.5 pr-1">
          <button type="button" onClick={() => {setPanel(null);onOpenBetslip();}}
            aria-label={`Kuponi: ${matchCount} ndeshje të zgjedhura`}
            title="Hap kuponin"
            className="relative flex h-11 w-10 items-center justify-center rounded hover:bg-[#2b446a]">
            <Receipt size={25} strokeWidth={2.1}/>
            <span aria-live="polite" className="absolute right-0 top-0 flex min-h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#e2a600] px-[3px] text-[11px] font-black leading-none text-white">
              {matchCount}
            </span>
          </button>
          <button type="button" aria-label={`Njoftimet (${notifications.length})`}
            aria-expanded={panel === 'notifications'} onClick={() => toggle('notifications')}
            title="Njoftimet e ndeshjeve"
            className="relative flex h-11 w-9 items-center justify-center rounded hover:bg-[#2b446a]">
            <MessagesSquare size={23} fill="#ffffff" stroke="#ffffff" strokeWidth={1.8}/>
            {notifications.length > 0 && (
              <span className="absolute right-0 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#e2a600] px-0.5 text-[9px] font-bold text-white">
                {notifications.length}
              </span>
            )}
          </button>
          <button type="button" aria-label="Cilësimet e llogarisë" aria-expanded={panel === 'account'}
            onClick={() => toggle('account')} title="Cilësimet"
            className="flex h-11 w-9 items-center justify-center rounded hover:bg-[#2b446a]">
            <Settings size={23} fill="#ffffff" stroke="#ffffff" strokeWidth={1.8}/>
          </button>
        </div>
      </header>

      {panel && (
        <>
          <button type="button" aria-label="Mbyll panelin" onClick={() => setPanel(null)}
            className="fixed inset-0 z-30 bg-black/20" />
          <div className="absolute inset-x-2 top-[53px] z-40 rounded-b border border-[#607087] bg-[#202c3d] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#47546a] pb-2">
              <h3 className="text-sm font-bold text-white">
                {panel === 'account' ? (user?.username ?? 'Llogaria') : 'Njoftimet e ndeshjeve'}
              </h3>
              <button type="button" aria-label="Mbyll" onClick={() => setPanel(null)} className="p-1 text-white"><X size={17}/></button>
            </div>
            {panel === 'notifications' ? (
              <div className="max-h-[55vh] space-y-2 overflow-y-auto text-xs text-slate-200">
                {notifications.length === 0 ? <p className="py-3 text-slate-300">Nuk ka njoftime të reja.</p> :
                  <>
                    <button type="button" onClick={clearAllNotifications} className="mb-1 text-amber-300 hover:text-white">Pastro njoftimet</button>
                    {notifications.map(item => (
                      <div key={item.id} className="flex items-start gap-2 border-b border-[#46546b] pb-2">
                        <button type="button" onClick={() => go(`/match/${item.matchId}`)}
                          className="min-w-0 flex-1 text-left">
                          <span className="block font-bold text-white">{item.title}</span>
                          <span>{item.message}</span>
                        </button>
                        <button type="button" aria-label="Hiq njoftimin" onClick={() => dismissNotification(item.id)} className="p-1"><X size={15}/></button>
                      </div>
                    ))}
                  </>
                }
              </div>
            ) : (
              <div className="space-y-1 text-sm text-white">
                <div className="mb-2 flex items-center gap-2 rounded bg-[#152131] px-3 py-2 text-xs">
                  <Wallet size={16} className="text-amber-400"/>
                  <span className="text-slate-300">Bilanci</span>
                  <strong className="ml-auto text-amber-300">{user?.balance.toFixed(2) ?? '0.00'} Lek</strong>
                </div>
                <button type="button" onClick={() => go('/my-bets')}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[#39495e]"><Ticket size={16}/> Biletat e mia</button>
                <button type="button" onClick={() => go('/transactions')}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[#39495e]"><Bell size={16}/> Transaksionet</button>
                <label className="flex items-center justify-between gap-2 rounded px-3 py-2">
                  Gjuha
                  <select value={lang} onChange={e => setLanguage(e.target.value as typeof lang)}
                    className="border border-[#64748b] bg-[#152131] px-2 py-1 text-xs text-white">
                    <option value="al">Shqip</option><option value="en">English</option>
                    <option value="de">Deutsch</option><option value="fr">Français</option>
                  </select>
                </label>
                <button type="button" onClick={() => {setPanel(null);logout();navigate('/login');}}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-rose-300 hover:bg-[#39495e]"><LogOut size={16}/> Dil nga llogaria</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
