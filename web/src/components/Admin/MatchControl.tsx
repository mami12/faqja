import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, Filter, Layers, Loader2, Lock, Percent, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trophy, Unlock, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { Match, Market, Outcome } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { formatMarketSelectionLabel, formatTicketSelection } from '../../utils/sportsbookLabels';
import { formatOdds } from '../../utils/formatOdds';
import { marketCategoryLabel, marketCategoryOf, type MarketCategory } from '../../utils/marketCatalog';
import { userError } from '../../utils/userError';
import MatchControlDialog from './MatchControlDialog';
import { competitionKey, eligibleOutcomes, fixtureName, matchStatus, previewAdjustments, searchText, statusLabel, type AdminOverride, type ControlDialog } from './matchControlModel';
import './matchControl.css';

const PAGE_SIZE = 30;
const categories: MarketCategory[] = ['main', 'goals', 'mixed', 'corners', 'cards', 'htft', 'players', 'other'];
const errorMessage = (error: any, fallback: string) => userError(error.response?.data?.error ?? error, fallback);
const kickoff = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('sq-AL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Ora nuk është konfirmuar';
};

export default function MatchControl() {
  const { t } = useLanguage();
  const [matches, setMatches] = useState<Match[]>([]);
  const [overrides, setOverrides] = useState<AdminOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Match | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStale, setDetailStale] = useState(true);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [competition, setCompetition] = useState('ALL');
  const [suspension, setSuspension] = useState('ALL');
  const [page, setPage] = useState(1);
  const [marketQuery, setMarketQuery] = useState('');
  const [category, setCategory] = useState<'all' | MarketCategory>('all');
  const [marketState, setMarketState] = useState('ALL');
  const [marketLimit, setMarketLimit] = useState(20);
  const [dialog, setDialog] = useState<ControlDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [automatic, setAutomatic] = useState(true);
  const mounted = useRef(true);
  const selection = useRef<string | null>(null);
  const epoch = useRef(0);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const actionRunning = useRef(false);
  const detailAvailable = useRef(false);
  const overrideMap = useMemo(() => new Map(overrides.map(row => [`${row.kind}:${row.ref}`, row])), [overrides]);
  const ownLock = (kind: string, id: string) => overrideMap.get(`${kind}:${id}`)?.suspended === true;

  const loadList = useCallback(async () => {
    const request = ++listRequest.current, version = epoch.current;
    setRefreshing(true);
    try {
      const response = await apiClient.get('/admin/matches?summary=true&limit=2000&includeEnded=true');
      if (!mounted.current || request !== listRequest.current || version !== epoch.current) return;
      const items: Match[] = (response.data.items ?? []).map((match: Match) => ({ ...match, id: String(match.id) }));
      setMatches(items);
      setListError('');
      setOverrides(response.data.overrides ?? []);
      setUpdatedAt(new Date());
      if (!selection.current && items[0]) {
        selection.current = items[0].id;
        setSelectedId(items[0].id);
      }
    } catch (failure) {
      if (mounted.current && request === listRequest.current && version === epoch.current) setListError(errorMessage(failure, 'Ndeshjet nuk u ngarkuan. Provo rifreskimin.'));
    } finally {
      if (mounted.current && request === listRequest.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const request = ++detailRequest.current, version = epoch.current;
    detailAvailable.current = false;
    setDetailLoading(true);
    try {
      const response = await apiClient.get(`/admin/matches/${encodeURIComponent(id)}`);
      if (!mounted.current || request !== detailRequest.current || selection.current !== id || version !== epoch.current) return;
      setDetail({ ...response.data.item, id: String(response.data.item.id) });
      setDetailStale(false); setDetailError(''); detailAvailable.current = true;
      const relevant: AdminOverride[] = response.data.overrides ?? [];
      setOverrides(previous => [...previous.filter(row => !(row.kind === 'match' ? row.ref === id : row.ref.startsWith(`${id}|`))), ...relevant]);
    } catch (failure) {
      if (mounted.current && request === detailRequest.current && selection.current === id && version === epoch.current) {
        setDetailStale(true); detailAvailable.current = false;
        setDetailError(errorMessage(failure, 'Tregjet nuk u rifreskuan. Veprimet janë bllokuar derisa të rifreskosh me sukses.'));
      }
    } finally {
      if (mounted.current && request === detailRequest.current) setDetailLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    // The selected fixture's precise overrides take precedence over the light list.
    await loadList();
    if (selection.current) await loadDetail(selection.current);
  }, [loadList, loadDetail]);
  useEffect(() => {
    mounted.current = true;
    void loadList();
    return () => { mounted.current = false; listRequest.current++; detailRequest.current++; };
  }, [loadList]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => {
    if (!automatic || dialog || busy) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !actionRunning.current) void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [automatic, dialog, busy, refresh]);
  useEffect(() => { setPage(1); }, [query, status, competition, suspension]);
  useEffect(() => { setMarketLimit(20); }, [selectedId, marketQuery, category, marketState]);

  const perform = async (work: () => Promise<unknown>, success: string, closeDialog = false) => {
    if (actionRunning.current) return;
    if (!detailAvailable.current) { setError('Rifresko ndeshjen me sukses përpara një ndryshimi tjetër.'); return; }
    actionRunning.current = true;
    epoch.current++;
    setBusy(true); setError(''); setNotice('');
    let completed = false;
    try {
      await work();
      completed = true;
      if (mounted.current) setNotice(success);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure, 'Veprimi nuk u konfirmua. Kontrollo gjendjen e rifreskuar përpara se ta provosh përsëri.'));
    } finally {
      await refresh();
      actionRunning.current = false;
      if (mounted.current) { setBusy(false); if (completed && closeDialog) setDialog(null); }
    }
  };
  const toggle = (kind: 'match' | 'market' | 'outcome', id: string) => {
    const remove = ownLock(kind, id);
    const resource = kind === 'match' ? 'matches' : `${kind}s`;
    void perform(() => apiClient.patch(`/admin/${resource}/${encodeURIComponent(id)}/suspend`, kind === 'match'
      ? { isSuspended: !remove } : { status: remove ? 'ACTIVE' : 'SUSPENDED' }), remove
      ? 'Pezullimi i administratorit u hoq. Gjendja e burimit dhe rregullat e rrezikut vazhdojnë të zbatohen.'
      : 'Pezullimi u ruajt me sukses.');
  };
  const saveOdds = async (odds: number) => {
    if (dialog?.kind !== 'odds') return;
    await perform(() => apiClient.patch(`/admin/outcomes/${encodeURIComponent(dialog.outcome.id)}/odds`, { odds }), 'Kuota u ruajt me sukses.', true);
  };
  const adjustOdds = async (percentage: number) => {
    if (dialog?.kind !== 'adjust') return;
    const changes = previewAdjustments(dialog.outcomes, percentage);
    if (!Number.isFinite(percentage) || percentage <= -100 || percentage === 0 || !changes.length || changes.some(row => !row.valid)) return;
    await perform(async () => {
      let failed = 0;
      // Bound concurrent writes; preserve native three-decimal prices and IDs.
      for (let index = 0; index < changes.length; index += 6) {
        const results = await Promise.allSettled(changes.slice(index, index + 6).map(row => apiClient.patch(`/admin/outcomes/${encodeURIComponent(row.outcome.id)}/odds`, { odds: row.next })));
        failed += results.filter(result => result.status === 'rejected').length;
      }
      if (failed) throw new Error(`U konfirmuan ${changes.length - failed} nga ${changes.length} kuota. ${failed} nuk u konfirmuan; kontrollo gjendjen e rifreskuar përpara një veprimi tjetër.`);
    }, `U përditësuan ${changes.length} kuota.`, true);
  };
  const settleMatch = async (homeScore: number, awayScore: number) => {
    if (dialog?.kind !== 'settle') return;
    await perform(() => apiClient.post(`/admin/matches/${encodeURIComponent(dialog.match.id)}/settle`, { homeScore, awayScore }), 'Rezultati u ruajt dhe skedinat u përditësuan.', true);
  };

  const competitions = useMemo(() => [...new Map(matches.filter(match => competitionKey(match)).map(match => [competitionKey(match), match.tournament?.name ?? 'Pa kampionat'])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [matches]);
  const filtered = useMemo(() => matches.filter(match => {
    const text = searchText(`${match.homeTeam} ${match.awayTeam} ${match.tournament?.name ?? ''} ${match.id}`);
    return (!query.trim() || text.includes(searchText(query.trim()))) && (status === 'ALL' || matchStatus(match) === status)
      && (competition === 'ALL' || competitionKey(match) === competition)
      && (suspension === 'ALL' || Boolean(match.isSuspended) === (suspension === 'SUSPENDED'));
  }), [matches, query, status, competition, suspension]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const selected = detail && detail.id === selectedId ? detail : null;
  const controlsBlocked = busy || detailLoading || detailStale;
  const shownError = error || detailError || listError;
  const markets = selected?.markets ?? [];
  const categoryCounts = new Map(categories.map(key => [key, markets.filter(market => marketCategoryOf(market) === key).length]));
  const marketTitle = (market: Market) => formatMarketSelectionLabel(market.name, market.line, t);
  const outcomeTitle = (outcome: Outcome, market: Market) => formatTicketSelection(outcome.name, market.name, selected ? fixtureName(selected) : '', t, outcome.code, market.line);
  const filteredMarkets = markets.filter(market => (category === 'all' || marketCategoryOf(market) === category)
    && (marketState === 'ALL' || market.status === marketState)
    && (!marketQuery.trim() || searchText(`${marketTitle(market)} ${market.name} ${market.line ?? ''} ${(market.outcomes ?? []).map(outcome => outcomeTitle(outcome, market)).join(' ')}`).includes(searchText(marketQuery.trim()))));
  const chooseMatch = (match: Match) => {
    if (actionRunning.current) return;
    if (selection.current !== match.id) { detailAvailable.current = false; setDetailStale(true); setDetailError(''); }
    selection.current = match.id;
    setSelectedId(match.id); setMobileDetail(true);
    setMarketQuery(''); setCategory('all'); setMarketState('ALL'); setError('');
  };
  const openDialog = (value: ControlDialog) => { setError(''); setNotice(''); setDialog(value); };
  const adjustDialog = (scope: 'match' | 'market', id: string, title: string, outcomes: Outcome[]) => {
    if (selected) openDialog({ kind: 'adjust', match: selected, scope, id, title, outcomes });
  };

  return <section className="match-control" data-mobile-detail={mobileDetail} aria-busy={busy || undefined}>
    <header className="mc-heading">
      <div><div className="mc-eyebrow"><SlidersHorizontal size={14} /> ADMINISTRIMI I TREGJEVE</div><h2>Ndeshjet dhe koeficientët</h2><p>Gjej ndeshjen, kontrollo tregjet dhe menaxho kuotat në një vend.</p></div>
      <button className="mc-button mc-secondary" disabled={busy || refreshing || detailLoading} onClick={() => { setError(''); void refresh(); }}><RefreshCw size={16} className={refreshing ? 'mc-spin' : ''} /> Rifresko</button>
    </header>
    <div className="mc-stats">
      <div><Layers /><strong>{matches.length}</strong><span>Ndeshje të ngarkuara</span></div>
      <div><span className="mc-live-dot" /><strong>{matches.filter(match => matchStatus(match) === 'LIVE').length}</strong><span>Në lojë</span></div>
      <div><Lock /><strong>{matches.filter(match => match.isSuspended).length}</strong><span>Të pezulluara</span></div>
      <div><Filter /><strong>{filtered.length}</strong><span>Në këtë kërkim</span></div>
    </div>
    <div className="mc-toolbar">
      <label className="mc-search"><Search size={18} /><input aria-label="Kërko ndeshje" placeholder="Kërko ekip, kampionat ose ID…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Pastro kërkimin" onClick={() => setQuery('')}><X size={16} /></button>}</label>
      <label className="mc-auto"><input type="checkbox" aria-label="Rifreskim automatik" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /><span>Rifreskim automatik<small>{updatedAt ? `Përditësuar ${updatedAt.toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}` : 'Çdo 30 sekonda'}</small></span></label>
    </div>
    <div className="mc-filters">
      <label>Gjendja<select aria-label="Gjendja e ndeshjeve" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Të gjitha ndeshjet</option><option value="LIVE">Në lojë</option><option value="PREMATCH">Para ndeshjes</option><option value="ENDED">Të përfunduara</option></select></label>
      <label>Kampionati<select aria-label="Kampionati" value={competition} onChange={event => setCompetition(event.target.value)}><option value="ALL">Të gjitha kampionatet</option>{competitions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Pezullimi<select aria-label="Pezullimi i ndeshjeve" value={suspension} onChange={event => setSuspension(event.target.value)}><option value="ALL">Çdo gjendje</option><option value="ACTIVE">Pa pezullim ndeshjeje</option><option value="SUSPENDED">Të pezulluara</option></select></label>
    </div>
    {shownError && !dialog && <div className="mc-message mc-error" role="alert"><Lock size={17} /><span>{shownError}</span>{!detailError && !listError && <button aria-label="Mbyll njoftimin" onClick={() => setError('')}><X size={16} /></button>}</div>}
    {notice && <div className="mc-message mc-success" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button aria-label="Mbyll njoftimin" onClick={() => setNotice('')}><X size={16} /></button></div>}
    <div className="mc-workspace">
      <aside className="mc-list" data-mobile-hidden={mobileDetail} aria-label="Lista e ndeshjeve">
        <div className="mc-list-heading"><strong>Ndeshjet</strong><span>{filtered.length} rezultate</span></div>
        <div className="mc-list-scroll">
          {loading ? <div className="mc-empty"><Loader2 className="mc-spin" />Po ngarkohen ndeshjet…</div> : !filtered.length ? <div className="mc-empty"><Search />Nuk u gjet asnjë ndeshje.<small>Provo një emër tjetër ose ndrysho filtrat.</small></div> : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(match => <button className="mc-match" key={match.id} data-admin-match-id={match.id} aria-pressed={selectedId === match.id} disabled={busy} onClick={() => chooseMatch(match)}>
            <span className="mc-match-top"><span className={`mc-badge ${matchStatus(match) === 'LIVE' ? 'mc-live' : ''}`}>{statusLabel(match)}{matchStatus(match) === 'LIVE' && match.currentMinute != null ? ` · ${match.currentMinute}′` : ''}</span><span>#{match.id}</span>{match.isSuspended && <Lock size={13} aria-label="E pezulluar" />}</span>
            <span className="mc-team"><span>{match.homeTeam}</span><b>{match.homeScore ?? '–'}</b></span><span className="mc-team"><span>{match.awayTeam}</span><b>{match.awayScore ?? '–'}</b></span>
            <span className="mc-match-bottom"><span>{match.tournament?.name ?? 'Pa kampionat'}</span><ChevronRight size={15} /></span><span className="mc-kickoff"><Clock size={11} />{kickoff(match.startTime)}</span>
          </button>)}
        </div>
        <footer className="mc-pagination"><span>Faqja {currentPage} / {pages}</span><div><button aria-label="Faqja e mëparshme" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button><button aria-label="Faqja tjetër" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></div></footer>
      </aside>
      <div className="mc-detail" data-mobile-hidden={!mobileDetail}>
        <button className="mc-mobile-back" onClick={() => setMobileDetail(false)} disabled={busy}><ArrowLeft size={17} />Kthehu te ndeshjet</button>
        {!selected ? <div className="mc-detail-placeholder"><Layers size={32} /><h3>{detailLoading ? 'Po ngarkohen tregjet…' : 'Zgjidh një ndeshje'}</h3><p>Kuotat dhe kontrollet do të shfaqen këtu.</p></div> : <div data-admin-selected-match={selected.id}>
          <section className="mc-fixture">
            <div className="mc-fixture-meta"><span className={`mc-badge ${matchStatus(selected) === 'LIVE' ? 'mc-live' : ''}`}>{statusLabel(selected)}{matchStatus(selected) === 'LIVE' && selected.currentMinute != null ? ` · ${selected.currentMinute}′` : ''}</span><span>#{selected.id}</span>{detailLoading && <Loader2 size={14} className="mc-spin" aria-label="Po rifreskohet ndeshja" />}</div>
            <div className="mc-fixture-title"><div><h3>{selected.homeTeam}</h3><h3>{selected.awayTeam}</h3></div><div className="mc-score">{selected.homeScore ?? '–'}<span>:</span>{selected.awayScore ?? '–'}</div></div>
            <div className="mc-fixture-subtitle"><Trophy size={13} /><span>{selected.tournament?.name ?? 'Pa kampionat'}</span><span>· {kickoff(selected.startTime)}</span></div>
            <div className="mc-fixture-actions">
              <button className={`mc-button ${ownLock('match', selected.id) ? 'mc-warning' : 'mc-secondary'}`} data-admin-toggle-match={selected.id} aria-pressed={ownLock('match', selected.id)} disabled={controlsBlocked} onClick={() => toggle('match', selected.id)}>{ownLock('match', selected.id) ? <Unlock size={15} /> : <Lock size={15} />}{ownLock('match', selected.id) ? 'Hiq pezullimin' : 'Pezullo ndeshjen'}</button>
              <button className="mc-button mc-secondary" data-admin-adjust-scope="match" data-admin-adjust-id={selected.id} disabled={controlsBlocked || !eligibleOutcomes(markets.flatMap(market => market.outcomes ?? [])).length} onClick={() => adjustDialog('match', selected.id, 'Të gjitha kuotat e ndeshjes', markets.flatMap(market => market.outcomes ?? []))}><Percent size={15} />Rregullo kuotat</button>
              <button className="mc-button mc-quiet" disabled={controlsBlocked} onClick={() => openDialog({ kind: 'settle', match: selected })}><Trophy size={15} />Vendos rezultatin</button>
            </div>
            {selected.isSuspended && <p className="mc-lock-note"><Lock size={14} />{ownLock('match', selected.id) ? 'Ndeshja është pezulluar nga administratori. Tregjet trashëgojnë këtë pezullim.' : 'Ndeshja është pezulluar nga burimi ose rregullat e sistemit. Heqja e një pezullimi individual nuk e hap ndeshjen.'}</p>}
          </section>
          <section className="mc-market-controls">
            <div className="mc-section-heading"><h3>Tregjet <span>{markets.length}</span></h3><small>{filteredMarkets.length} të shfaqshme</small></div>
            <div className="mc-market-search"><label className="mc-search"><Search size={17} /><input aria-label="Kërko treg ose zgjedhje" placeholder="Kërko treg, zgjedhje ose linjë…" value={marketQuery} onChange={event => setMarketQuery(event.target.value)} /></label><select aria-label="Gjendja e tregjeve" value={marketState} onChange={event => setMarketState(event.target.value)}><option value="ALL">Çdo gjendje</option><option value="ACTIVE">Tregje aktive</option><option value="SUSPENDED">Të pezulluara</option></select></div>
            <div className="mc-categories" aria-label="Kategoritë e tregjeve"><button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Të gjitha</button>{categories.filter(key => categoryCounts.get(key)).map(key => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{marketCategoryLabel(key, 'al')}</button>)}</div>
          </section>
          <div className="mc-markets">
            {filteredMarkets.slice(0, marketLimit).map(market => <article key={market.id} className={`mc-market ${market.status === 'SUSPENDED' ? 'mc-market-paused' : ''}`} data-admin-market-id={market.id}>
              <header><div><small>{marketCategoryLabel(marketCategoryOf(market), 'al')}</small><h4>{marketTitle(market)}</h4>{market.status !== 'ACTIVE' && <span className="mc-paused-text">{market.status === 'SETTLED' ? 'I përfunduar' : 'I pezulluar'}</span>}</div><div className="mc-market-actions"><button className="mc-icon-button" title="Rregullo kuotat e tregut" aria-label={`Rregullo kuotat: ${marketTitle(market)}`} data-admin-adjust-scope="market" data-admin-adjust-id={market.id} disabled={controlsBlocked || !eligibleOutcomes(market.outcomes ?? []).length} onClick={() => adjustDialog('market', market.id, marketTitle(market), market.outcomes ?? [])}><Percent size={16} /></button><button className={`mc-icon-button ${ownLock('market', market.id) ? 'mc-locked' : ''}`} aria-label={`${ownLock('market', market.id) ? 'Hiq pezullimin e tregut' : 'Pezullo tregun'}: ${marketTitle(market)}`} data-admin-toggle-market={market.id} aria-pressed={ownLock('market', market.id)} disabled={controlsBlocked} onClick={() => toggle('market', market.id)}>{ownLock('market', market.id) ? <Unlock size={16} /> : <Lock size={16} />}</button></div></header>
              <div className="mc-outcomes" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, market.outcomes?.length ?? 1))}, minmax(0, 1fr))` }}>{(market.outcomes ?? []).map(outcome => {
                const locked = outcome.status !== 'ACTIVE', own = ownLock('outcome', outcome.id), pinned = overrideMap.get(`outcome:${outcome.id}`)?.price != null;
                return <div className={`mc-outcome ${locked ? 'mc-outcome-paused' : ''}`} key={outcome.id} data-admin-outcome-id={outcome.id}>
                  <button className="mc-quote" data-admin-edit-outcome={outcome.id} aria-label={`Ndrysho kuotën: ${outcomeTitle(outcome, market)}`} disabled={controlsBlocked || !eligibleOutcomes([outcome]).length} onClick={() => openDialog({ kind: 'odds', match: selected, market, outcome })}><span>{outcomeTitle(outcome, market)}</span><strong>{formatOdds(outcome.odds)}</strong><small>{pinned ? 'E ndryshuar' : 'Ndrysho kuotën'}<ArrowRight size={10} /></small></button>
                  <div className="mc-outcome-status"><span>{outcome.riskSuspended ? 'Rreziku' : own ? 'Pezulluar nga ju' : locked ? 'E pezulluar' : 'Aktive'}</span><button data-admin-toggle-outcome={outcome.id} aria-pressed={own} aria-label={`${own ? 'Hiq pezullimin e kuotës' : 'Pezullo kuotën'}: ${outcomeTitle(outcome, market)}`} disabled={controlsBlocked} onClick={() => toggle('outcome', outcome.id)}>{own ? <Unlock size={13} /> : <Lock size={13} />}</button></div>
                </div>;
              })}</div>
              {!market.outcomes?.length && <p className="mc-market-empty">Nuk ka kuota të disponueshme.</p>}
            </article>)}
          </div>
          {!filteredMarkets.length && <div className="mc-empty mc-market-empty"><Search /><strong>{markets.length ? 'Nuk u gjet treg për këto filtra.' : 'Nuk ka tregje të disponueshme për këtë ndeshje.'}</strong><small>Rifresko ndeshjen ose ndrysho kërkimin.</small></div>}
          {filteredMarkets.length > marketLimit && <button className="mc-more" onClick={() => setMarketLimit(value => value + 20)}>Shfaq edhe {Math.min(20, filteredMarkets.length - marketLimit)} tregje<ChevronRight size={16} /></button>}
          <p className="mc-help"><ShieldCheck size={15} /><span>Butonat e pezullimit ndryshojnë vetëm vendimin e administratorit. Pezullimet e burimit, ndeshjes dhe rrezikut vazhdojnë të zbatohen.</span></p>
        </div>}
      </div>
    </div>
    {dialog && <MatchControlDialog key={`${dialog.kind}:${dialog.kind === 'odds' ? dialog.outcome.id : dialog.kind === 'adjust' ? dialog.id : dialog.match.id}`} dialog={dialog} busy={busy} error={shownError} onClose={() => { if (!actionRunning.current) { setDialog(null); setError(''); } }} onSaveOdds={saveOdds} onAdjust={adjustOdds} onSettle={settleMatch} />}
  </section>;
}
