import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { Ticket } from '../types';
import { Ticket as TicketIcon } from 'lucide-react';
import { formatTicketSelection, formatMarketSelectionLabel, translateTicketType } from '../utils/sportsbookLabels';

export default function MyBetsPage() {
  const { t } = useLanguage();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const [activeTickets, setActiveTickets] = useState<Ticket[]>([]);
  const [historyTickets, setHistoryTickets] = useState<Ticket[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTickets();
    }
  }, [isAuthenticated, activeTab]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const [activeRes, historyRes] = await Promise.all([
        apiClient.get('/bets/active'),
        apiClient.get('/bets/history')
      ]);
      setActiveTickets(activeRes.data);
      setHistoryTickets(historyRes.data);
    } catch (e) {
      console.error('Failed to fetch tickets:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('sq-AL', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit' 
    });
  };

  const renderTicket = (ticket: Ticket) => {
    const isPending = ticket.status === 'PENDING';
    const isWon = ticket.status === 'WON';
    const statusClass = isWon 
      ? 'bg-[#2d5844] text-emerald-200' 
      : isPending 
      ? 'bg-[#6c5426] text-amber-100' 
      : 'bg-[#60353e] text-rose-200';
    const totalStake = ticket.stake;
    const totalOdds = ticket.totalOdds;

    return (
      <div key={ticket.id} className="overflow-hidden border border-tertiary bg-secondary">
        <div className="flex justify-between items-start gap-2 bg-[#394758] px-3 py-2.5 sm:px-4">
          <div className="space-y-0.5">
            <div className="text-xs text-text-secondary">
              {t('tickets.ticket_id')}: <span className="font-mono text-white font-bold bg-[#25303e] px-1.5 py-0.5">{ticket.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="text-[11px] text-text-muted">{t('tickets.placed_at')}: {formatDate(ticket.placedAt)}</div>
            <div className="text-[11px] text-text-muted">Lloji: <span className="font-semibold text-slate-300">{translateTicketType(ticket.ticketType, t)}</span></div>
          </div>
          <span className={`font-bold text-[10px] px-2 py-1 uppercase tracking-wider ${statusClass}`}>
            {t(`tickets.${ticket.status.toLowerCase()}`)}
          </span>
        </div>

        <div className="border-t border-tertiary px-3 py-1 sm:px-4">
          {ticket.lines?.map((line, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 border-b border-tertiary/70 py-2 text-xs last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white break-words text-xs sm:text-sm" title={line.matchName}>{line.matchName}</div>
                <div className="text-text-secondary text-[11px] mt-0.5">
                  {formatMarketSelectionLabel(line.marketName, line.marketLine, t)} - <span className="text-slate-200 font-semibold">{formatTicketSelection(line.outcomeName, line.marketName, line.matchName, t)}</span>
                </div>
              </div>
              <div className="sm:text-right shrink-0 flex sm:flex-col justify-between items-baseline sm:items-end">
                <div className="text-accent-yellow font-mono font-bold text-xs sm:text-sm">@{line.oddsAtPlacement.toFixed(2)}</div>
                <div className="text-[10px] text-text-muted font-bold uppercase">{t(`tickets.${line.status.toLowerCase()}`)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center border-t border-tertiary bg-[#1c2733] px-3 py-3 text-xs sm:px-4">
          <div>
            <span className="text-text-secondary">{t('tickets.stake')}: </span>
            <span className="font-mono font-bold text-white">{totalStake.toFixed(2)} Lëk</span>
          </div>
          <div className="text-right">
            <div>
              <span className="text-text-secondary">{t('tickets.payout')}: </span>
              <span className="font-mono font-black text-accent-yellow text-sm">{ticket.potentialPayout.toFixed(2)} Lëk</span>
            </div>
            <div className="text-[11px] text-text-muted font-mono">{t('tickets.total_odds')}: @{totalOdds.toFixed(2)}</div>
          </div>
        </div>

        {ticket.status === 'PENDING' && ticket.settledAt && (
          <div className="text-[11px] text-text-muted">
            {t('tickets.settled_at')}: {formatDate(ticket.settledAt)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-primary flex flex-col">
      <Header />
      <div className="p-3 sm:p-6 max-w-5xl mx-auto w-full flex-1">
        {!isAuthenticated ? (
          <div className="bg-secondary p-8 text-center text-text-secondary border border-tertiary">
            <h2 className="text-xl font-bold text-white mb-2">{t('auth.login_title')}</h2>
            <p>{t('tickets.no_tickets_logged_out')}</p>
          </div>
        ) : (
          <>
            <header className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#394758] text-accent-yellow">
                <TicketIcon size={19} />
              </div>
              <div>
                <h1 className="text-lg font-black text-white">{t('nav.myBets')}</h1>
                <p className="text-xs text-text-secondary">Biletat aktive dhe historiku yt</p>
              </div>
            </header>
            <div className="flex gap-px mb-4 bg-tertiary border border-tertiary w-fit max-w-full">
              <button 
                onClick={() => setActiveTab('active')}
                className={`py-2.5 px-4 font-semibold text-xs transition-colors ${
                  activeTab === 'active' 
                    ? 'bg-accent-yellow text-[#17212c]' 
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('tickets.active_tickets')} {activeTickets.length > 0 && `(${activeTickets.length})`}
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`py-2.5 px-4 font-semibold text-xs transition-colors ${
                  activeTab === 'history' 
                    ? 'bg-accent-yellow text-[#17212c]' 
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('tickets.ticket_history')} {historyTickets.length > 0 && `(${historyTickets.length})`}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-accent-yellow border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : activeTab === 'active' ? (
              activeTickets.length === 0 ? (
                <div className="bg-secondary p-10 text-center text-text-secondary border border-tertiary space-y-2">
                  <TicketIcon size={28} className="mx-auto text-text-secondary"/>
                  <div className="font-bold text-white">{t('tickets.no_active_tickets')}</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeTickets.map(renderTicket)}
                </div>
              )
            ) : (
              historyTickets.length === 0 ? (
                <div className="bg-secondary p-10 text-center text-text-secondary border border-tertiary space-y-2">
                  <TicketIcon size={28} className="mx-auto text-text-secondary"/>
                  <div className="font-bold text-white">{t('tickets.no_history_tickets')}</div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                  {historyTickets.map(renderTicket)}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
