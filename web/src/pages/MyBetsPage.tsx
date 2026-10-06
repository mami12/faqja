import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { Ticket } from '../types';

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
    return new Date(dateStr).toLocaleString([], { 
      year: 'numeric', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  const renderTicket = (ticket: Ticket) => {
    const isPending = ticket.status === 'PENDING';
    const isWon = ticket.status === 'WON';
    const statusClass = isWon 
      ? 'bg-emerald-500/15 border border-emerald-500/30 text-accent-green' 
      : isPending 
      ? 'bg-amber-500/15 border border-amber-500/30 text-accent-yellow' 
      : 'bg-rose-500/15 border border-rose-500/30 text-accent-red';
    const totalStake = ticket.stake;
    const totalOdds = ticket.totalOdds;

    return (
      <div key={ticket.id} className="bg-secondary/90 rounded-2xl border border-tertiary/80 p-4 sm:p-5 space-y-3.5 shadow-sm hover:border-slate-600/70 transition">
        <div className="flex justify-between items-start gap-2">
          <div className="space-y-0.5">
            <div className="text-xs text-text-secondary">
              {t('tickets.ticket_id')}: <span className="font-mono text-white font-bold bg-primary/70 px-2 py-0.5 rounded border border-tertiary/60">{ticket.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="text-[11px] text-text-muted">{t('tickets.placed_at')}: {formatDate(ticket.placedAt)}</div>
          </div>
          <span className={`font-black text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider ${statusClass}`}>
            {t(`tickets.${ticket.status.toLowerCase()}`)}
          </span>
        </div>

        <div className="space-y-2.5 border-t border-tertiary/50 pt-3">
          {ticket.lines?.map((line, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-xs bg-primary/40 p-2.5 rounded-xl border border-tertiary/40">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white truncate text-xs sm:text-sm">{line.matchName}</div>
                <div className="text-text-secondary text-[11px] mt-0.5">{line.marketName} - <span className="text-accent-green font-semibold">{line.outcomeName}</span></div>
              </div>
              <div className="sm:text-right shrink-0 flex sm:flex-col justify-between items-baseline sm:items-end">
                <div className="text-white font-mono font-black text-xs sm:text-sm">@{line.oddsAtPlacement.toFixed(2)}</div>
                <div className="text-[10px] text-text-muted font-bold uppercase">{line.status}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center border-t border-tertiary/50 pt-3 text-xs">
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
      <div className="p-3 sm:p-6 max-w-4xl mx-auto w-full flex-1">
        {!isAuthenticated ? (
          <div className="bg-secondary/90 p-8 text-center text-text-secondary rounded-2xl border border-tertiary shadow-sm">
            <h2 className="text-xl font-bold text-white mb-2">{t('auth.login_title')}</h2>
            <p>{t('tickets.no_tickets_logged_out')}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-5 p-1 bg-secondary/80 rounded-2xl border border-tertiary/80 w-fit">
              <button 
                onClick={() => { setActiveTab('active'); fetchTickets(); }}
                className={`py-2 px-4 rounded-xl font-bold text-xs transition-all ${
                  activeTab === 'active' 
                    ? 'bg-accent-green text-primary shadow-sm' 
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('tickets.active_tickets')} {activeTickets.length > 0 && `(${activeTickets.length})`}
              </button>
              <button 
                onClick={() => { setActiveTab('history'); fetchTickets(); }}
                className={`py-2 px-4 rounded-xl font-bold text-xs transition-all ${
                  activeTab === 'history' 
                    ? 'bg-accent-green text-primary shadow-sm' 
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                {t('tickets.ticket_history')} {historyTickets.length > 0 && `(${historyTickets.length})`}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-3 border-accent-green border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : activeTab === 'active' ? (
              activeTickets.length === 0 ? (
                <div className="bg-secondary/60 p-10 text-center text-text-secondary rounded-2xl border border-tertiary space-y-2">
                  <div className="text-3xl">🎫</div>
                  <div className="font-bold text-white">{t('tickets.no_active_tickets')}</div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {activeTickets.map(renderTicket)}
                </div>
              )
            ) : (
              historyTickets.length === 0 ? (
                <div className="bg-secondary/60 p-10 text-center text-text-secondary rounded-2xl border border-tertiary space-y-2">
                  <div className="text-3xl">📜</div>
                  <div className="font-bold text-white">{t('tickets.no_history_tickets')}</div>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
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
