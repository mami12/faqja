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
    const statusClass = isPending ? 'text-accent-yellow' : ticket.status === 'WON' ? 'text-accent-green' : 'text-accent-red';
    const totalStake = ticket.stake;
    const totalOdds = ticket.totalOdds;

    return (
      <div key={ticket.id} className="bg-secondary rounded-xl border border-tertiary p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="text-sm text-text-secondary">{t('tickets.ticket_id')}: <span className="font-mono text-white">{ticket.id.slice(0, 8).toUpperCase()}</span></div>
            <div className="text-xs text-text-secondary">{t('tickets.placed_at')}: {formatDate(ticket.placedAt)}</div>
          </div>
          <span className={`font-semibold text-sm ${statusClass}`}>{t(`tickets.${ticket.status.toLowerCase()}`)}</span>
        </div>

        <div className="space-y-2 border-t border-tertiary pt-3">
          {ticket.lines?.map((line, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">{line.matchName}</div>
                <div className="text-text-secondary text-xs">{line.marketName} - {line.outcomeName}</div>
              </div>
              <div className="text-right">
                <div className="text-accent-green font-bold">@{line.oddsAtPlacement.toFixed(2)}</div>
                <div className="text-xs text-text-secondary">{line.status}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center border-t border-tertiary pt-3">
          <div className="text-sm">
            <span className="text-text-secondary">{t('tickets.stake')}: </span>
            <span className="font-bold text-white">{totalStake.toFixed(2)} Lëk</span>
          </div>
          <div className="text-right">
            <div className="text-sm">
              <span className="text-text-secondary">{t('tickets.payout')}: </span>
              <span className="font-bold text-accent-yellow">{ticket.potentialPayout.toFixed(2)} Lëk</span>
            </div>
            <div className="text-xs text-text-secondary">{t('tickets.total_odds')}: {totalOdds.toFixed(2)}</div>
          </div>
        </div>

        {ticket.status === 'PENDING' && ticket.settledAt && (
          <div className="text-xs text-text-secondary">
            {t('tickets.settled_at')}: {formatDate(ticket.settledAt)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <Header />
      <div className="p-6 max-w-4xl mx-auto w-full flex-1">
        {!isAuthenticated ? (
          <div className="bg-secondary p-8 text-center text-text-secondary rounded border border-tertiary">
            <h2 className="text-xl font-bold text-white mb-2">{t('auth.login_title')}</h2>
            <p>{t('tickets.no_tickets_logged_out')}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-6 border-b border-tertiary">
              <button 
                onClick={() => { setActiveTab('active'); fetchTickets(); }}
                className={`py-2 px-4 font-semibold rounded-t-lg border-b-2 transition ${activeTab === 'active' ? 'border-accent-green text-white' : 'border-transparent text-text-secondary hover:text-white'}`}
              >
                {t('tickets.active_tickets')} {activeTickets.length > 0 && `(${activeTickets.length})`}
              </button>
              <button 
                onClick={() => { setActiveTab('history'); fetchTickets(); }}
                className={`py-2 px-4 font-semibold rounded-t-lg border-b-2 transition ${activeTab === 'history' ? 'border-accent-green text-white' : 'border-transparent text-text-secondary hover:text-white'}`}
              >
                {t('tickets.ticket_history')} {historyTickets.length > 0 && `(${historyTickets.length})`}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-accent-green border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : activeTab === 'active' ? (
              activeTickets.length === 0 ? (
                <div className="bg-secondary p-8 text-center text-text-secondary rounded border border-tertiary">
                  {t('tickets.no_active_tickets')}
                </div>
              ) : (
                <div className="space-y-4">
                  {activeTickets.map(renderTicket)}
                </div>
              )
            ) : (
              historyTickets.length === 0 ? (
                <div className="bg-secondary p-8 text-center text-text-secondary rounded border border-tertiary">
                  {t('tickets.no_history_tickets')}
                </div>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
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
