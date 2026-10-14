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
  const [matchMode, setMatchMode] = useState<'all' | 'live' | 'prematch'>('all');
  const isLiveOnly = matchMode === 'live';
  // small screens: the leagues drawer and the betslip sheet
  const [navOpen, setNavOpen] = useState(false);
  const [betslipOpen, setBetslipOpen] = useState(false);

  // both are overlays: opening a match closes them
  useEffect(() => {
    setNavOpen(false);
    setBetslipOpen(false);
  }, [id]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setNavOpen(false); setBetslipOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const handleSelectTournament = (tourId: string) => {
    setSelectedTournament(tourId);
    setSelectedCategory('');
    setSelectedSport('');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedTournament('');
    setSelectedSport('');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectSport = (sportId: string) => {
    setSelectedSport(sportId);
    setSelectedTournament('');
    setSelectedCategory('');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectAll = () => {
    setMatchMode('all');
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectLive = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setMatchMode('live');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const sidebar = (
    <SportsSidebar
      selectedTournamentId={selectedTournament}
      selectedSportId={selectedSport}
      selectedCategoryId={selectedCategory}
      matchMode={matchMode}
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
        <Header onToggleNav={() => { setBetslipOpen(false); setNavOpen((v) => !v); }} />

        <div className="flex-1 flex overflow-hidden">
          {/* leagues: always there from lg up, a drawer below that */}
          <div className="hidden lg:flex">{sidebar}</div>

          <main className="flex-1 min-w-0 overflow-y-auto bg-primary pb-[calc(5rem+env(safe-area-inset-bottom))] xl:pb-0">
            {!id && <div className="max-w-6xl mx-auto px-3 pt-5 sm:px-6 space-y-4">
              <div><h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('board.title')}</h1><p className="mt-1 text-sm text-text-secondary">{t('board.hint')}</p></div>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-secondary border border-white/10 p-1.5" aria-label={t('board.title')}>
                {(['all', 'live', 'prematch'] as const).map(mode => <button type="button" key={mode} aria-pressed={matchMode === mode} onClick={() => setMatchMode(mode)} className={`min-h-[48px] rounded-xl px-2 text-xs sm:text-sm font-semibold transition ${matchMode === mode ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-text-secondary hover:bg-white/5 hover:text-white'}`}>{mode === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-2" />}{t(`board.${mode}`)}</button>)}
              </div>
              {(selectedSport || selectedCategory || selectedTournament) && <button className="filter-chip" onClick={() => { setSelectedSport(''); setSelectedCategory(''); setSelectedTournament(''); }}>{t('sections.all_competitions')}</button>}
            </div>}
            {id ? (
              <MatchDetail />
            ) : (
              <MatchList
                tournamentId={selectedTournament}
                categoryId={selectedCategory}
                sportId={selectedSport}
                isLiveOnly={isLiveOnly}
                matchMode={matchMode}
              />
            )}
          </main>

          {/* betslip: a rail from xl up, a bottom sheet below that */}
          <div className="hidden xl:flex">
            <BetslipSidebar />
          </div>
        </div>

        {/* small screens: modern bottom navigation dock */}
        <div className="xl:hidden fixed bottom-0 inset-x-0 z-30 bg-secondary/95 backdrop-blur-xl border-t border-tertiary/80 flex items-stretch text-xs font-bold shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <button
            className={`lg:hidden flex-1 flex items-center justify-center gap-2 py-3.5 transition-all ${
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
              <button type="button" className="w-full min-h-[44px] px-4 flex items-center justify-between bg-secondary text-sm text-text-secondary" onClick={() => setBetslipOpen(false)}><span>{t('common.close')}</span><X size={18} /></button>
              <BetslipSidebar className="w-full flex-1 overflow-hidden" />
            </div>
          </div>
        )}
      </div>
    </LiveFeedProvider>
  );
}