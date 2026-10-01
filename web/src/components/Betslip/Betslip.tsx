import { useState } from 'react';
import { useBetslip } from '../../context/BetslipContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Trash2, AlertTriangle, Search, Ticket as TicketIcon, X } from 'lucide-react';
import BookingModal from './BookingModal';
import { apiClient } from '../../api/client';

export default function Betslip() {
  const { 
    selections, stake, setStake, ticketType, setTicketType, systemType, setSystemType, 
    removeSelection, clearAll, totalOdds, potentialPayout, placeBet, bookTicket 
  } = useBetslip();
  const { t } = useLanguage();
  const { user, refreshUser } = useAuth();
  
  const [oddsChangedError, setOddsChangedError] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [stakeError, setStakeError] = useState('');

  // Ticket search state
  const [ticketSearch, setTicketSearch] = useState('');
  const [searchedTicket, setSearchedTicket] = useState<any>(null);
  const [ticketSearchError, setTicketSearchError] = useState('');
  const [ticketSearchLoading, setTicketSearchLoading] = useState(false);

  const handlePlaceBet = async () => {
    const stakeNum = parseFloat(stake) || 0;
    if (stakeNum < 1) {
      setStakeError(t('betslip.min_stake'));
      return;
    }
    setStakeError('');
    
    try {
      await placeBet(() => refreshUser());
      clearAll();
      alert(t('common.success'));
    } catch (e: any) {
      if (e.response?.data?.message === 'Odds have changed') {
        setOddsChangedError(true);
      } else {
        alert(e.response?.data?.message || t('common.error'));
      }
    }
  };

  const handleBook = async () => {
    try {
      const res = await bookTicket();
      setBookingCode(res.bookingCode);
      setShowBookingModal(true);
      clearAll();
    } catch (e: any) {
      alert(e.response?.data?.message || t('common.error'));
    }
  };

  const handleSearchTicket = async () => {
    const query = ticketSearch.trim();
    if (!query) {
      setTicketSearchError(t('betslip.enter_ticket_code'));
      return;
    }
    setTicketSearchError('');
    setTicketSearchLoading(true);
    setSearchedTicket(null);
    try {
      const res = await apiClient.get('/tickets/search', { params: { q: query } });
      setSearchedTicket(res.data);
    } catch (e: any) {
      setTicketSearchError(e.response?.data?.error || t('betslip.ticket_not_found'));
    } finally {
      setTicketSearchLoading(false);
    }
  };

  const clearTicketSearch = () => {
    setTicketSearch('');
    setSearchedTicket(null);
    setTicketSearchError('');
  };

  const renderSearchedTicket = () => {
    if (!searchedTicket) return null;
    const ticket = searchedTicket;
    const statusClass = ticket.status === 'WON' ? 'text-accent-green' : ticket.status === 'LOST' ? 'text-accent-red' : 'text-accent-yellow';

    return (
      <div className="bg-primary rounded-lg border border-tertiary p-3 space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-text-secondary">{t('tickets.ticket_id')}: <span className="font-mono text-white">{ticket.id.slice(0, 8).toUpperCase()}</span></div>
            {ticket.bookingCode && (
              <div className="text-xs text-accent-blue font-mono font-bold mt-0.5">Code: {ticket.bookingCode}</div>
            )}
            {ticket.user?.username && (
              <div className="text-xs text-text-secondary mt-0.5">{t('admin.user')}: {ticket.user.username}</div>
            )}
          </div>
          <span className={`font-semibold text-xs ${statusClass}`}>{t(`tickets.${ticket.status.toLowerCase()}`)}</span>
        </div>

        <div className="space-y-1.5 border-t border-tertiary pt-2">
          {ticket.lines?.map((line: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">{line.matchName}</div>
                <div className="text-text-secondary">{line.marketName} - {line.outcomeName}</div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span className="text-accent-green font-bold">@{line.oddsAtPlacement?.toFixed(2)}</span>
                <div className="text-[10px] text-text-secondary">{line.status}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center border-t border-tertiary pt-2 text-xs">
          <div>
            <span className="text-text-secondary">{t('tickets.stake')}: </span>
            <span className="font-bold text-white">{ticket.stake?.toFixed(2)} Lëk</span>
          </div>
          <div className="text-right">
            <span className="text-text-secondary">{t('tickets.payout')}: </span>
            <span className="font-bold text-accent-yellow">{ticket.potentialPayout?.toFixed(2)} Lëk</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-secondary">
      <div className="flex bg-tertiary">
        {['SINGLE', 'COMBO', 'SYSTEM'].map(type => (
          <button 
            key={type}
            className={`flex-1 py-2 text-sm font-semibold ${ticketType === type ? 'bg-primary text-white' : 'text-text-secondary hover:text-white'}`}
            onClick={() => setTicketType(type as any)}
          >
            {t(`betslip.${type.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {/* Ticket Search Section */}
      <div className="p-3 border-b border-tertiary bg-primary/30">
        <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <TicketIcon size={14} className="text-accent-green" />
          {t('betslip.search_ticket')}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search size={14} className="text-text-secondary" />
            </div>
            <input
              type="text"
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchTicket()}
              placeholder={t('betslip.enter_ticket_code')}
              className="w-full bg-primary border border-tertiary rounded-lg pl-8 pr-2 py-2 text-xs text-white placeholder-text-secondary focus:outline-none focus:border-accent-green"
            />
          </div>
          <button
            onClick={handleSearchTicket}
            disabled={ticketSearchLoading}
            className="px-3 py-2 bg-accent-green hover:bg-emerald-600 text-primary rounded-lg text-xs font-bold transition disabled:opacity-50"
          >
            {ticketSearchLoading ? '...' : t('betslip.search')}
          </button>
          {(searchedTicket || ticketSearch) && (
            <button
              onClick={clearTicketSearch}
              className="p-2 bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white rounded-lg transition"
              title={t('common.cancel')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {ticketSearchError && (
          <div className="text-accent-red text-xs mt-2">{ticketSearchError}</div>
        )}
        {searchedTicket && (
          <div className="mt-3">
            {renderSearchedTicket()}
          </div>
        )}
      </div>

      {selections.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary p-4">
          {t('betslip.no_selections')}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {selections.map(s => (
              <div key={s.outcomeId} className="bg-primary p-3 rounded border border-tertiary relative group">
                <button onClick={() => removeSelection(s.outcomeId)} className="absolute top-2 right-2 text-text-secondary hover:text-accent-red">
                  <Trash2 size={16} />
                </button>
                <div className="text-xs text-text-secondary mb-1">{s.matchName}</div>
                <div className="text-sm font-semibold text-white">{s.marketName}</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-accent-green">{s.outcomeName}</span>
                  <span className="font-bold text-white">{s.odds.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {oddsChangedError && (
            <div className="bg-accent-yellow text-primary p-3 text-sm flex items-center justify-between">
              <div className="flex items-center gap-2"><AlertTriangle size={16}/> {t('betslip.odds_changed')}</div>
              <button onClick={() => setOddsChangedError(false)} className="font-bold underline">{t('betslip.accept_changes')}</button>
            </div>
          )}

          <div className="p-4 bg-tertiary space-y-4">
            {ticketType === 'SYSTEM' && (
              <div>
                <label className="text-xs text-text-secondary block mb-1">System Type</label>
                <select className="w-full bg-primary border border-secondary rounded p-2 text-white" value={systemType} onChange={e => setSystemType(e.target.value)}>
                   <option value="">Select System</option>
                   {Array.from({length: selections.length - 1}).map((_, i) => (
                     <option key={i} value={`${i+2}/${selections.length}`}>{i+2}/{selections.length}</option>
                   ))}
                </select>
              </div>
            )}

            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary">{t('betslip.total_odds')}:</span>
              <span className="font-bold text-white">
                {ticketType === 'COMBO' ? totalOdds.toFixed(2) : selections.length === 1 ? selections[0].odds.toFixed(2) : '-'}
              </span>
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-1">{t('betslip.stake')}</label>
              <input 
                type="number" 
                value={stake} 
                onChange={e => setStake(e.target.value)} 
                className="w-full bg-primary border border-secondary rounded p-2 text-white focus:outline-none focus:border-accent-green font-bold"
                min="1"
                step="1"
              />
              {stakeError && <div className="text-accent-red text-xs mt-1">{stakeError}</div>}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-text-secondary">{t('betslip.potential_payout')}:</span>
              <span className="font-bold text-accent-yellow text-lg">
                {potentialPayout.toFixed(2)} Lëk
              </span>
            </div>

            <div className="flex gap-2">
              {user ? (
                <button 
                  onClick={handlePlaceBet}
                  className="flex-1 bg-accent-green text-primary font-bold py-3 rounded hover:bg-green-400 transition"
                >
                  {t('betslip.place_bet')}
                </button>
              ) : (
                <button disabled className="flex-1 bg-tertiary text-text-secondary font-bold py-3 rounded cursor-not-allowed">
                  Login to Bet
                </button>
              )}
              <button 
                onClick={handleBook}
                className="flex-1 border border-accent-green text-accent-green font-bold py-3 rounded hover:bg-accent-green hover:text-primary transition"
              >
                {t('betslip.book_ticket')}
              </button>
            </div>
          </div>
        </>
      )}

      {showBookingModal && <BookingModal code={bookingCode} onClose={() => setShowBookingModal(false)} />}
    </div>
  );
}