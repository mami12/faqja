import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Globe, Radio, ChevronDown, Trophy, CircleDot, Dribbble, Target, Circle } from 'lucide-react';
import { isMainFootballCompetition } from '../../utils/sportsbookFilters';

interface Props {
  selectedTournamentId?: string;
  selectedCategoryId?: string;
  selectedSportId?: string;
  isLiveOnly?: boolean;
  onSelectTournament: (id: string) => void;
  onSelectSport: (id: string) => void;
  onSelectCategory: (id: string) => void;
  onSelectAll: () => void;
  onSelectLive: () => void;
}

const sportIcons: Record<string, typeof CircleDot> = {
  Football: CircleDot,
  Basketball: Dribbble,
  Tennis: Target,
  'Ice Hockey': Circle,
  Volleyball: Circle,
};

export default function SportsSidebar({
  selectedTournamentId,
  selectedCategoryId,
  selectedSportId,
  isLiveOnly,
  onSelectTournament,
  onSelectSport,
  onSelectCategory,
  onSelectAll,
  onSelectLive
}: Props) {
  const { t } = useLanguage();
  const [sports, setSports] = useState<any[]>([]);
  const [expandedSports, setExpandedSports] = useState<Record<string, boolean>>({ '1': true }); // Expand Football by default
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ '1': true }); // Expand England by default

  useEffect(() => {
    apiClient.get('/sports')
      .then(res => setSports(res.data))
      .catch(() => {
        apiClient.get('/sports/tree').then(res => setSports(res.data)).catch(console.error);
      });
  }, []);

  const toggleSport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSports(p => ({ ...p, [id]: !p[id] }));
  };

  const toggleCat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCategories(p => ({ ...p, [id]: !p[id] }));
  };

  const isAllActive = !selectedTournamentId && !selectedCategoryId && !selectedSportId && !isLiveOnly;

  return (
    <div className="w-[248px] xl:w-[264px] bg-secondary border-r border-tertiary h-full flex flex-col select-none text-text-primary">
      {/* Top Quick Filters */}
      <div className="p-3 border-b border-tertiary space-y-2 bg-secondary/80">
        <button
          onClick={onSelectAll}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            isAllActive
              ? 'bg-gradient-to-r from-emerald-600 to-accent-green text-primary shadow-glow-green'
              : 'bg-primary/60 text-text-secondary hover:text-white hover:bg-tertiary/70 border border-tertiary/60'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Globe size={16} className={isAllActive ? 'text-primary' : 'text-accent-green'} />
            <span className="tracking-wide">{t('sports.all')}</span>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
            isAllActive ? 'bg-primary/20 text-primary' : 'bg-tertiary text-text-secondary'
          }`}>
            TË GJITHA
          </span>
        </button>

        <button
          onClick={onSelectLive}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            isLiveOnly
              ? 'bg-gradient-to-r from-rose-600 to-accent-red text-white shadow-glow-red'
              : 'bg-primary/60 text-text-secondary hover:text-rose-400 hover:bg-rose-500/10 border border-tertiary/60'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-red"></span>
            </span>
            <Radio size={16} className={isLiveOnly ? 'text-white' : 'text-rose-400'} />
            <span className="tracking-wide">{t('sports.live')}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
            isLiveOnly ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-400'
          }`}>
            LIVE
          </span>
        </button>
      </div>

      {/* Sports Tree */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 text-xs">
        <div className="px-2.5 py-1 text-[11px] font-black text-text-secondary/70 uppercase tracking-widest flex items-center gap-1.5">
          <Trophy size={13} className="text-accent-yellow/80" />
          <span>{t('nav.sports')}</span>
        </div>

        {sports.map(s => {
          const isSportSelected = selectedSportId === String(s.id);
          const isExpanded = !!expandedSports[s.id];
          const SportIcon = sportIcons[s.name] || Trophy;
          const translatedName = t(`sports.${s.name}`) || s.name;

          return (
            <div key={s.id} className="rounded-xl overflow-hidden transition-colors">
              <div 
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                  isSportSelected
                    ? 'bg-primary border border-accent-green/50 text-white font-bold shadow-sm'
                    : 'hover:bg-primary/60 text-text-primary'
                }`}
                onClick={() => onSelectSport(String(s.id))}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isSportSelected ? 'bg-accent-green/15 text-accent-green' : 'bg-primary/70 text-text-secondary'}`}>
                    <SportIcon size={15} strokeWidth={2.2} />
                  </span>
                  <span className="font-semibold truncate tracking-tight">{translatedName}</span>
                </div>
                <div 
                  className="p-1 hover:bg-tertiary rounded-lg text-text-secondary hover:text-white transition"
                  onClick={(e) => toggleSport(String(s.id), e)}
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                </div>
              </div>

              {/* Categories & Tournaments */}
              {isExpanded && s.categories && (
                <div className="ml-3.5 pl-2.5 border-l border-tertiary/60 my-1 space-y-1">
                  {s.categories.filter((category: any) => {
                    const tournaments = category.tournaments ?? [];
                    return s.name === 'Football'
                      ? tournaments.some((tournament: any) =>
                          isMainFootballCompetition(tournament.name, category.name),
                        )
                      : tournaments.length > 0;
                  }).map((c: any) => {
                    const isCatExpanded = !!expandedCategories[c.id];
                    const categoryTournaments = c.tournaments ?? [];
                    const visibleTournaments = s.name === 'Football'
                      ? categoryTournaments.filter((tour: any) => isMainFootballCompetition(tour.name, c.name))
                      : categoryTournaments;
                    return (
                      <div key={c.id}>
                        <div className="flex items-center rounded-lg text-text-secondary transition hover:bg-primary/50 hover:text-white">
                          <button
                            type="button"
                            className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition ${
                              selectedCategoryId === String(c.id)
                                ? 'bg-accent-green/10 text-accent-green'
                                : ''
                            }`}
                            onClick={() => onSelectCategory(String(c.id))}
                          >
                            {c.name}
                          </button>
                          <span className="px-1 text-[9px] tabular-nums text-text-muted">{visibleTournaments.length}</span>
                          <button
                            type="button"
                            aria-label={`${isCatExpanded ? 'Mbyll' : 'Hap'} ${c.name}`}
                            aria-expanded={isCatExpanded}
                            className="mr-1 rounded-md p-1 hover:bg-tertiary"
                            onClick={(event) => toggleCat(String(c.id), event)}
                          >
                            <ChevronDown
                              size={12}
                              className={`transition-transform duration-150 ${isCatExpanded ? 'rotate-0' : '-rotate-90'}`}
                            />
                          </button>
                        </div>

                        {isCatExpanded && (
                          <div className="ml-2 pl-2 border-l border-tertiary/40 space-y-0.5 my-0.5">
                            {visibleTournaments.map((tour: any) => {
                              const isTourSelected = selectedTournamentId === String(tour.id);
                              return (
                                <button
                                  key={tour.id}
                                  onClick={() => onSelectTournament(String(tour.id))}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate transition-all ${
                                    isTourSelected 
                                      ? 'bg-accent-green/20 text-accent-green font-bold border-l-2 border-accent-green pl-2.5' 
                                      : 'text-text-secondary hover:text-white hover:bg-tertiary/40'
                                  }`}
                                >
                                  {tour.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
