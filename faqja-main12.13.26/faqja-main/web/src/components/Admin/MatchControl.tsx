import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, Edit3, Lock, Unlock, PlayCircle } from 'lucide-react';
import { translateMarketName, translateOutcomeName } from '../../utils/sportsbookLabels';
import { useLanguage } from '../../context/LanguageContext';

export default function MatchControl() {
  const { t } = useLanguage();
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
      setMatches(res.data.items || []);
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
      alert(e.response?.data?.error || 'Përditësimi i statusit të ndeshjes dështoi.');
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
      alert(e.response?.data?.error || 'Përditësimi i statusit të tregut dështoi.');
    }
  };

  const handleToggleOutcomeSuspend = async (outcomeId: string, currentStatus: string) => {
    try {
      await apiClient.patch(`/admin/outcomes/${outcomeId}/suspend`, {
        status: currentStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
      });
      fetchMatches();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Përditësimi i statusit të zgjedhjes dështoi.');
    }
  };

  const adjustOutcomes = async (outcomes: any[], percentage: number) => {
    const eligible = outcomes.filter((outcome) => Number(outcome.odds) > 1);
    const updates = eligible.map((outcome) => {
      const odds = Number((Number(outcome.odds) * (1 + percentage / 100)).toFixed(3));
      if (odds <= 1) return Promise.reject(new Error(`Adjustment would make ${outcome.name} odds invalid`));
      return apiClient.patch(`/admin/outcomes/${outcome.id}/odds`, { odds });
    });
    const results = await Promise.allSettled(updates);
    await fetchMatches();
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed)     alert(`${failed} nga ${updates.length} ndryshime të kuotave dështuan. Ndryshimet e tjera u ruajtën.`);
  };

  const percentButtons = (outcomes: any[], compact = false) => (
    <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : ''}`}>
      {[-10, -5, 5, 10].map((percent) => (
        <button
          key={percent}
          onClick={() => adjustOutcomes(outcomes, percent)}
          className="px-1.5 py-1 rounded bg-tertiary hover:bg-accent-blue/20 text-text-secondary hover:text-white text-[10px] font-bold"
          title={`Ndrysho kuotat me ${percent}%`}
        >
          {percent > 0 ? '+' : ''}{percent}%
        </button>
      ))}
      <button
        onClick={() => {
          const value = window.prompt('Vendos përqindjen e ndryshimit (p.sh. 12 ose -8):');
          if (value === null) return;
          const percent = Number(value);
          if (!Number.isFinite(percent) || percent <= -100 || percent === 0) {
            alert('Përqindja duhet të jetë numër më i madh se -100 dhe jo zero.');
            return;
          }
          adjustOutcomes(outcomes, percent);
        }}
        className="px-1.5 py-1 rounded bg-accent-blue/15 hover:bg-accent-blue/25 text-accent-blue text-[10px] font-bold"
      >
        Rregullo %
      </button>
    </div>
  );

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
      alert(e.response?.data?.error || 'Përditësimi i kuotës dështoi.');
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
      alert('Ndeshja u mbyll dhe fitimet e skedinave fituese u paguan.');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Mbyllja e ndeshjes dështoi.');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Menaxhimi i ndeshjeve dhe kuotave</h2>
          <p className="text-text-secondary text-sm">Kontrolloni kuotat, pezulloni bastet ose vendosni rezultatin përfundimtar.</p>
        </div>
        <button 
          onClick={fetchMatches}
          className="px-4 py-2 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg text-sm font-semibold transition"
        >
          Rifresko ndeshjet
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-text-secondary bg-secondary rounded-xl border border-tertiary">
          Duke ngarkuar ndeshjet...
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
                        {m.status === 'LIVE' ? 'DREJTPËRDREJT' : m.status === 'ENDED' ? 'PËRFUNDUAR' : 'PARA NDESHJES'} {m.status === 'LIVE' ? `${m.currentMinute || 0}'` : ''}
                      </span>
                      <span className="text-xs text-text-secondary font-medium">
                        {m.tournament?.name || 'Kampionati'} &bull; {new Date(m.startTime).toLocaleString('sq-AL')}
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
                      {m.isSuspended ? 'Hap kuotat e ndeshjes' : 'Pezullo kuotat e ndeshjes'}
                    </button>

                    {m.status !== 'ENDED' && (
                      <button 
                        onClick={() => { setSettleMatch(m); setHomeScore(String(m.homeScore || 0)); setAwayScore(String(m.awayScore || 0)); }}
                        className="px-3.5 py-2 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-xs flex items-center gap-1.5 transition"
                      >
                        <CheckCircle2 size={14} /> Vendos rezultatin
                      </button>
                    )}

                    <button 
                      onClick={() => setExpandedMatchId(isExpanded ? null : m.id)}
                      className="p-2 bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white rounded-lg transition"
                      title="Shiko dhe ndrysho tregjet"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* EXPANDED MARKETS VIEW */}
                {isExpanded && (
                  <div className="p-5 bg-primary/50 border-t border-tertiary/60 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      Kontrolli i tregjeve dhe kuotave ({m.markets?.length || 0} tregje)
                    </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-secondary">Ndrysho të gjitha kuotat e ndeshjes</span>
                        {percentButtons(m.markets?.flatMap((market: any) => market.outcomes ?? []) ?? [])}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {m.markets?.map((mk: any) => (
                        <div key={mk.id} className="bg-secondary p-3.5 rounded-lg border border-tertiary/80">
                          <div className="flex flex-wrap justify-between items-center gap-2 mb-2.5">
                            <span className="text-sm font-bold text-white flex items-center gap-1.5">
                              {translateMarketName(mk.name, t)}
                              {mk.status === 'SUSPENDED' && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold">
                                  Pezulluar
                                </span>
                              )}
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              {percentButtons(mk.outcomes ?? [])}
                              <button
                                onClick={() => handleToggleMarketSuspend(mk.id, mk.status)}
                                className="text-xs text-text-secondary hover:text-white font-semibold underline"
                              >
                                {mk.status === 'ACTIVE' ? 'Pezullo tregun' : 'Aktivizo tregun'}
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {mk.outcomes?.map((oc: any) => (
                              <div key={oc.id} className="bg-primary/80 border border-tertiary/60 p-2 rounded">
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    onClick={() => { setEditOutcome(oc); setNewOdds(String(oc.odds)); }}
                                    className="min-w-0 flex-1 text-left group"
                                  >
                                    <span className="block truncate text-xs text-text-secondary group-hover:text-white">{translateOutcomeName(oc.name, t, mk.name)}</span>
                                    <span className="text-sm font-bold text-accent-green flex items-center gap-1">
                                      {Number(oc.odds).toFixed(2)} <Edit3 size={11} className="text-text-secondary" />
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => handleToggleOutcomeSuspend(oc.id, oc.status)}
                                    className={`p-1.5 rounded ${oc.status === 'SUSPENDED' ? 'bg-amber-500/20 text-amber-400' : 'bg-tertiary text-text-secondary hover:text-white'}`}
                                    title={oc.status === 'SUSPENDED' ? 'Hap kuotën' : 'Pezullo vetëm këtë kuotë'}
                                  >
                                    {oc.status === 'SUSPENDED' ? <Unlock size={14} /> : <Lock size={14} />}
                                  </button>
                                </div>
                                {percentButtons([oc], true)}
                              </div>
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
            <h3 className="text-xl font-bold text-white mb-1">Mbyll ndeshjen dhe paguaj skedinat</h3>
            <p className="text-xs text-text-secondary mb-6">
              Vendosni rezultatin përfundimtar për <strong className="text-white">{settleMatch.homeTeam} - {settleMatch.awayTeam}</strong>. Fitimet do të kreditohen menjëherë.
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
                  Anulo
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-sm transition shadow-lg shadow-accent-green/20"
                >
                  Konfirmo rezultatin
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
            <h3 className="text-lg font-bold text-white mb-1">Ndrysho vlerën e kuotës</h3>
            <p className="text-xs text-text-secondary mb-4">
              Zgjedhja: <strong className="text-white">{translateOutcomeName(editOutcome.name, t)}</strong>
            </p>
            <form onSubmit={handleSaveOdds} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">Kuota (dhjetore)</label>
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
                  Anulo
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-xs"
                >
                  Ruaj kuotën
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
