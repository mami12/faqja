import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, Edit3, Lock, Unlock, PlayCircle } from 'lucide-react';

export default function MatchControl() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  
  // Settle Modal State
  const [settleMatch, setSettleMatch] = useState<any | null>(null);
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');

  // Odds Edit Modal State
  const [editOutcome, setEditOutcome] = useState<any | null>(null);
  const [newOdds, setNewOdds] = useState('');

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/matches');
      setMatches(res.data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleToggleMatchSuspend = async (matchId: string, currentSuspended: boolean) => {
    try {
      await apiClient.patch(`/admin/matches/${matchId}/suspend`, {
        isSuspended: !currentSuspended
      });
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to update match status');
    }
  };

  const handleToggleMarketSuspend = async (marketId: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await apiClient.patch(`/admin/markets/${marketId}/suspend`, {
        status: nextStatus
      });
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to update market status');
    }
  };

  const handleSaveOdds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOutcome || !newOdds) return;
    try {
      await apiClient.patch(`/admin/outcomes/${editOutcome.id}/odds`, {
        odds: parseFloat(newOdds)
      });
      setEditOutcome(null);
      setNewOdds('');
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to update odds');
    }
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleMatch) return;
    try {
      await apiClient.post(`/admin/matches/${settleMatch.id}/settle`, {
        homeScore: parseInt(homeScore) || 0,
        awayScore: parseInt(awayScore) || 0
      });
      setSettleMatch(null);
      setHomeScore('0');
      setAwayScore('0');
      fetchMatches();
      alert('Match settled and winning tickets paid out successfully!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Settlement failed');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Match & Odds Management</h2>
          <p className="text-text-secondary text-sm">Control live odds, suspend betting on specific fixtures, or settle final scores</p>
        </div>
        <button 
          onClick={fetchMatches}
          className="px-4 py-2 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg text-sm font-semibold transition"
        >
          Refresh Fixtures
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-text-secondary bg-secondary rounded-xl border border-tertiary">
          Loading matches...
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map(m => {
            const isExpanded = expandedMatchId === m.id;
            return (
              <div key={m.id} className="bg-secondary rounded-xl border border-tertiary shadow-lg overflow-hidden transition">
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        m.status === 'LIVE' ? 'bg-accent-red text-white animate-pulse' :
                        m.status === 'ENDED' ? 'bg-tertiary text-text-secondary' : 'bg-accent-blue/20 text-accent-blue'
                      }`}>
                        {m.status} {m.status === 'LIVE' ? `${m.currentMinute || 0}'` : ''}
                      </span>
                      <span className="text-xs text-text-secondary font-medium">
                        {m.tournament?.name || 'League'} &bull; {new Date(m.startTime).toLocaleString()}
                      </span>
                      {m.isSuspended && (
                        <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                          <Lock size={12} /> Odds Suspended
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-bold text-white flex items-center gap-3">
                      <span>{m.homeTeam}</span>
                      <span className="px-2.5 py-0.5 bg-primary rounded text-accent-yellow font-black">
                        {m.homeScore ?? 0} - {m.awayScore ?? 0}
                      </span>
                      <span>{m.awayTeam}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button 
                      onClick={() => handleToggleMatchSuspend(m.id, m.isSuspended)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                        m.isSuspended 
                          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400' 
                          : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'
                      }`}
                    >
                      {m.isSuspended ? <Unlock size={14} /> : <Lock size={14} />}
                      {m.isSuspended ? 'Unlock Match Odds' : 'Suspend Match Odds'}
                    </button>

                    {m.status !== 'ENDED' && (
                      <button 
                        onClick={() => { setSettleMatch(m); setHomeScore(String(m.homeScore || 0)); setAwayScore(String(m.awayScore || 0)); }}
                        className="px-3.5 py-2 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-xs flex items-center gap-1.5 transition"
                      >
                        <CheckCircle2 size={14} /> Settle Score
                      </button>
                    )}

                    <button 
                      onClick={() => setExpandedMatchId(isExpanded ? null : m.id)}
                      className="p-2 bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white rounded-lg transition"
                      title="View & Edit Markets"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* EXPANDED MARKETS VIEW */}
                {isExpanded && (
                  <div className="p-5 bg-primary/50 border-t border-tertiary/60 space-y-4">
                    <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      Markets & Odds Control ({m.markets?.length || 0} markets)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {m.markets?.map((mk: any) => (
                        <div key={mk.id} className="bg-secondary p-3.5 rounded-lg border border-tertiary/80">
                          <div className="flex justify-between items-center mb-2.5">
                            <span className="text-sm font-bold text-white flex items-center gap-1.5">
                              {mk.name}
                              {mk.status === 'SUSPENDED' && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold">
                                  Suspended
                                </span>
                              )}
                            </span>
                            <button 
                              onClick={() => handleToggleMarketSuspend(mk.id, mk.status)}
                              className="text-xs text-text-secondary hover:text-white font-semibold underline"
                            >
                              {mk.status === 'ACTIVE' ? 'Suspend Market' : 'Activate Market'}
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {mk.outcomes?.map((oc: any) => (
                              <button
                                key={oc.id}
                                onClick={() => { setEditOutcome(oc); setNewOdds(String(oc.odds)); }}
                                className="bg-primary/80 hover:bg-primary border border-tertiary/60 p-2 rounded flex flex-col items-center justify-center group transition"
                              >
                                <span className="text-xs text-text-secondary group-hover:text-white">{oc.name}</span>
                                <span className="text-sm font-bold text-accent-green flex items-center gap-1">
                                  {oc.odds.toFixed(2)}
                                  <Edit3 size={11} className="opacity-0 group-hover:opacity-100 text-text-secondary" />
                                </span>
                              </button>
                            ))}
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

      {/* SETTLE SCORE MODAL */}
      {settleMatch && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Settle Match & Pay Tickets</h3>
            <p className="text-xs text-text-secondary mb-6">
              Enter final score for <strong className="text-white">{settleMatch.homeTeam} vs {settleMatch.awayTeam}</strong>. All winning bets will be credited immediately.
            </p>
            <form onSubmit={handleSettleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-1.5">{settleMatch.homeTeam}</label>
                  <input 
                    type="number" 
                    value={homeScore} 
                    onChange={e => setHomeScore(e.target.value)}
                    min="0"
                    required
                    className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white text-center text-2xl font-bold focus:outline-none focus:border-accent-green"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-1.5">{settleMatch.awayTeam}</label>
                  <input 
                    type="number" 
                    value={awayScore} 
                    onChange={e => setAwayScore(e.target.value)}
                    min="0"
                    required
                    className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white text-center text-2xl font-bold focus:outline-none focus:border-accent-green"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setSettleMatch(null)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-sm transition shadow-lg shadow-accent-green/20"
                >
                  Confirm Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ODDS MODAL */}
      {editOutcome && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-xs w-full p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Edit Odds Value</h3>
            <p className="text-xs text-text-secondary mb-4">
              Selection: <strong className="text-white">{editOutcome.name}</strong>
            </p>
            <form onSubmit={handleSaveOdds} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">Odds (Decimal)</label>
                <input 
                  type="number" 
                  value={newOdds} 
                  onChange={e => setNewOdds(e.target.value)}
                  step="0.01"
                  min="1.01"
                  required
                  autoFocus
                  className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-lg font-bold focus:outline-none focus:border-accent-green"
                />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setEditOutcome(null)}
                  className="flex-1 py-2 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-xs"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-xs"
                >
                  Save Odds
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
