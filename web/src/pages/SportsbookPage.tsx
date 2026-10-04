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

        {/* small screens: the two columns there is no room for, as buttons that never move */}
        <div className="xl:hidden fixed bottom-0 inset-x-0 z-30 bg-secondary border-t border-tertiary flex items-stretch text-xs font-bold pb-[env(safe-area-inset-bottom)]">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-text-secondary active:bg-tertiary"
            onClick={() => {
              setBetslipOpen(false);
              setNavOpen((v) => !v);
            }}
          >
            <ListOrdered size={16} /> {t('nav.sports')}
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-white bg-accent-green/90 active:bg-accent-green"
            onClick={() => {
              setNavOpen(false);
              setBetslipOpen((v) => !v);
            }}
          >
            <Ticket size={16} /> {t('betslip.betslip')} ({selections.length})
            {selections.length > 0 && (
              <span className="text-[10px] font-black bg-primary/30 rounded px-1">{totalOdds.toFixed(2)}</span>
            )}
          </button>
        </div>

        {/* leagues drawer */}
        {navOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex" onClick={() => setNavOpen(false)}>
            <div className="relative h-full" onClick={(e) => e.stopPropagation()}>
              {sidebar}
              {/* the drawer has no chrome of its own, so the close button floats over it */}
              <button
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white"
                onClick={() => setNavOpen(false)}
                aria-label={t('common.cancel')}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* betslip sheet */}
        {betslipOpen && (
          <div className="xl:hidden fixed inset-0 z-40 flex items-end" onClick={() => setBetslipOpen(false)}>
            <BetslipSidebar className="w-full max-h-[80dvh] rounded-t-2xl border-t border-tertiary overflow-hidden" />
          </div>
        )}
      </div>
    </LiveFeedProvider>
  );
}