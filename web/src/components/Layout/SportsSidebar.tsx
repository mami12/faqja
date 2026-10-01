import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Globe, Radio, ChevronRight, ChevronDown, Flame } from 'lucide-react';

interface Props {
  selectedTournamentId?: string;
  selectedSportId?: string;
  isLiveOnly?: boolean;
  onSelectTournament: (id: string) => void;
  onSelectSport: (id: string) => void;
  onSelectCategory: (id: string) => void;
  onSelectAll: () => void;
  onSelectLive: () => void;
}

const sportIcons: Record<string, string> = {
  Football: '⚽',
  Basketball: '🏀',
  Tennis: '🎾',
  'Ice Hockey': '🏒',
  Volleyball: '🏐'
};

export default function SportsSidebar({
  selectedTournamentId,
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

  return (
    <div className="w-64 bg-secondary border-r border-tertiary h-full flex flex-col select-none">
      {/* Top Quick Filters */}
      <div className="p-3 border-b border-tertiary space-y-1.5">
        <button
          onClick={onSelectAll}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition ${
            !selectedTournamentId && !selectedSportId && !isLiveOnly
              ? 'bg-accent-green text-primary shadow-md'
              : 'text-text-primary hover:bg-tertiary/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <Globe size={16} />
            <span>{t('sports.all')}</span>
          </div>
        </button>

        <button
          onClick={onSelectLive}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition ${
            isLiveOnly
              ? 'bg-accent-red text-white shadow-md'
              : 'text-rose-400 hover:bg-rose-500/10'
          }`}
        >
          <div className="flex items-center gap-2">
            <Radio size={16} className="animate-pulse" />
            <span>{t('sports.live')}</span>
          </div>
          <span className="bg-accent-red/20 text-accent-red px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
            LIVE
          </span>
        </button>
      </div>

      {/* Sports Tree */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs">
        <div className="px-2 py-1.5 text-[11px] font-bold text-text-secondary uppercase tracking-wider">
          {t('nav.sports')}
        </div>

        {sports.map(s => {
          const isSportSelected = selectedSportId === String(s.id);
          const isExpanded = !!expandedSports[s.id];
          const icon = sportIcons[s.name] || '🏆';
          const translatedName = t(`sports.${s.name}`) || s.name;

          return (
            <div key={s.id} className="rounded-lg overflow-hidden">
              <div 
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                  isSportSelected ? 'bg-primary border border-accent-green/50 text-white font-bold' : 'hover:bg-tertiary/50 text-text-primary'
                }`}
                onClick={() => onSelectSport(String(s.id))}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="text-base">{icon}</span>
                  <span className="font-semibold truncate">{translatedName}</span>
                </div>
                <div 
                  className="p-1 hover:bg-tertiary rounded text-text-secondary hover:text-white"
                  onClick={(e) => toggleSport(String(s.id), e)}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </div>

              {/* Categories & Tournaments */}
              {isExpanded && s.categories && (
                <div className="ml-3 pl-2 border-l border-tertiary/80 my-1 space-y-0.5">
                  {s.categories.map((c: any) => {
                    const isCatExpanded = !!expandedCategories[c.id];
                    return (
                      <div key={c.id}>
                        <div 
                          className="flex items-center justify-between p-1.5 rounded hover:bg-tertiary/40 cursor-pointer text-text-secondary hover:text-white"
                          onClick={(e) => {
                            toggleCat(String(c.id), e);
                            onSelectCategory(String(c.id));
                          }}
                        >
                          <span className="truncate font-medium">{c.name}</span>
                          {isCatExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </div>

                        {isCatExpanded && c.tournaments && (
                          <div className="ml-2 pl-2 border-l border-tertiary/50 space-y-0.5 my-0.5">
                            {c.tournaments.map((tour: any) => {
                              const isTourSelected = selectedTournamentId === String(tour.id);
                              return (
                                <button
                                  key={tour.id}
                                  onClick={() => onSelectTournament(String(tour.id))}
                                  className={`w-full text-left px-2 py-1 rounded text-[11px] truncate transition ${
                                    isTourSelected 
                                      ? 'bg-accent-green/20 text-accent-green font-bold' 
                                      : 'text-text-secondary hover:text-white hover:bg-tertiary/30'
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
