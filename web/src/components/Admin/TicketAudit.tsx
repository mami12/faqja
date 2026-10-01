import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { ChevronDown, ChevronUp, Ticket as TicketIcon, CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react';

export default function TicketAudit() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/tickets');
      setTickets(res.data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRevertTicket = async (ticketId: string) => {
    if (!confirm('Revert this ticket? The stake will be refunded to the user.')) return;
    try {
      const res = await apiClient.post(`/admin/tickets/${ticketId}/revert`);
      alert(`Ticket reverted! ${res.data.refunded.toFixed(2)} Lëk refunded to user.`);
      fetchTickets();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to revert ticket');
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Ticket Audit & Bets Monitor</h2>
          <p className="text-text-secondary text-sm">Real-time audit log of all bet tickets placed across the platform</p>
        </div>
        <button 
          onClick={fetchTickets}
          className="px-4 py-2 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg text-sm font-semibold transition"
        >
          Refresh Bets
        </button>
      </div>

      <div className="bg-secondary rounded-xl border border-tertiary shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-secondary">Loading ticket records...</div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-text-secondary flex flex-col items-center gap-2">
            <TicketIcon size={32} className="opacity-30" />
            No tickets placed yet.
          </div>
        ) : (
          <div className="divide-y divide-tertiary">
            {tickets.map(t => {
              const isExpanded = expandedTicketId === t.id;
              return (
                <div key={t.id} className="p-4 hover:bg-primary/30 transition">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl flex items-center justify-center ${
                        t.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' :
                        t.status === 'LOST' ? 'bg-rose-500/20 text-rose-400' :
                        t.status === 'REVERTED' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {t.status === 'WON' && <CheckCircle2 size={20} />}
                        {t.status === 'LOST' && <XCircle size={20} />}
                        {t.status === 'REVERTED' && <RotateCcw size={20} />}
                        {t.status === 'PENDING' && <Clock size={20} />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-base">
                            Ticket #{t.id.substring(0, 8)}
                          </span>
                          {t.bookingCode && (
                            <span className="text-xs bg-accent-blue/20 text-accent-blue font-mono px-2 py-0.5 rounded font-bold">
                              Code: {t.bookingCode}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            t.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' :
                            t.status === 'LOST' ? 'bg-rose-500/20 text-rose-400' :
                            t.status === 'REVERTED' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {t.status}
                          </span>
                        </div>

                        <div className="text-xs text-text-secondary mt-1 flex items-center gap-3">
                          <span>User: <strong className="text-white">{t.user?.username || 'Guest (Booked)'}</strong></span>
                          <span>&bull;</span>
                          <span>Type: <strong className="text-accent-yellow uppercase">{t.ticketType}</strong></span>
                          <span>&bull;</span>
                          <span>Placed: {new Date(t.placedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6">
                      <div className="text-right">
                        <div className="text-xs text-text-secondary">Stake / Potential Payout</div>
                        <div className="text-sm font-bold text-white">
                          {t.stake.toFixed(2)} Lëk &rarr; <span className="text-accent-green text-base">{t.potentialPayout.toFixed(2)} Lëk</span>
                        </div>
                      </div>

                      {t.status === 'PENDING' && (
                        <button
                          onClick={() => handleRevertTicket(t.id)}
                          className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                          title="Revert ticket and refund stake"
                        >
                          <RotateCcw size={14} /> Revert
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                        className="p-2 bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white rounded-lg transition"
                        title="View Lines"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* EXPANDED LINES */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-tertiary/60 space-y-2">
                      <div className="text-xs font-bold uppercase text-text-secondary tracking-wider mb-2">
                        Selections ({t.lines?.length || 0})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {t.lines?.map((line: any) => (
                          <div key={line.id} className="bg-primary p-3 rounded-lg border border-tertiary flex justify-between items-center text-xs">
                            <div className="space-y-0.5">
                              <div className="text-text-secondary">{line.matchName}</div>
                              <div className="font-semibold text-white">
                                {line.marketName}: <span className="text-accent-green font-bold">{line.outcomeName}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-white px-2 py-0.5 bg-secondary rounded border border-tertiary">
                                {line.oddsAtPlacement?.toFixed(2) || line.odds?.toFixed(2)}
                              </span>
                              <div className="mt-1 font-bold text-[10px] uppercase">
                                <span className={
                                  line.status === 'WON' ? 'text-emerald-400' :
                                  line.status === 'LOST' ? 'text-rose-400' : 'text-amber-400'
                                }>
                                  {line.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
