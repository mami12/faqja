import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, Edit3, Lock, Unlock, PlayCircle, Search, X, RefreshCw, Trophy, Clock } from 'lucide-react';
import { translateMarketName, translateOutcomeName } from '../../utils/sportsbookLabels';
import { useLanguage } from '../../context/LanguageContext';

export default function MatchControl() {
  const { t } = useLanguage();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'PREMATCH' | 'ENDED'>('ALL');
  
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
    if (failed) alert(`${failed} nga ${updates.length} ndryshime të kuotave dështuan. Ndryshimet e tjera u ruajtën.`);
  };

  const percentButtons = (outcomes: any[], compact = false) => (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? 'mt-1' : ''}`}>
      {[-10, -5, 5, 10].map((percent) => (
        <button
          key={percent}
          type="button"
          onClick={() => adjustOutcomes(outcomes, percent)}
          className="px-1.5 py-0.5 rounded bg-tertiary hover:bg-accent-blue/20 text-text-secondary hover:text-white text-[10px] font-black active:scale-95 transition"
          title={`Ndrysho kuotat me ${percent}%`}
        >
          {percent > 0 ? '+' : ''}{percent}%
        </button>
      ))}
      <button
        type="button"
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
        className="px-1.5 py-0.5 rounded bg-accent-blue/15 hover:bg-accent-blue/25 text-accent-blue text-[10px] font-black active:scale-95 transition"
      >
        %
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

  const filteredMatches = matches.filter(m => {
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = `${m.homeTeam || ''} ${m.awayTeam || ''} ${m.tournament?.name || ''}`.toLowerCase();
      return matchName.includes(q);
    }
    return true;
  });

  const liveCount = matches.filter(m => m.status === 'LIVE').length;
  const prematchCount = matches.filter(m => m.status === 'PREMATCH' || (!m.status || m.status === 'UPCOMING')).length;
  const endedCount = matches.filter(m => m.status === 'ENDED').length;

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">{t('admin.match_management')}</h2>
          <p className="text-text-secondary text-xs sm:text-sm">{t('admin.control_matches')}</p>
        </div>
        <button 
          onClick={fetchMatches}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 bg-tertiary/80 hover:bg-tertiary text-white rounded-xl text-xs sm:text-sm font-bold transition active:scale-95"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin text-accent-green' : ''} />
          <span>{t('admin.refresh_fixtures')}</span>
        </button>
      </div>

      {/* Search & Status Filters */}
      <div className="bg-secondary p-3 sm:p-4 rounded-2xl border border-tertiary space-y-3 shadow-md">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kërko me emër ekipi ose lige (p.sh. Real Madrid, Arsenal)..."
            className="w-full bg-primary border border-tertiary rounded-xl pl-9 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-text-secondary focus:outline-none focus:border-accent-green"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pt-1">
          {[
            { id: 'ALL', label: 'Të Gjitha', count: matches.length },
            { id: 'LIVE', label: 'Drejtpërdrejt', count: liveCount, isLive: true },
            { id: 'PREMATCH', label: 'Para Ndeshjes', count: prematchCount },
            { id: 'ENDED', label: 'Përfunduar', count: endedCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-accent-green text-primary font-black shadow-sm'
                  : 'bg-primary/80 text-text-secondary hover:text-white hover:bg-tertiary/60'
              }`}
            >
              {tab.isLive && liveCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
              <span>{tab.label}</span>
              <span className="opacity-75 text-[11px]">({tab.count})</span>
            </button>
          ))}
          <span className="ml-auto text-[11px] text-text-secondary font-medium whitespace-nowrap pl-2">
            Shfaqur {filteredMatches.length}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-text-secondary bg-secondary rounded-2xl border border-tertiary flex flex-col items-center justify-center gap-3">
          <RefreshCw size={26} className="animate-spin text-accent-green" />
          <span className="text-sm font-semibold">{t('admin.loading_matches')}</span>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-12 text-center text-text-secondary bg-secondary rounded-2xl border border-tertiary space-y-2">
          <Trophy size={32} className="mx-auto opacity-30 text-white" />
          <div className="text-sm font-bold text-white">Nuk u gjet asnjë ndeshje</div>
          <p className="text-xs">Provoni të pastroni kërkimin ose të zgjidhni një filtër tjetër.</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {filteredMatches.map(m => {
            const isExpanded = expandedMatchId === m.id;
            const marketCount = m.markets?.length || 0;
            return (
              <div key={m.id} className="bg-secondary rounded-2xl border border-tertiary shadow-lg overflow-hidden transition hover:border-tertiary/90">
                {/* Match Header Card */}
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Top Meta Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider ${
                        m.status === 'LIVE' ? 'bg-accent-red text-white animate-pulse' :
                        m.status === 'ENDED' ? 'bg-tertiary text-text-secondary' : 'bg-accent-blue/20 text-accent-blue'
                      }`}>
                        {m.status === 'LIVE' ? `DREJTPËRDREJT ${m.currentMinute ? `${m.currentMinute}'` : ''}` : m.status === 'ENDED' ? 'PËRFUNDUAR' : 'PARA NDESHJES'}
                      </span>
                      <span className="text-xs text-text-secondary font-medium">
                        {m.tournament?.name || 'Kampionati'} &bull; {new Date(m.startTime).toLocaleString('sq-AL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {m.isSuspended && (
                      <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 border border-amber-500/30">
                        <Lock size={12} /> Kuotat të Pezulluara
                      </span>
                    )}
                  </div>

                  {/* Teams and Score Box */}
                  <div className="bg-primary/70 p-3 sm:p-4 rounded-xl border border-tertiary/70 flex items-center justify-between gap-3">
                    <div className="flex-1 text-right font-bold text-white text-sm sm:text-base leading-tight">
                      {m.homeTeam}
                    </div>
                    <div className="px-3 sm:px-4 py-1.5 bg-secondary rounded-xl text-accent-yellow font-black text-base sm:text-xl border border-tertiary shrink-0 tabular-nums">
                      {m.homeScore ?? 0} - {m.awayScore ?? 0}
                    </div>
                    <div className="flex-1 text-left font-bold text-white text-sm sm:text-base leading-tight">
                      {m.awayTeam}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 flex-wrap flex-1">
                      <button 
                        onClick={() => handleToggleMatchSuspend(m.id, m.isSuspended)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${
                          m.isSuspended 
                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {m.isSuspended ? <Unlock size={14} /> : <Lock size={14} />}
                        <span>{m.isSuspended ? 'Hap kuotat' : 'Pezullo kuotat'}</span>
                      </button>

                      {m.status !== 'ENDED' && (
                        <button 
                          onClick={() => { setSettleMatch(m); setHomeScore(String(m.homeScore || 0)); setAwayScore(String(m.awayScore || 0)); }}
                          className="px-3 py-2 bg-accent-green hover:bg-emerald-600 text-primary font-black rounded-xl text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm shadow-accent-green/20"
                        >
                          <CheckCircle2 size={14} /> <span>Vendos rezultatin</span>
                        </button>
                      )}
                    </div>

                    <button 
                      onClick={() => setExpandedMatchId(isExpanded ? null : m.id)}
                      className="px-3 py-2 bg-tertiary hover:bg-tertiary/80 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                      title="Shiko dhe ndrysho tregjet"
                    >
                      <span>Tregjet ({marketCount})</span>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* EXPANDED MARKETS VIEW */}
                {isExpanded && (
                  <div className="p-3 sm:p-5 bg-primary/60 border-t border-tertiary/80 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-tertiary/40">
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          Kontrolli i tregjeve dhe kuotave ({marketCount} tregje)
                        </h4>
                        <p className="text-[11px] text-text-secondary">Ndrysho përqindjet ose kliko mbi një kuotë për ta redaktuar direkt</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-text-secondary font-semibold">Të gjitha kuotat:</span>
                        {percentButtons(m.markets?.flatMap((market: any) => market.outcomes ?? []) ?? [])}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                      {m.markets?.map((mk: any) => (
                        <div key={mk.id} className="bg-secondary p-3 rounded-xl border border-tertiary/80 space-y-2.5 shadow-sm">
                          <div className="flex flex-wrap justify-between items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                              {translateMarketName(mk.name, t)}
                              {mk.status === 'SUSPENDED' && (
                                <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-black border border-amber-500/30">
                                  Pezulluar
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              {percentButtons(mk.outcomes ?? [])}
                              <button
                                onClick={() => handleToggleMarketSuspend(mk.id, mk.status)}
                                className="text-[11px] text-text-secondary hover:text-white font-semibold underline active:scale-95 transition"
                              >
                                {mk.status === 'ACTIVE' ? 'Pezullo' : 'Aktivizo'}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {mk.outcomes?.map((oc: any) => (
                              <div key={oc.id} className="bg-primary/90 border border-tertiary/70 p-2.5 rounded-xl flex flex-col justify-between gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    onClick={() => { setEditOutcome({ ...oc, marketName: mk.name, matchName: `${m.homeTeam} vs ${m.awayTeam}` }); setNewOdds(String(oc.odds)); }}
                                    className="min-w-0 flex-1 text-left group"
                                  >
                                    <span className="block truncate text-xs text-text-secondary group-hover:text-white transition">
                                      {translateOutcomeName(oc.name, t, mk.name, `${m.homeTeam} vs ${m.awayTeam}`, oc.code)}
                                    </span>
                                    <span className="text-sm font-black text-accent-green flex items-center gap-1 tabular-nums mt-0.5">
                                      {Number(oc.odds).toFixed(2)} <Edit3 size={12} className="text-text-secondary group-hover:text-white" />
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => handleToggleOutcomeSuspend(oc.id, oc.status)}
                                    className={`p-2 rounded-xl active:scale-95 transition ${
                                      oc.status === 'SUSPENDED' 
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                                        : 'bg-tertiary text-text-secondary hover:text-white'
                                    }`}
                                    title={oc.status === 'SUSPENDED' ? 'Hap kuotën' : 'Pezullo kuotën'}
                                  >
                                    {oc.status === 'SUSPENDED' ? <Unlock size={14} /> : <Lock size={14} />}
                                  </button>
                                </div>
                                <div className="pt-0.5 border-t border-tertiary/30">
                                  {percentButtons([oc], true)}
                                </div>
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

      {/* SETTLE SCORE MODAL (Touch-Friendly Steppers) */}
      {settleMatch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-secondary border-t sm:border border-tertiary rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg sm:text-xl font-bold text-white">Mbyll ndeshjen dhe paguaj</h3>
              <button onClick={() => setSettleMatch(null)} className="text-text-secondary hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-text-secondary mb-5">
              Vendosni rezultatin përfundimtar për <strong className="text-white">{settleMatch.homeTeam} - {settleMatch.awayTeam}</strong>. Fitimet do të kreditohen automatikisht.
            </p>

            <form onSubmit={handleSettleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {/* Home Score */}
                <div className="bg-primary/80 p-3 rounded-2xl border border-tertiary text-center space-y-2">
                  <label className="text-xs font-semibold text-text-secondary block truncate">{settleMatch.homeTeam}</label>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHomeScore(String(Math.max(0, (parseInt(homeScore) || 0) - 1)))}
                      className="w-8 h-8 rounded-xl bg-tertiary hover:bg-tertiary/80 text-white font-bold text-lg flex items-center justify-center active:scale-95 transition"
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      value={homeScore} 
                      onChange={e => setHomeScore(e.target.value)}
                      min="0"
                      required
                      className="w-16 bg-secondary border border-tertiary rounded-xl p-2 text-white text-center text-2xl font-black tabular-nums focus:outline-none focus:border-accent-green"
                    />
                    <button
                      type="button"
                      onClick={() => setHomeScore(String((parseInt(homeScore) || 0) + 1))}
                      className="w-8 h-8 rounded-xl bg-tertiary hover:bg-tertiary/80 text-white font-bold text-lg flex items-center justify-center active:scale-95 transition"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Away Score */}
                <div className="bg-primary/80 p-3 rounded-2xl border border-tertiary text-center space-y-2">
                  <label className="text-xs font-semibold text-text-secondary block truncate">{settleMatch.awayTeam}</label>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAwayScore(String(Math.max(0, (parseInt(awayScore) || 0) - 1)))}
                      className="w-8 h-8 rounded-xl bg-tertiary hover:bg-tertiary/80 text-white font-bold text-lg flex items-center justify-center active:scale-95 transition"
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      value={awayScore} 
                      onChange={e => setAwayScore(e.target.value)}
                      min="0"
                      required
                      className="w-16 bg-secondary border border-tertiary rounded-xl p-2 text-white text-center text-2xl font-black tabular-nums focus:outline-none focus:border-accent-green"
                    />
                    <button
                      type="button"
                      onClick={() => setAwayScore(String((parseInt(awayScore) || 0) + 1))}
                      className="w-8 h-8 rounded-xl bg-tertiary hover:bg-tertiary/80 text-white font-bold text-lg flex items-center justify-center active:scale-95 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setSettleMatch(null)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-xl font-bold text-sm transition"
                >
                  Anulo
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary font-black rounded-xl text-sm transition shadow-lg shadow-accent-green/20 active:scale-95"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-secondary border-t sm:border border-tertiary rounded-t-3xl sm:rounded-2xl max-w-xs w-full p-5 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white">Ndrysho vlerën e kuotës</h3>
              <button onClick={() => setEditOutcome(null)} className="text-text-secondary hover:text-white p-1">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-text-secondary mb-4">
              Zgjedhja: <strong className="text-white">{translateOutcomeName(editOutcome.name, t, editOutcome.marketName, editOutcome.matchName, editOutcome.code)}</strong>
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
                  className="w-full bg-primary border border-tertiary rounded-xl p-3 text-white text-xl font-black text-center tabular-nums focus:outline-none focus:border-accent-green"
                />
              </div>

              {/* Quick Stepper Chips */}
              <div className="grid grid-cols-4 gap-1">
                {[-0.10, -0.05, 0.05, 0.10].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(newOdds) || 1.0;
                      const next = Math.max(1.01, Number((cur + step).toFixed(2)));
                      setNewOdds(String(next));
                    }}
                    className="py-1 rounded-lg bg-tertiary hover:bg-tertiary/80 text-white font-bold text-xs active:scale-95 transition"
                  >
                    {step > 0 ? `+${step.toFixed(2)}` : step.toFixed(2)}
                  </button>
                ))}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setEditOutcome(null)}
                  className="flex-1 py-2.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-xl font-bold text-xs transition"
                >
                  Anulo
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-accent-green hover:bg-emerald-600 text-primary font-black rounded-xl text-xs transition active:scale-95 shadow-md shadow-accent-green/20"
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
