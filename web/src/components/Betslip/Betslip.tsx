import { useState } from 'react';
import { useBetslip } from '../../context/BetslipContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Trash2, AlertTriangle, Search, Ticket as TicketIcon, X, TrendingUp, TrendingDown, Check } from 'lucide-react';
import BookingModal from './BookingModal';
import TicketReceipt from './TicketReceipt';
import { apiClient } from '../../api/client';
import { Ticket } from '../../types';
import { formatTicketSelection, formatMarketSelectionLabel, translateOutcomeName } from '../../utils/sportsbookLabels';

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
    marketLine?: string;
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
  const [showTicketSearch, setShowTicketSearch] = useState(false);

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
          marketLine: foundSel?.marketLine,
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
                  {formatMarketSelectionLabel(line.marketName, line.marketLine ?? line.line, t)} - {formatTicketSelection(line.outcomeName, line.marketName, line.matchName, t)}
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
    <div className="flex h-full min-h-0 flex-col bg-secondary text-white">
      {/* Compact slip heading and ticket type. */}
      <div className="shrink-0 border-b border-tertiary bg-[#394758]">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wide">
            <TicketIcon size={15} className="text-accent-yellow"/>
            <span>{t('betslip.betslip')}</span>
            <span className="bg-[#17212c] px-1.5 py-0.5 font-mono text-[11px] text-accent-yellow" aria-label={`${selections.length} përzgjedhje`}>{selections.length}</span>
          </div>
          <button type="button" onClick={() => setShowTicketSearch(value => !value)}
            aria-expanded={showTicketSearch} className="flex items-center gap-1.5 text-[11px] text-slate-200 hover:text-white">
            <Search size={13}/>
            {t('betslip.search_ticket')}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[#24303d] bg-[#25303e] px-3 py-2">
          <select
            value={ticketType}
            onChange={e => setTicketType(e.target.value as 'SINGLE' | 'COMBO' | 'SYSTEM')}
            aria-label="Lloji i skedinës"
            className="max-w-[155px] border border-tertiary bg-[#394758] px-2 py-1 text-xs font-semibold text-white focus:outline-none focus:border-accent-yellow"
          >
            {(['SINGLE','COMBO','SYSTEM'] as const).map(type => (
              <option key={type} value={type}>{t(`betslip.${type.toLowerCase()}`)}</option>
            ))}
          </select>
          {selections.length > 0 && (
            <button type="button" onClick={clearAll} className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-rose-300">
              <Trash2 size={12}/> {t('common.clear_all')}
            </button>
          )}
        </div>
      </div>

      {showTicketSearch && (
        <div className="shrink-0 space-y-2 border-b border-tertiary bg-[#1d2835] p-3">
          <div className="flex gap-1">
            <label className="relative min-w-0 flex-1">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary"/>
              <input type="text" value={ticketSearch}
                onChange={e => setTicketSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchTicket()}
                placeholder={t('betslip.enter_ticket_code')}
                aria-label={t('betslip.enter_ticket_code')}
                className="w-full border border-tertiary bg-primary px-2 py-2 pl-8 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-yellow"/>
            </label>
            <button type="button" onClick={handleSearchTicket} disabled={ticketSearchLoading}
              className="bg-accent-yellow px-3 text-xs font-bold text-[#17212c] hover:brightness-110 disabled:opacity-50">
              {ticketSearchLoading ? '...' : t('betslip.search')}
            </button>
            {(ticketSearch || searchedTicket) && (
              <button type="button" onClick={clearTicketSearch} aria-label={t('common.cancel')}
                className="px-1.5 text-text-secondary hover:text-white"><X size={15}/></button>
            )}
          </div>
          {ticketSearchError && <div className="text-xs font-semibold text-rose-300">{ticketSearchError}</div>}
          {searchedTicket && <div className="max-h-[200px] overflow-y-auto">{renderSearchedTicket()}</div>}
        </div>
      )}

      {selections.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <TicketIcon size={25} strokeWidth={1.5} className="text-text-muted"/>
          <p className="text-xs font-semibold text-slate-200">{t('betslip.no_selections')}</p>
          <p className="max-w-[230px] text-[11px] leading-relaxed text-text-secondary">{t('betslip.select_odds_help')}</p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#1b2530]">
            {selections.map((s, index) => (
              <div key={s.outcomeId} className="border-b border-[#111923] bg-[#25303e] px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-semibold leading-snug text-white">
                      <span className="mr-1 text-[10px] text-text-muted">{index + 1}.</span>{s.matchName}
                    </p>
                    <p className="mt-1 break-words text-[11px] text-text-secondary">
                      {formatMarketSelectionLabel(s.marketName, s.marketLine, t)}
                      {' · '}
                      <span className="font-semibold text-slate-200">{translateOutcomeName(s.outcomeName, t, s.marketName, s.matchName)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <strong className="pt-0.5 font-mono text-sm font-bold tabular-nums text-accent-yellow">{s.odds.toFixed(2)}</strong>
                    <button type="button" onClick={() => removeSelection(s.outcomeId)}
                      title={t('betslip.remove_selection')} aria-label={t('betslip.remove_selection')}
                      className="p-0.5 text-text-secondary hover:text-rose-300"><X size={15}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {oddsChangedError && (
            <div className="shrink-0 flex items-center justify-between gap-2 border-t border-accent-yellow/30 bg-accent-yellow/10 px-3 py-2 text-xs text-amber-200">
              <span className="flex items-center gap-1.5"><AlertTriangle size={15}/>{t('betslip.odds_changed')}</span>
              <button type="button" onClick={() => setOddsChangedError(false)} className="font-bold underline">{t('betslip.accept_changes')}</button>
            </div>
          )}

          <div className="shrink-0 border-t border-tertiary bg-[#25303e]">
            <div className="space-y-2 px-3 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{t('betslip.total_odds')}:</span>
                <strong className="font-mono text-sm font-bold tabular-nums text-accent-yellow">
                  {ticketType === 'COMBO' ? totalOdds.toFixed(2) : selections.length === 1 ? selections[0].odds.toFixed(2) : '-'}
                </strong>
              </div>
              {ticketType === 'SYSTEM' && (
                <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
                  {t('betslip.system_type')}
                  <select value={systemType} onChange={e => setSystemType(e.target.value)}
                    className="max-w-[140px] border border-tertiary bg-[#17212c] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent-yellow">
                    <option value="">{t('betslip.select_system')}</option>
                    {Array.from({length: Math.max(0, selections.length - 1)}).map((_, i) => (
                      <option key={i} value={`${i+2}/${selections.length}`}>{i+2}/{selections.length}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex items-center justify-between gap-3 text-xs">
                <label htmlFor="betslip-stake" className="shrink-0 text-slate-300">{t('betslip.stake')}:</label>
                <div className="flex w-[155px] items-center border border-[#53657c] bg-[#17212c]">
                  <input id="betslip-stake" type="number" min="1" step="1" value={stake}
                    onChange={e => setStake(e.target.value)}
                    className="min-w-0 w-full bg-transparent px-2 py-1.5 text-right font-mono text-sm font-semibold text-white focus:outline-none"
                  />
                  <span className="shrink-0 pr-2 text-[10px] text-text-secondary">Lëk</span>
                </div>
              </div>
              {stakeError && <p role="alert" className="text-[11px] font-semibold text-rose-300">{stakeError}</p>}
              <div className="grid grid-cols-4 gap-1">
                {[100, 500, 1000, 5000].map(amount => (
                  <button type="button" key={amount} onClick={() => setStake(String(amount))}
                    className={`border border-tertiary py-1 text-[10px] font-semibold transition-colors ${Number(stake) === amount ? 'bg-[#465870] text-white' : 'bg-[#19232f] text-text-secondary hover:bg-[#394758] hover:text-white'}`}>
                    {amount >= 1000 ? `${amount / 1000}k` : amount}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-tertiary pt-2 text-xs">
                <span className="text-slate-300">{t('betslip.potential_payout')}:</span>
                <strong className="font-mono text-base font-bold tabular-nums text-accent-yellow">{potentialPayout.toFixed(2)} Lëk</strong>
              </div>
            </div>
            <div className="grid gap-px bg-[#111923] p-px">
              {user ? (
                <button type="button" onClick={handlePlaceBet}
                  className="bg-accent-yellow py-3 text-sm font-bold text-[#17212c] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                  {t('betslip.place_bet')}
                </button>
              ) : (
                <button disabled className="bg-tertiary/60 py-3 text-sm font-semibold text-text-muted">Login to Bet</button>
              )}
              <button type="button" onClick={handleBook}
                className="bg-[#394758] py-2 text-xs font-semibold text-white hover:bg-[#465870]">
                {t('betslip.book_ticket')}
              </button>
            </div>
          </div>
        </>
      )}

      {showBookingModal && <BookingModal code={bookingCode} onClose={() => setShowBookingModal(false)} />}
      {placedTicket && <TicketReceipt ticket={placedTicket} onClose={() => setPlacedTicket(null)} />}

      {/* Modal kur koeficienti ka ndryshuar */}
      {oddsChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-secondary border border-tertiary rounded-sm w-full max-w-md overflow-hidden shadow-2xl space-y-0">
            {/* Header */}
            <div className="bg-[#394758] border-b border-white/10 p-4 flex items-center gap-3">
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
                    <div className="text-xs font-bold text-accent-yellow truncate">
                      {formatMarketSelectionLabel(oddsChangeModal.marketName, oddsChangeModal.marketLine, t)} — {translateOutcomeName(oddsChangeModal.outcomeName, t, oddsChangeModal.marketName, oddsChangeModal.matchName)}
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
                  className="flex-1 py-2.5 px-4 rounded-xl bg-accent-yellow text-[#17212c] font-bold text-xs hover:brightness-105 active:scale-[0.99] transition flex items-center justify-center gap-1.5"
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
