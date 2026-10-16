import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import {
  CalendarDays, ChevronDown, ChevronRight, Search, X, Star,
  Dribbble, Target, Circle, Trophy,
} from 'lucide-react';
import { isMainFootballCompetition } from '../../utils/sportsbookFilters';

interface Props {
  selectedTournamentId?: string;
  selectedCategoryId?: string;
  selectedSportId?: string;
  isLiveOnly?: boolean;
  isFavoritesOnly?: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onSelectTournament: (id: string) => void;
  onSelectSport: (id: string) => void;
  onSelectCategory: (id: string) => void;
  onSelectAll: () => void;
  onSelectLive: () => void;
  onSelectFavorites: () => void;
}

/** White outlined football, like the supplied compact sportsbook navigation. */
function FootballIcon({ size = 25 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13.6" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M16 8.1 22.9 13l-2.6 8H11.7L9.1 13 16 8.1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="m16 8.1-.3-5.5M22.9 13l5.4-1.6M20.3 21l3.1 5.7M11.7 21l-3.1 5.7M9.1 13l-5.4-1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M10 5.1 6.1 9.8M22 5.1l3.9 4.7M4.6 20.1l6 5.8M27.4 20.1l-6 5.8" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

const sportIcons: Record<string, typeof Trophy> = {
  Basketball: Dribbble, Tennis: Target, 'Ice Hockey': Circle,
  Volleyball: Circle,
};

type SportItem = {
  id: string | number;
  name: string;
  categories?: {
    id: string | number;
    name: string;
    tournaments?: { id: string | number; name: string }[];
  }[];
};

export default function SportsSidebar({
  selectedTournamentId, selectedCategoryId, selectedSportId,
  isLiveOnly, isFavoritesOnly, searchTerm, onSearchChange,
  onSelectTournament, onSelectSport, onSelectCategory,
  onSelectAll, onSelectLive, onSelectFavorites,
}: Props) {
  const { t } = useLanguage();
  const [sports, setSports] = useState<SportItem[]>([]);
  const [expandedSports, setExpandedSports] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    const accept = (data: SportItem[]) => {
      if (!alive) return;
      const items = Array.isArray(data) ? data : [];
      setSports(items);
      setExpandedSports(prev => ({
        ...Object.fromEntries(items.filter(s => s.name === 'Football').map(s => [String(s.id), true])),
        ...prev,
      }));
    };
    apiClient.get('/sports')
      .then(res => accept(res.data))
      .catch(() => apiClient.get('/sports/tree').then(res => accept(res.data)).catch(console.error));
    return () => { alive = false; };
  }, []);

  const isAllActive = !selectedTournamentId && !selectedCategoryId &&
    !selectedSportId && !isLiveOnly && !isFavoritesOnly;

  return (
    <aside className="flex h-full w-[230px] shrink-0 select-none flex-col border-r border-[#101923] bg-[#192330] text-white xl:w-[242px]" aria-label="Sportet dhe kampionatet">
      {/* Three short icon tabs: the reference photo uses this compact navigation. */}
      <div className="grid shrink-0 grid-cols-3 border-b border-[#344254] bg-[#0e1622]">
        <button type="button" onClick={onSelectAll} aria-pressed={isAllActive}
          className={`relative flex min-h-[65px] flex-col items-center justify-center gap-1 border-b-[3px] px-0.5 pt-2 text-center transition-colors hover:bg-[#263141] ${isAllActive ? 'border-[#e5a900]' : 'border-transparent'}`}>
          <CalendarDays size={26} strokeWidth={2.2} aria-hidden="true"/>
          <span className="text-[9px] font-extrabold uppercase leading-tight tracking-tight">{t('sports.all')}</span>
        </button>
        <button type="button" onClick={onSelectLive} aria-pressed={!!isLiveOnly}
          className={`relative flex min-h-[65px] flex-col items-center justify-center gap-1 border-b-[3px] px-0.5 pt-2 text-center transition-colors hover:bg-[#263141] ${isLiveOnly ? 'border-[#e5a900]' : 'border-transparent'}`}>
          <span className="relative">
            <FootballIcon/>
            <span className="absolute -right-5 -top-1 rounded-[2px] bg-[#2e8b48] px-[3px] py-px text-[9px] font-extrabold leading-none text-white">LIVE</span>
          </span>
          <span className="text-[9px] font-extrabold uppercase leading-tight tracking-tight">FUTBOLL</span>
        </button>
        <button type="button" onClick={onSelectFavorites} aria-pressed={!!isFavoritesOnly}
          className={`relative flex min-h-[65px] flex-col items-center justify-center gap-1 border-b-[3px] px-0.5 pt-2 text-center transition-colors hover:bg-[#263141] ${isFavoritesOnly ? 'border-[#e5a900]' : 'border-transparent'}`}>
          <span className="flex h-[25px] w-[25px] items-center justify-center rounded-full border border-white/90"><Star size={16} strokeWidth={1.8}/></span>
          <span className="text-[9px] font-extrabold uppercase leading-tight tracking-tight">FAVORITET</span>
        </button>
      </div>

      {/* Sidebar match search: filters the central match list, not merely this tree. */}
      <div className="shrink-0 border-b border-[#121c2a] bg-[#536073] p-[5px]">
        <label htmlFor="sidebar-match-search" className="mb-1 block text-[12px] font-medium text-white">Kërko Ndeshje</label>
        <div className="flex h-[34px] items-center gap-2 border border-[#8291a5] bg-[#1b2533] px-2 focus-within:border-[#dcae51]">
          <Search size={17} strokeWidth={2.7} className="shrink-0 text-[#d4dde7]" aria-hidden="true"/>
          <input id="sidebar-match-search" type="search" value={searchTerm}
            onChange={e => onSearchChange(e.target.value)} placeholder="Kërko"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white placeholder-[#78879a] outline-none [appearance:textfield] [&::-webkit-search-cancel-button]:hidden"
          />
          {searchTerm && (
            <button type="button" onClick={() => onSearchChange('')} aria-label="Pastro kërkimin"
              className="shrink-0 text-[#c3d2e2] transition-colors hover:text-white">
              <X size={17} strokeWidth={3}/>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[5px] py-2 [scrollbar-color:#657285_#192330] [scrollbar-width:thin]">
        {sports.map(s => {
          const sportId = String(s.id);
          const isFootball = s.name.toLowerCase() === 'football';
          const open = expandedSports[sportId] ?? isFootball;
          const isSportSelected = selectedSportId === sportId;
          const Icon = sportIcons[s.name] ?? Trophy;
          const categories = (s.categories ?? []).map(category => ({
            ...category,
            tournaments: isFootball
              ? (category.tournaments ?? []).filter(tour => isMainFootballCompetition(tour.name, category.name))
              : (category.tournaments ?? []),
          })).filter(cat => cat.tournaments.length > 0);
          return (
            <section key={sportId} className="mb-2 border border-[#111b28]">
              <div className={`flex h-[30px] items-center bg-[#4c596c] text-[12px] ${isSportSelected ? 'font-bold text-white' : 'text-[#e4ebf4]'}`}>
                <button type="button" onClick={() => onSelectSport(sportId)}
                  aria-pressed={isSportSelected}
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-left hover:text-white">
                  {isFootball ? <FootballIcon size={15}/> : <Icon size={15}/>}
                  <span className="truncate">{t(`sports.${s.name}`) || s.name}</span>
                </button>
                <button type="button" onClick={() => setExpandedSports(prev => ({...prev,[sportId]:!open}))}
                  aria-label={`${open ? 'Mbyll' : 'Hap'} ${s.name}`} aria-expanded={open}
                  className="flex h-full shrink-0 items-center gap-[3px] px-[6px] text-[#d9e2ed] hover:bg-[#607087]">
                  <span className="h-[15px] w-[15px] border border-[#bac5d2]"/>
                  {open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                </button>
              </div>
              {open && (
                <div className="bg-[#202a38]">
                  {isFootball && (
                    <button type="button" onClick={onSelectLive}
                      className={`flex h-[34px] w-full items-center justify-between border-b border-[#151e29] px-2 text-left text-[12px] font-semibold text-white transition-colors hover:bg-[#387548] ${isLiveOnly ? 'bg-[#347c41]' : 'bg-[#2c6335]'}`}>
                      <span>Live</span><ChevronDown size={13} fill="currentColor"/>
                    </button>
                  )}
                  {categories.map(category => {
                    const categoryId = String(category.id);
                    const selected = selectedCategoryId === categoryId;
                    const expanded = !!expandedCategories[categoryId];
                    return (
                      <div key={categoryId} className="border-b border-[#101923] last:border-b-0">
                        <div className={`flex min-h-[29px] items-center text-[12px] transition-colors hover:bg-[#314154] ${selected ? 'bg-[#344759] text-white' : 'text-[#c3cfde]'}`}>
                          <button type="button" aria-label={`Filtro ${category.name}`}
                            onClick={() => onSelectCategory(categoryId)}
                            className="flex h-[29px] shrink-0 items-center px-[6px]">
                            <span className={`flex h-[16px] w-[16px] items-center justify-center border border-[#a3b2c4] text-[11px] ${selected ? 'border-[#e3ad31] bg-[#e3ad31] text-[#17212d]' : ''}`}>
                              {selected ? '✓' : ''}
                            </span>
                          </button>
                          <button type="button" onClick={() => onSelectCategory(categoryId)}
                            className="min-w-0 flex-1 truncate px-[6px] py-[6px] text-left">
                            {category.name}
                          </button>
                          <button type="button" onClick={() => setExpandedCategories(prev => ({...prev,[categoryId]:!expanded}))}
                            aria-label={`${expanded ? 'Mbyll' : 'Hap'} ligat e ${category.name}`}
                            aria-expanded={expanded}
                            className="flex h-[29px] items-center px-[7px] hover:bg-[#46576a]">
                            {expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                          </button>
                        </div>
                        {expanded && (
                          <div className="border-t border-[#152232] bg-[#151f2c]">
                            {category.tournaments.map(tour => {
                              const selected = selectedTournamentId === String(tour.id);
                              return (
                                <button type="button" key={tour.id} onClick={() => onSelectTournament(String(tour.id))}
                                  title={tour.name}
                                  className={`flex min-h-[28px] w-full items-center gap-2 px-[7px] py-1 text-left text-[11px] transition-colors hover:bg-[#2d3d50] ${selected ? 'font-bold text-[#f2bc42]' : 'text-[#b9c6d7]'}`}>
                                  <span className={`h-[13px] w-[13px] shrink-0 border ${selected ? 'border-[#f2bc42] bg-[#f2bc42]' : 'border-[#78889e]'}`}/>
                                  <span className="truncate">{tour.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {categories.length === 0 && (
                    <div className="px-2 py-3 text-[11px] text-[#9aa8ba]">Nuk ka liga të disponueshme</div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
