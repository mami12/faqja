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
    <div className="flex flex-col h-full bg-secondary select-none">
      {/* Ticket Type Segmented Control */}
      <div className="p-2.5 bg-secondary border-b border-tertiary/70">
        <div className="flex bg-primary/80 p-1 rounded-xl border border-tertiary/60">
          {['SINGLE', 'COMBO', 'SYSTEM'].map(type => (
            <button 
              key={type}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                ticketType === type 
                  ? 'bg-gradient-to-r from-emerald-600 to-accent-green text-primary shadow-sm' 
                  : 'text-text-secondary hover:text-white hover:bg-tertiary/40'
              }`}
              onClick={() => setTicketType(type as any)}
            >
              {t(`betslip.${type.toLowerCase()}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket Search Section */}
      <div className="p-3 border-b border-tertiary/70 bg-primary/40">
        <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TicketIcon size={13} className="text-accent-green" />
            <span>{t('betslip.search_ticket')}</span>
          </div>
          {selections.length > 0 && (
            <button
              onClick={clearAll}
              className="text-text-secondary hover:text-accent-red flex items-center gap-1 text-[10px] font-bold transition"
            >
              <Trash2 size={11} /> {t('common.clear_all')}
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search size={13} className="text-text-secondary" />
            </div>
            <input
              type="text"
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchTicket()}
              placeholder={t('betslip.enter_ticket_code')}
              className="w-full bg-primary/90 border border-tertiary/80 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder-text-secondary/60 focus:outline-none focus:border-accent-green transition"
            />
          </div>
          <button
            onClick={handleSearchTicket}
            disabled={ticketSearchLoading}
            className="px-3 py-1.5 bg-accent-green hover:bg-emerald-500 text-primary rounded-lg text-xs font-bold transition disabled:opacity-50"
          >
            {ticketSearchLoading ? '...' : t('betslip.search')}
          </button>
          {(searchedTicket || ticketSearch) && (
            <button
              onClick={clearTicketSearch}
              className="p-1.5 bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white rounded-lg transition"
              title={t('common.cancel')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {ticketSearchError && (
          <div className="text-accent-red text-[11px] mt-1.5 font-semibold">{ticketSearchError}</div>
        )}
        {searchedTicket && (
          <div className="mt-2.5">
            {renderSearchedTicket()}
          </div>
        )}
      </div>

      {selections.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-secondary p-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/60 border border-tertiary/60 flex items-center justify-center text-text-muted">
            <TicketIcon size={24} />
          </div>
          <div className="font-bold text-white text-sm">{t('betslip.no_selections')}</div>
          <p className="text-xs text-text-secondary/80 max-w-[200px]">
            Click on any odds to add selections to your betslip.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {selections.map(s => (
              <div 
                key={s.outcomeId} 
                className="bg-primary/80 p-3 rounded-xl border border-tertiary/80 hover:border-slate-600/60 relative group transition shadow-sm space-y-1.5"
              >
                <button 
                  onClick={() => removeSelection(s.outcomeId)} 
                  className="absolute top-2.5 right-2.5 p-1 rounded-md text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition"
                  title="Remove selection"
                >
                  <Trash2 size={14} />
                </button>
                <div className="text-[11px] text-text-secondary font-medium pr-6 truncate">{s.matchName}</div>
                <div className="text-xs font-bold text-white">{s.marketName}</div>
                <div className="flex justify-between items-center pt-1 border-t border-tertiary/40">
                  <span className="text-xs font-bold text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-md border border-accent-green/20">
                    {s.outcomeName}
                  </span>
                  <span className="font-mono font-black text-sm text-white tabular-nums">
                    @{s.odds.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {oddsChangedError && (
            <div className="bg-accent-yellow/15 border-y border-accent-yellow/40 text-amber-200 p-3 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={15} className="text-accent-yellow shrink-0" />
                <span>{t('betslip.odds_changed')}</span>
              </div>
              <button 
                onClick={() => setOddsChangedError(false)} 
                className="font-bold underline text-accent-yellow hover:text-white shrink-0"
              >
                {t('betslip.accept_changes')}
              </button>
            </div>
          )}

          {/* Stake & Calculations Footer */}
          <div className="p-3.5 bg-secondary/95 border-t border-tertiary/80 space-y-3 shadow-2xl">
            {ticketType === 'SYSTEM' && (
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary block mb-1">System Type</label>
                <select 
                  className="w-full bg-primary/90 border border-tertiary rounded-lg p-2 text-xs text-white focus:outline-none focus:border-accent-green" 
                  value={systemType} 
                  onChange={e => setSystemType(e.target.value)}
                >
                   <option value="">Select System</option>
                   {Array.from({length: selections.length - 1}).map((_, i) => (
                     <option key={i} value={`${i+2}/${selections.length}`}>{i+2}/{selections.length}</option>
                   ))}
                </select>
              </div>
            )}

            <div className="flex justify-between items-center text-xs">
              <span className="text-text-secondary font-medium">{t('betslip.total_odds')}:</span>
              <span className="font-mono font-black text-sm text-white tabular-nums">
                {ticketType === 'COMBO' ? totalOdds.toFixed(2) : selections.length === 1 ? selections[0].odds.toFixed(2) : '-'}
              </span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] uppercase font-bold text-text-secondary">{t('betslip.stake')}</label>
                <span className="text-[10px] text-text-secondary font-mono">Min 1 Lëk</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  value={stake} 
                  onChange={e => setStake(e.target.value)} 
                  className="w-full bg-primary/90 border border-tertiary rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-green font-mono font-black"
                  min="1"
                  step="1"
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-text-secondary pointer-events-none">
                  Lëk
                </span>
              </div>
              {stakeError && <div className="text-accent-red text-[11px] font-semibold mt-1">{stakeError}</div>}
            </div>

            {/* Quick Stake Pills */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
              {[100, 200, 500, 1000, 2500, 5000].map(amount => (
                <button
                  key={amount}
                  onClick={() => setStake(String(amount))}
                  className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                    Number(stake) === amount
                      ? 'bg-accent-green text-primary font-black shadow-sm'
                      : 'bg-primary/70 text-text-secondary hover:text-white hover:bg-tertiary border border-tertiary/60'
                  }`}
                >
                  +{amount >= 1000 ? `${amount / 1000}k` : amount}
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-tertiary/50">
              <span className="text-xs text-text-secondary font-medium">{t('betslip.potential_payout')}:</span>
              <span className="font-mono font-black text-accent-yellow text-base tabular-nums">
                {potentialPayout.toFixed(2)} <span className="text-xs font-bold text-amber-300">Lëk</span>
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              {user ? (
                <button 
                  onClick={handlePlaceBet}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-accent-green text-primary font-black py-2.5 rounded-xl shadow-glow-green hover:brightness-105 active:scale-[0.99] transition text-xs tracking-wide"
                >
                  {t('betslip.place_bet')}
                </button>
              ) : (
                <button disabled className="flex-1 bg-tertiary/50 text-text-muted font-bold py-2.5 rounded-xl text-xs cursor-not-allowed">
                  Login to Bet
                </button>
              )}
              <button 
                onClick={handleBook}
                className="px-3.5 border border-accent-green/60 hover:border-accent-green text-accent-green font-bold py-2.5 rounded-xl hover:bg-accent-green/10 transition text-xs whitespace-nowrap"
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