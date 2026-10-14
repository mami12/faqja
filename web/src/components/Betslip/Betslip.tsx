import { useState } from 'react';
import { useBetslip } from '../../context/BetslipContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Trash2, AlertTriangle, Search, Ticket as TicketIcon, X, TrendingUp, TrendingDown, Check } from 'lucide-react';
import BookingModal from './BookingModal';
import TicketReceipt from './TicketReceipt';
import { apiClient } from '../../api/client';
import { Ticket } from '../../types';
import { formatTicketSelection, translateMarketName, translateOutcomeName } from '../../utils/sportsbookLabels';

export default function Betslip() {
  const { 
    selections, stake, setStake, ticketType, setTicketType, systemType, setSystemType, 
    removeSelection, clearAll, updateOdds, totalOdds, potentialPayout, placeBet, bookTicket 
  } = useBetslip();
  const { t } = useLanguage();
  const { user, refreshUser } = useAuth();
  
  const [oddsChangedError, setOddsChangedError] = useState(false);
  const [oddsChangeModal, setOddsChangeModal] = useState<{
    outcomeId: string;
    oldOdds: number;
    newOdds: number;
    outcomeName: string;
    marketName: string;
    matchName: string;
  } | null>(null);
  const [bookingCode, setBookingCode] = useState('');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [placedTicket, setPlacedTicket] = useState<Ticket | null>(null);
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
      const ticket = await placeBet(() => refreshUser());
      setPlacedTicket(ticket);
      clearAll();
    } catch (e: any) {
      const errData = e.response?.data;
      if (errData?.code === 'ODDS_CHANGED' || errData?.message?.includes('ndryshuar') || errData?.message === 'Odds have changed') {
        const foundSel = errData?.outcomeId ? selections.find(s => s.outcomeId === errData.outcomeId) : selections[0];
        setOddsChangeModal({
          outcomeId: errData?.outcomeId || foundSel?.outcomeId || '',
          oldOdds: Number(errData?.oldOdds) || foundSel?.odds || 1.0,
          newOdds: Number(errData?.newOdds) || foundSel?.odds || 1.0,
          outcomeName: errData?.outcomeName || foundSel?.outcomeName || '',
          marketName: errData?.marketName || foundSel?.marketName || '',
          matchName: errData?.matchName || foundSel?.matchName || '',
        });
      } else {
        alert(errData?.message || e.message || t('common.error'));
      }
    }
  };

  const handleAcceptOddsChange = () => {
    if (oddsChangeModal && oddsChangeModal.outcomeId) {
      updateOdds(oddsChangeModal.outcomeId, oddsChangeModal.newOdds);
    }
    setOddsChangeModal(null);
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
              <div className="text-xs text-accent-blue font-mono font-bold mt-0.5">{t('admin.code')}: {ticket.bookingCode}</div>
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
                <div className="text-text-secondary">
                  {translateMarketName(line.marketName, t)}
                  {line.line && !translateMarketName(line.marketName, t).includes(String(line.line)) ? ` (${line.line})` : ''} - {formatTicketSelection(line.outcomeName, line.marketName, line.matchName, t)}
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span className="text-accent-green font-bold">@{line.oddsAtPlacement?.toFixed(2)}</span>
                <div className="text-[10px] text-text-secondary">{t(`tickets.${line.status.toLowerCase()}`)}</div>
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
    <div className="flex flex-col h-full min-h-0 bg-secondary select-none">
      {/* Bet slip header and ticket type */}
      <div className="shrink-0 border-b border-white/10 bg-card-bg p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TicketIcon size={15} className="text-accent-green" />
            <span className="text-xs font-black uppercase tracking-[0.12em] text-white">
              {t('betslip.betslip')}
            </span>
            <span className="rounded-full border border-accent-green/25 bg-accent-green/10 px-2 py-0.5 text-[10px] font-black tabular-nums text-accent-green">
              {selections.length}
            </span>
          </div>
          {selections.length > 0 && (
            <button
              onClick={clearAll}
              aria-label={t('common.clear_all')}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-text-secondary transition hover:bg-accent-red/10 hover:text-accent-red"
            >
              <Trash2 size={11} />
              {t('common.clear_all')}
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-white/10 bg-primary/80 p-1">
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
      <div className="shrink-0 p-3 border-b border-white/10 bg-[#151f26]">
        <div className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TicketIcon size={13} className="text-accent-green" />
            <span>{t('betslip.search_ticket')}</span>
          </div>
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
              className="w-full bg-primary/90 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder-text-secondary/60 focus:outline-none focus:border-accent-green transition"
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
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-text-secondary p-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/60 border border-tertiary/60 flex items-center justify-center text-text-muted">
            <TicketIcon size={24} />
          </div>
          <div className="font-bold text-white text-sm">{t('betslip.no_selections')}</div>
          <p className="text-xs text-text-secondary/80 max-w-[200px]">
            {t('betslip.select_odds_help')}
          </p>
        </div>
      ) : (
        <>
          {/* Lista e seleksioneve — scroll-on vetëm kjo pjesë */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2.5 space-y-2">
            {selections.map(s => (
              <div 
                key={s.outcomeId} 
                className="relative space-y-2 rounded-lg border border-white/10 bg-primary/75 p-3 shadow-sm transition hover:border-accent-green/30"
              >
                <button 
                  onClick={() => removeSelection(s.outcomeId)} 
                  className="absolute top-2.5 right-2.5 p-1 rounded-md text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition"
                  title={t('betslip.remove_selection')}
                >
                  <Trash2 size={14} />
                </button>
                <div className="truncate pr-6 text-[11px] font-semibold text-text-secondary" title={s.matchName}>
                  {s.matchName}
                </div>
                <div className="text-xs font-bold text-white flex items-center flex-wrap gap-1.5" title={`${s.marketName}${s.marketLine ? ` · ${s.marketLine}` : ''}`}>
                  <span>{translateMarketName(s.marketName, t)}</span>
                  {s.marketLine && !translateMarketName(s.marketName, t).includes(String(s.marketLine)) && (
                    <span className="rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 text-[10px] font-mono font-black">
                      {String(s.marketLine).match(/^\d+$/) ? `Min ${s.marketLine}'` : s.marketLine}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-tertiary/40">
                  <span className="rounded-md border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 text-xs font-bold text-accent-green">
                    {translateOutcomeName(s.outcomeName, t, s.marketName)}
                  </span>
                  <span className="font-mono text-sm font-black tabular-nums text-white">
                    @{s.odds.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {oddsChangedError && (
            <div className="shrink-0 bg-accent-yellow/15 border-y border-accent-yellow/40 text-amber-200 p-3 text-xs flex items-center justify-between gap-2">
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

          {/* Stake & Calculations Footer — gjithmonë i dukshëm */}
          <div className="shrink-0 border-t border-white/10 bg-card-bg p-3.5 shadow-2xl">
            <div className="mb-3 rounded-lg border border-accent-green/15 bg-primary/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text-secondary">{t('betslip.total_odds')}:</span>
                <span className="font-mono text-sm font-black tabular-nums text-white">
                  {ticketType === 'COMBO' ? totalOdds.toFixed(2) : selections.length === 1 ? selections[0].odds.toFixed(2) : '-'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2">
                <span className="text-xs font-medium text-text-secondary">{t('betslip.potential_payout')}:</span>
                <span className="font-mono text-base font-black tabular-nums text-accent-yellow">
                  {potentialPayout.toFixed(2)} <span className="text-xs font-bold text-amber-300">Lëk</span>
                </span>
              </div>
            </div>
            <div className="space-y-3">
            {ticketType === 'SYSTEM' && (
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary block mb-1">{t('betslip.system_type')}</label>
                <select 
                  className="w-full bg-primary/90 border border-tertiary rounded-lg p-2 text-xs text-white focus:outline-none focus:border-accent-green" 
                  value={systemType} 
                  onChange={e => setSystemType(e.target.value)}
                >
                   <option value="">{t('betslip.select_system')}</option>
                   {Array.from({length: selections.length - 1}).map((_, i) => (
                     <option key={i} value={`${i+2}/${selections.length}`}>{i+2}/{selections.length}</option>
                   ))}
                </select>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] uppercase font-bold text-text-secondary">{t('betslip.stake')}</label>
                <span className="text-[10px] text-text-secondary font-mono">{t('betslip.min_stake')}</span>
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
          </div>
        </>
      )}

      {showBookingModal && <BookingModal code={bookingCode} onClose={() => setShowBookingModal(false)} />}
      {placedTicket && <TicketReceipt ticket={placedTicket} onClose={() => setPlacedTicket(null)} />}

      {/* Modal kur koeficienti ka ndryshuar */}
      {oddsChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-secondary border border-accent-yellow/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-0">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500/20 to-accent-yellow/10 border-b border-white/10 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-yellow/20 border border-accent-yellow/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-accent-yellow" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-black text-white">Koeficienti ka Ndryshuar!</h3>
                <p className="text-xs text-text-secondary truncate">
                  Koeficienti ka lëvizur gjatë vendosjes së bastit.
                </p>
              </div>
              <button 
                onClick={() => setOddsChangeModal(null)} 
                className="text-text-secondary hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Table */}
            <div className="p-4 space-y-4">
              <div className="bg-primary/90 rounded-xl border border-tertiary overflow-hidden shadow-inner">
                <div className="p-3 border-b border-tertiary/60 bg-tertiary/20">
                  <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Ndeshja</div>
                  <div className="text-xs sm:text-sm font-black text-white truncate">{oddsChangeModal.matchName || 'Ndeshje'}</div>
                </div>

                <div className="p-3 border-b border-tertiary/60 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] text-text-secondary font-bold uppercase">Tregu & Zgjedhja</div>
                    <div className="text-xs font-bold text-accent-green truncate">
                      {translateMarketName(oddsChangeModal.marketName, t)} — {translateOutcomeName(oddsChangeModal.outcomeName, t, oddsChangeModal.marketName)}
                    </div>
                  </div>
                  {oddsChangeModal.newOdds >= oddsChangeModal.oldOdds ? (
                    <span className="shrink-0 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp size={12} /> Rritje
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingDown size={12} /> Rënie
                    </span>
                  )}
                </div>

                {/* Odds comparison row */}
                <div className="grid grid-cols-2 divide-x divide-tertiary/60 p-3 bg-primary/40 text-center">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-text-secondary">Koeficienti i vjetër</div>
                    <div className="text-base font-mono font-bold text-rose-400 line-through mt-0.5">
                      @{oddsChangeModal.oldOdds.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-text-secondary">Koeficienti i ri</div>
                    <div className="text-base font-mono font-black text-accent-green mt-0.5">
                      @{oddsChangeModal.newOdds.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-text-secondary text-center leading-relaxed">
                Shtypni butonin <span className="text-white font-bold">OK</span> për të rifreskuar automatikisht koeficientin e ri në biletën tuaj dhe për të rillogaritur fitimin e mundshëm.
              </p>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOddsChangeModal(null)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-tertiary/60 hover:bg-tertiary text-text-secondary hover:text-white font-bold text-xs transition"
                >
                  Anulo
                </button>
                <button
                  type="button"
                  onClick={handleAcceptOddsChange}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-accent-green text-primary font-black text-xs shadow-glow-green hover:brightness-105 active:scale-[0.99] transition flex items-center justify-center gap-1.5"
                >
                  <Check size={16} /> OK — Përditëso Biletën
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
