import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import SportsSidebar from '../components/Layout/SportsSidebar';
import BetslipSidebar from '../components/Layout/BetslipSidebar';
import MatchList from '../components/Sports/MatchList';
import MatchDetail from '../components/Sports/MatchDetail';
import { LiveFeedProvider } from '../api/liveFeed';
import { useBetslip } from '../context/BetslipContext';
import { useLanguage } from '../context/LanguageContext';
import { ListOrdered, Ticket, X } from 'lucide-react';

/**
 * The board. Three columns on a desktop (leagues | matches | betslip); on a phone the two side
 * columns become drawers over the matches, opened from the header and from the bottom bar.
 * `100dvh` rather than `h-screen`, so the browser bars on a phone cannot push the bottom bar
 * off the screen.
 */
export default function SportsbookPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { selections, totalOdds } = useBetslip();
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [isLiveOnly, setIsLiveOnly] = useState<boolean>(false);
  // small screens: the leagues drawer and the betslip sheet
  const [navOpen, setNavOpen] = useState(false);
  const [betslipOpen, setBetslipOpen] = useState(false);

  // both are overlays: opening a match closes them
  useEffect(() => {
    setNavOpen(false);
    setBetslipOpen(false);
  }, [id]);

  const handleSelectTournament = (tourId: string) => {
    setSelectedTournament(tourId);
    setSelectedCategory('');
    setSelectedSport('');
    setIsLiveOnly(false);
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedTournament('');
    setSelectedSport('');
    setIsLiveOnly(false);
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectSport = (sportId: string) => {
    setSelectedSport(sportId);
    setSelectedTournament('');
    setSelectedCategory('');
    setIsLiveOnly(false);
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectAll = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setIsLiveOnly(false);
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectLive = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setIsLiveOnly(true);
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const sidebar = (
    <SportsSidebar
      selectedTournamentId={selectedTournament}
      selectedSportId={selectedSport}
      isLiveOnly={isLiveOnly}
      onSelectTournament={handleSelectTournament}
      onSelectSport={handleSelectSport}
      onSelectCategory={handleSelectCategory}
      onSelectAll={handleSelectAll}
      onSelectLive={handleSelectLive}
    />
  );

  return (
    <LiveFeedProvider>
      <div className="h-[100dvh] flex flex-col overflow-hidden bg-primary">
        <Header onToggleNav={() => setNavOpen((v) => !v)} />

        <div className="flex-1 flex overflow-hidden">
          {/* leagues: always there from lg up, a drawer below that */}
          <div className="hidden lg:flex">{sidebar}</div>

          <div className="flex-1 overflow-y-auto bg-primary pb-16 lg:pb-0">
            {id ? (
              <MatchDetail />
            ) : (
              <MatchList
                tournamentId={selectedTournament}
                categoryId={selectedCategory}
                sportId={selectedSport}
                isLiveOnly={isLiveOnly}
              />
            )}
          </div>

          {/* betslip: a rail from xl up, a bottom sheet below that */}
          <div className="hidden xl:flex">
            <BetslipSidebar />
          </div>
        </div>

        {/* small screens: modern bottom navigation dock */}
        <div className="xl:hidden fixed bottom-0 inset-x-0 z-30 bg-secondary/95 backdrop-blur-xl border-t border-tertiary/80 flex items-stretch text-xs font-bold shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all ${
              navOpen ? 'text-accent-green bg-primary/40' : 'text-text-secondary active:bg-tertiary/60'
            }`}
            onClick={() => {
              setBetslipOpen(false);
              setNavOpen((v) => !v);
            }}
          >
            <ListOrdered size={16} className={navOpen ? 'text-accent-green' : 'text-text-secondary'} />
            <span className="tracking-wide">{t('nav.sports')}</span>
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all ${
              selections.length > 0
                ? 'bg-gradient-to-r from-emerald-600 to-accent-green text-primary shadow-glow-green font-black'
                : 'text-text-secondary bg-primary/50 active:bg-tertiary/60'
            }`}
            onClick={() => {
              setNavOpen(false);
              setBetslipOpen((v) => !v);
            }}
          >
            <Ticket size={16} />
            <span>{t('betslip.betslip')}</span>
            {selections.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-primary text-accent-green border border-primary/20">
                {selections.length}
              </span>
            )}
            {selections.length > 0 && (
              <span className="text-[10px] font-mono font-black bg-primary/20 rounded px-1.5 py-0.5">
                @{totalOdds.toFixed(2)}
              </span>
            )}
          </button>
        </div>

        {/* leagues drawer */}
        {navOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setNavOpen(false)}>
            <div className="relative h-full animate-in slide-in-from-left duration-250 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {sidebar}
              <button
                className="absolute top-3 right-3 p-2 rounded-full bg-primary/80 hover:bg-primary border border-tertiary/80 text-white shadow-lg transition"
                onClick={() => setNavOpen(false)}
                aria-label={t('common.cancel')}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* betslip sheet */}
        {betslipOpen && (
          <div className="xl:hidden fixed inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setBetslipOpen(false)}>
            <div className="w-full max-h-[85dvh] bg-secondary rounded-t-3xl border-t border-tertiary/90 overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250" onClick={(e) => e.stopPropagation()}>
              {/* Sheet handle bar */}
              <div className="w-full py-2 flex justify-center bg-secondary cursor-pointer" onClick={() => setBetslipOpen(false)}>
                <div className="w-12 h-1.5 rounded-full bg-tertiary hover:bg-slate-500 transition"></div>
              </div>
              <BetslipSidebar className="w-full flex-1 overflow-hidden" />
            </div>
          </div>
        )}
      </div>
    </LiveFeedProvider>
  );
}