import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import SportsSidebar, { FootballIcon } from '../components/Layout/SportsSidebar';
import MobileSportsHeader from '../components/Layout/MobileSportsHeader';
import BetslipSidebar from '../components/Layout/BetslipSidebar';
import MatchList from '../components/Sports/MatchList';
import MatchDetail from '../components/Sports/MatchDetail';
import { LiveFeedProvider } from '../api/liveFeed';
import { useBetslip } from '../context/BetslipContext';
import { useLanguage } from '../context/LanguageContext';
import { CalendarDays, Search, ListOrdered, Ticket, X } from 'lucide-react';
import type { MatchViewMode } from '../components/Sports/MatchList';

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
  // Shared by icon tabs, the board filters and the side search.
  const [viewMode, setViewMode] = useState<MatchViewMode>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const isLiveOnly = viewMode === 'live';
  const isFavoritesOnly = viewMode === 'favorites';
  // small screens: the leagues drawer and the betslip sheet
  const [navOpen, setNavOpen] = useState(false);
  const [betslipOpen, setBetslipOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mobileSearchOpen) mobileSearchRef.current?.focus(); }, [mobileSearchOpen]);

  // both are overlays: opening a match closes them
  useEffect(() => {
    setNavOpen(false);
    setBetslipOpen(false);
  }, [id]);

  const handleSelectTournament = (tourId: string) => {
    setSelectedTournament(tourId);
    setSelectedCategory('');
    setSelectedSport('');
    setViewMode('all');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedTournament('');
    setSelectedSport('');
    setViewMode('all');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectSport = (sportId: string) => {
    setSelectedSport(sportId);
    setSelectedTournament('');
    setSelectedCategory('');
    setViewMode('all');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectAll = () => {
    setMobileSearchOpen(false);
    setSearchTerm('');
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setViewMode('all');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectLive = () => {
    setMobileSearchOpen(false);
    setSearchTerm('');
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setViewMode('live');
    setNavOpen(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectFavorites = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setViewMode('favorites');
    setNavOpen(false);
    if (id) navigate('/');
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (id) navigate('/');
  };

  const sidebar = (
    <SportsSidebar
      selectedTournamentId={selectedTournament}
      selectedCategoryId={selectedCategory}
      selectedSportId={selectedSport}
      isLiveOnly={isLiveOnly}
      isFavoritesOnly={isFavoritesOnly}
      searchTerm={searchTerm}
      onSearchChange={handleSearchChange}
      onSearchSubmit={() => setNavOpen(false)}
      onSelectFavorites={handleSelectFavorites}
      onSelectTournament={handleSelectTournament}
      onSelectSport={handleSelectSport}
      onSelectCategory={handleSelectCategory}
      onSelectAll={handleSelectAll}
      onSelectLive={handleSelectLive}
    />
  );

  return (
    <LiveFeedProvider>
      <div className="h-[100dvh] flex flex-col overflow-hidden bg-primary xl:bg-[#0d141c]">
        <div className="hidden md:block"><Header onToggleNav={() => setNavOpen(v => !v)}/></div>
        <MobileSportsHeader
          onOpenLeagues={() => {setBetslipOpen(false);setNavOpen(v => !v);}}
          onOpenBetslip={() => {setNavOpen(false);setBetslipOpen(v => !v);}}
        />
        {/* Compact mobile shortcuts, as on the reference board. */}
        <nav aria-label="Shkurtoret e sporteve" className="flex h-[63px] shrink-0 items-stretch border-b border-[#111a26] bg-[#0d1420] text-white md:hidden">
          <button type="button" onClick={handleSelectAll} aria-pressed={viewMode === 'all' && !selectedSport && !selectedCategory && !selectedTournament}
            className={`flex w-[66px] shrink-0 flex-col items-center justify-center gap-1 border-r border-[#343d4d] border-b-[3px] pt-1 text-center ${viewMode === 'all' ? 'border-b-[#e2a600]' : 'border-b-transparent'}`}>
            <CalendarDays size={25} strokeWidth={2.4}/>
            <span className="text-[10px] font-black leading-tight">TË GJITHA</span>
          </button>
          <button type="button" onClick={() => {
              setMobileSearchOpen(v => !v);
              setViewMode('all');
              setSelectedSport(''); setSelectedCategory(''); setSelectedTournament('');
              if (id) navigate('/');
            }}
            aria-pressed={mobileSearchOpen || !!searchTerm} aria-expanded={mobileSearchOpen}
            className={`flex w-[65px] shrink-0 flex-col items-center justify-center gap-1 border-r border-[#343d4d] border-b-[3px] pt-1 text-center ${mobileSearchOpen || searchTerm ? 'border-b-[#e2a600]' : 'border-b-transparent'}`}>
            <Search size={26} strokeWidth={3}/>
            <span className="text-[10px] font-bold leading-tight">Kërko</span>
          </button>
          <button type="button" onClick={handleSelectLive} aria-pressed={isLiveOnly}
            className={`flex w-[83px] shrink-0 flex-col items-center justify-center gap-1 border-r border-[#343d4d] border-b-[3px] pt-1 text-center ${isLiveOnly ? 'border-b-[#e2a600]' : 'border-b-transparent'}`}>
            <span className="relative">
              <FootballIcon size={25}/>
              <span className="absolute -right-5 -top-1 rounded-[2px] bg-[#2e873d] px-[3px] text-[9px] font-black leading-4">LIVE</span>
            </span>
            <span className="text-[10px] font-black leading-tight">FUTBOLL</span>
          </button>
          <div className="min-w-0 flex-1 bg-[#101925]" aria-hidden="true"/>
          <button type="button" onClick={() => navigate('/casino')}
            className="flex w-[75px] shrink-0 flex-col items-center justify-center gap-1 border-b-[3px] border-amber-500 pt-1 text-amber-300 transition-colors hover:bg-[#263141]">
            <span className="text-[25px] leading-7" aria-hidden="true">🎰</span>
            <span className="text-[10px] font-black leading-tight">KAZINO</span>
          </button>
        </nav>
        {mobileSearchOpen && (
          <form role="search" onSubmit={e => {e.preventDefault();mobileSearchRef.current?.blur();}}
            className="flex shrink-0 items-center gap-2 border-b border-[#4b596c] bg-[#536073] p-2 md:hidden">
            <Search size={19} className="shrink-0 text-white"/>
            <input ref={mobileSearchRef} type="search" value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Kërko ndeshje ose kampionat" aria-label="Kërko ndeshje"
              className="h-9 min-w-0 flex-1 border border-[#8593a7] bg-[#1b2533] px-2 text-sm text-white outline-none placeholder:text-[#aab7c6]"/>
            <button type="button" className="p-1 text-white"
              aria-label={searchTerm ? 'Pastro kërkimin' : 'Mbyll kërkimin'}
              onClick={() => searchTerm ? handleSearchChange('') : setMobileSearchOpen(false)}><X size={19}/></button>
          </form>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* leagues: always there from lg up, a drawer below that */}
          <div className="hidden lg:flex">{sidebar}</div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-primary pb-0 md:pb-16 xl:pb-0 xl:border-x xl:border-[#101822] xl:bg-[#151e28]">
            {id ? (
              <MatchDetail />
            ) : (
              <MatchList
                tournamentId={selectedTournament}
                categoryId={selectedCategory}
                sportId={selectedSport}
                isLiveOnly={isLiveOnly}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
              />
            )}
          </div>

          {/* betslip: a rail from xl up, a bottom sheet below that */}
          <div className="hidden xl:flex">
            <BetslipSidebar />
          </div>
        </div>

        {/* small screens: modern bottom navigation dock */}
        <div className="hidden md:flex xl:hidden fixed bottom-0 inset-x-0 z-30 bg-secondary/95 backdrop-blur-sm border-t border-tertiary/80 flex items-stretch text-xs font-bold shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all ${
              navOpen ? 'text-accent-yellow bg-primary/40' : 'text-text-secondary active:bg-tertiary/60'
            }`}
            onClick={() => {
              setBetslipOpen(false);
              setNavOpen((v) => !v);
            }}
          >
            <ListOrdered size={16} className={navOpen ? 'text-accent-yellow' : 'text-text-secondary'} />
            <span className="tracking-wide">{t('nav.sports')}</span>
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all ${
              selections.length > 0
                ? 'bg-accent-yellow text-[#17212c] font-bold'
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
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-primary text-accent-yellow border border-primary/20">
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
                className="absolute top-2 -right-11 p-2 rounded-full bg-primary/80 hover:bg-primary border border-tertiary/80 text-white shadow-lg transition"
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
            <div className="w-full max-h-[92dvh] bg-secondary rounded-t-sm border-t border-tertiary/90 overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250" onClick={(e) => e.stopPropagation()}>
              {/* Sheet handle bar */}
              <button
                type="button"
                className="flex w-full justify-center bg-secondary py-2"
                onClick={() => setBetslipOpen(false)}
                aria-label={t('common.cancel')}
              >
                <span className="h-1.5 w-12 rounded-full bg-tertiary transition hover:bg-slate-500" />
              </button>
              <BetslipSidebar className="w-full flex-1 overflow-hidden" />
            </div>
          </div>
        )}
      </div>
    </LiveFeedProvider>
  );
}