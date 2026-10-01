import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import SportsSidebar from '../components/Layout/SportsSidebar';
import BetslipSidebar from '../components/Layout/BetslipSidebar';
import MatchList from '../components/Sports/MatchList';
import MatchDetail from '../components/Sports/MatchDetail';

export default function SportsbookPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [isLiveOnly, setIsLiveOnly] = useState<boolean>(false);

  const handleSelectTournament = (tourId: string) => {
    setSelectedTournament(tourId);
    setSelectedCategory('');
    setSelectedSport('');
    setIsLiveOnly(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedTournament('');
    setSelectedSport('');
    setIsLiveOnly(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectSport = (sportId: string) => {
    setSelectedSport(sportId);
    setSelectedTournament('');
    setSelectedCategory('');
    setIsLiveOnly(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectAll = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setIsLiveOnly(false);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  const handleSelectLive = () => {
    setSelectedSport('');
    setSelectedCategory('');
    setSelectedTournament('');
    setIsLiveOnly(true);
    // Navigate back to matches list if on match detail page
    if (id) navigate('/');
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-primary">
      <Header />
      <div className="flex-1 flex overflow-hidden">
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
        
        <div className="flex-1 overflow-y-auto bg-primary">
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

        <BetslipSidebar />
      </div>
    </div>
  );
}