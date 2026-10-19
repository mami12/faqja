import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Coins, Play, RotateCcw, Square, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { casinoAssetUrl, ORIGINAL_BACKGROUNDS, ORIGINAL_LOGOS, ORIGINAL_SYMBOLS } from './casinoOriginalArt';
import type { SpriteArt } from './casinoOriginalArt';
import Header from '../components/Layout/Header';
import { apiClient } from '../api/client';
import CasinoFullscreen from '../components/Layout/CasinoFullscreen';
import CasinoOriginalWallet from './CasinoOriginalWallet';

import { useAuth } from '../context/AuthContext';
import {
  BET_OPTIONS, GAMES, freshState, newSession, playDemoRound, readDemoStorage,
  type CasinoDemoState, type CasinoGame, type GameId,
} from './casinoEngine';

function OriginalReelSymbol({ game, symbol }: { game: CasinoGame; symbol: string }) {
  const index = game.symbols.indexOf(symbol);
  const art: SpriteArt | undefined = index >= 0 ? ORIGINAL_SYMBOLS[game.id]?.[index] : undefined;
  if (!art) return <Sparkles size={28} className="text-amber-400" aria-label="Simbol demo" />;
  if (!art.rect) return <img src={casinoAssetUrl(art.src)} alt={symbol} draggable={false} className="h-[86%] w-[86%] object-contain" />;
  const { x, y, w, h, atlasW, atlasH } = art.rect;
  return <div role="img" aria-label={symbol} className="h-full w-full"
    style={{
      backgroundImage: 'url("' + casinoAssetUrl(art.src) + '")',
      backgroundSize: (atlasW / w * 100) + '% ' + (atlasH / h * 100) + '%',
      backgroundPosition: (x / Math.max(1, atlasW - w) * 100) + '% ' + (y / Math.max(1, atlasH - h) * 100) + '%',
      backgroundRepeat: 'no-repeat',
    }}
  />;
}

const creditsFormat = (value: number) => value.toLocaleString('sq-AL', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export default function CasinoPage() {
  const { gameId } = useParams<{ gameId?: string }>();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const storageKey = 'casino-demo-v2:' + (user?.id ?? 'guest');
  const [demo, setDemo] = useState<CasinoDemoState>(() => readDemoStorage(storageKey));
  const [bet, setBet] = useState<number>(5);
  const [auto, setAuto] = useState(false);
  const [spinAnimation, setSpinAnimation] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [realMoneyAvailable,setRealMoneyAvailable] = useState(false);
  const [walletBalance,setWalletBalance]=useState<number|null>(null);
  const [spinBusy,setSpinBusy]=useState(false);
  const [spinError,setSpinError]=useState('');
  const spinLock=useRef(false);
  const pendingSpin=useRef<{id:string;gameId:string;bet:number}|null>(null);
  useEffect(()=>{
    let active=true;
    void apiClient.get('/casino/status').then(r=>{if(active){setRealMoneyAvailable(Boolean(r.data.realMoneyAvailable));setWalletBalance(Number(r.data.balance));}}).catch(()=>{});
    return()=>{active=false;};
  },[]);

  const game = useMemo(() => GAMES.find(entry => entry.id === gameId), [gameId]);
  const session = useMemo(() => game
    ? (demo.sessions[game.id] ?? newSession(game))
    : null, [demo.sessions, game]);

  useEffect(() => {
    if(!realMoneyAvailable)try { localStorage.setItem(storageKey, JSON.stringify(demo)); } catch { /* storage disabled */ }
  }, [demo, storageKey, realMoneyAvailable]);

  useEffect(() => { setAuto(false); setShowRules(false);setSpinError(''); }, [gameId]);

  const displayedBalance=realMoneyAvailable ? (walletBalance??user?.balance??0) : demo.credits;
  const canPlay=!!game&&!!session&&(displayedBalance>=bet||!!pendingSpin.current);
  const spin=useCallback(async()=>{
    if(!game||spinLock.current)return;
    if(!realMoneyAvailable||user?.role!=='PLAYER'){
      setDemo(previous=>playDemoRound(previous,game,bet));
      setSpinAnimation(previous=>previous+1);
      return;
    }
    spinLock.current=true;setSpinBusy(true);setSpinError('');
    const pending=pendingSpin.current||{id:crypto.randomUUID(),gameId:game.id,bet};
    pendingSpin.current=pending;
    try{
      const response=await apiClient.post('/casino/game/'+pending.gameId+'/spin',{
        clientRequestId:pending.id,bet:pending.bet,
      });
      const outcome=response.data;
      const data=outcome.result;
      const grid=(data.grid as number[][]).map(row=>row.map(symbol=>game.symbols[symbol]||game.symbols[0]));
      setWalletBalance(Number(outcome.balance));
      setDemo(previous=>({
        ...previous,credits:Number(outcome.balance),
        sessions:{...previous.sessions,[game.id]:{
          freeSpins:0,respins:0,held:[],lastGrid:grid,lastWin:Number(outcome.payout),
          lastMessage:data.message+(data.bonusSpins?' · '+data.bonusSpins+' falas':''),
          winningCells:data.winningCells as number[],totalSpins:(previous.sessions[game.id]?.totalSpins||0)+1,
        }},
      }));
      setSpinAnimation(previous=>previous+1);
      pendingSpin.current=null;
      void refreshUser();
    }catch(e:any){
      setSpinError(e.response?.data?.message||'Lidhja u ndërpre. Riprovo pa ndryshuar bastin.');
      if(e.response?.status===400||e.response?.status===403||e.response?.status===409)
        pendingSpin.current=null;
    }finally{spinLock.current=false;setSpinBusy(false);}
  },[game,bet,realMoneyAvailable,refreshUser,user?.role]);

  useEffect(()=>{
    if(!auto||realMoneyAvailable||!canPlay){if(auto&&(!canPlay||realMoneyAvailable))setAuto(false);return;}
    const timer=window.setInterval(()=>void spin(),900);
    return()=>window.clearInterval(timer);
  },[auto,realMoneyAvailable,canPlay,spin]);

  const openGame = (id: GameId) => {
    setAuto(false);
    navigate('/casino/' + id);
  };

  const resetCredits = () => {
    setAuto(false);
    setDemo(previous => ({ ...previous, credits: 1000 }));
  };

  // Sizzling Hot Deluxe has its own 10-payline reel engine and controls.
  // The generic casino demo cannot represent those payline rules/animations.
  if (game?.id === 'sizzling') {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
        <Header />
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-2 pb-10 pt-3 sm:px-5">
          <button type="button" onClick={() => navigate('/casino')}
            className="mb-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#1c2733] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-[#29394a]">
            <ArrowLeft size={16} /> Kthehu te Kazino
          </button>
          <div className="mx-auto w-full max-w-[1280px] overflow-hidden rounded-xl border border-amber-500/30 bg-black">
            {realMoneyAvailable && user?.role === 'PLAYER' ? <CasinoOriginalWallet/> : (
              <CasinoFullscreen>
                <iframe title="Sizzling Hot Deluxe · klienti origjinal"
                  src={import.meta.env.BASE_URL + 'casino-original/sizzling/index.html'}
                  className="block h-[min(84vh,920px)] min-h-[530px] w-full border-0"
                  allow="autoplay; fullscreen" allowFullScreen/>
              </CasinoFullscreen>
            )}
            <p className="px-3 py-3 text-xs text-slate-400">
              {realMoneyAvailable && user?.role === 'PLAYER'
                ? 'Bilanci i kazinosë dhe sportit është i përbashkët. Spin-et ruhen në databazë.'
                : 'Kredite DEMO, jo fondet e sportit. Klienti origjinal i plotë përgatitet nga scripts/sync-original-sizzling.mjs gjatë build-it; kreditë janë vetëm demo.'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
      <Header />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-3 pb-12 pt-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={() => game ? navigate('/casino') : navigate('/')}
              className="rounded-lg border border-white/10 bg-white/5 p-2.5 hover:bg-white/10"
              aria-label={game ? 'Kthehu te katalogu' : 'Kthehu te sportet'}>
              <ArrowLeft size={19} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black sm:text-2xl">{game ? game.title : 'Kazino'}</h1>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">{realMoneyAvailable&&user?.role==='PLAYER'?'Bilanci real':'Demo'}</span>
              </div>
              <p className="text-xs text-slate-400">9 lojëra · Brenda faqes sportive · {realMoneyAvailable&&user?.role==='PLAYER'?'Fonde të përbashkëta':'Demo'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-amber-500/30 bg-[#1c2430] px-3 py-2 text-right">
              <span className="block text-[10px] uppercase tracking-widest text-slate-400">{realMoneyAvailable&&user?.role==='PLAYER'?'Bilanci sport + kazino':'Kredite demo'}</span>
              <span aria-live="polite" className="text-lg font-extrabold tabular-nums text-amber-300">
                <Coins size={16} className="mr-1 inline align-[-2px]" />{creditsFormat(displayedBalance)}
              </span>
            </div>
            {(!realMoneyAvailable||user?.role!=='PLAYER')&&<button type="button" onClick={resetCredits}
              className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2.5 text-xs font-bold hover:border-amber-400 hover:text-amber-300">
              <RotateCcw size={15} /> Rimbush demo
            </button>}
          </div>
        </div>

        {!game ? (
          <>
            <div className="mb-5 rounded-xl border border-white/10 bg-[#172337] p-4 text-sm text-slate-300">
              {realMoneyAvailable&&user?.role==='PLAYER' ? 'Përdoruesi luan nga i njëjti bilanc si sporti. Rezultatet dhe fitimet llogariten e ruhen nga serveri. Lojërat e tjera, përveç Sizzling, përdorin motorin tonë, jo matematikën zyrtare të prodhuesve.' : 'Zgjidh një lojë. Kreditë demo nuk kanë vlerë monetare.'}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {GAMES.map(item => (
                <button key={item.id} type="button" onClick={() => openGame(item.id)}
                  className="group min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#192433] text-left transition hover:-translate-y-0.5 hover:border-amber-400/60 hover:shadow-xl">
                  <div className="relative flex h-32 items-center justify-center overflow-hidden sm:h-40"
                    style={{ background: 'radial-gradient(circle at 50% 40%, ' + item.colors[0] + ', ' + item.colors[1] + ')' }}>
                    <img src={casinoAssetUrl(ORIGINAL_BACKGROUNDS[item.id])}
                      alt="" loading="lazy" draggable={false}
                      className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    {ORIGINAL_LOGOS[item.id] && (
                      <img src={casinoAssetUrl(ORIGINAL_LOGOS[item.id]!)} alt=""
                        loading="lazy" draggable={false}
                        className="relative z-10 max-h-24 max-w-[85%] object-contain drop-shadow-[0_3px_9px_rgba(0,0,0,.95)] sm:max-h-32" />
                    )}
                    <span className="absolute bottom-2 left-3 right-10 truncate text-sm font-extrabold text-white drop-shadow-md">
                      {ORIGINAL_LOGOS[item.id] ? '' : item.title}
                    </span>
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 p-2 text-amber-300"><Play size={17} fill="currentColor" /></span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-bold sm:text-base">{item.title}</p>
                    <p className="mt-1 line-clamp-2 min-h-8 text-xs text-slate-400">{item.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : session && (
          <CasinoFullscreen>
          <div className="mx-auto max-w-5xl">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 p-3 shadow-2xl sm:p-6"
              style={{
                backgroundColor: game.colors[1],
                backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,.22), rgba(0,0,0,.70)), url("' + casinoAssetUrl(ORIGINAL_BACKGROUNDS[game.id]) + '")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}>
              <div className="mb-3 text-center">
                {ORIGINAL_LOGOS[game.id] ? (
                  <img src={casinoAssetUrl(ORIGINAL_LOGOS[game.id]!)} alt={game.title}
                    className="mx-auto mb-1 max-h-[95px] max-w-[85%] object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,.95)]" />
                ) : (
                  <div className="text-lg font-black uppercase tracking-wider text-amber-200 drop-shadow-lg sm:text-2xl">{game.title}</div>
                )}
                <div className="text-xs text-white/70">{game.subtitle}</div>
              </div>

              <div className="mx-auto max-w-[780px] rounded-xl border-[3px] border-amber-500/60 bg-[#07101b] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.45)] sm:p-3">
                <div className="grid gap-1 sm:gap-2"
                  style={{ gridTemplateColumns: 'repeat(' + game.reels + ', minmax(0, 1fr))' }}>
                  {session.lastGrid.map((row, r) =>
                    row.map((symbol, c) => {
                      const index = r * game.reels + c;
                      const winning = session.winningCells.includes(index);
                      const locked = session.respins > 0 && session.held.includes(index);
                      return (
                        <div key={index + '-' + spinAnimation}
                          className={
                            'flex aspect-[4/5] select-none items-center justify-center rounded-md border text-[min(7vw,48px)] shadow-inner transition-all sm:rounded-lg sm:text-[50px] ' +
                            (winning || locked
                              ? 'border-amber-300 bg-amber-100/20 shadow-[inset_0_0_20px_rgba(253,224,71,.3)]'
                              : 'border-slate-600/70 bg-gradient-to-b from-slate-100 to-slate-300') +
                            (spinAnimation ? ' animate-[pulse_.24s_ease-out]' : '')
                          }
                          aria-label={'Rreshti ' + (r + 1) + ', kolona ' + (c + 1) + ': ' + symbol}>
                          <OriginalReelSymbol game={game} symbol={locked ? game.symbols[6] : symbol} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-3 flex min-h-[64px] flex-col items-center justify-center rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-center">
                <p aria-live="polite" className="font-bold text-amber-200">{session.lastMessage}</p>
                <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs font-semibold text-slate-200">
                  <span>Fitimi: <b className="text-emerald-300">{creditsFormat(session.lastWin)}</b></span>
                  {session.freeSpins > 0 && <span><Sparkles size={12} className="inline" /> Falas: {session.freeSpins}</span>}
                  {session.respins > 0 && <span>Hold & Respin: {session.respins}</span>}
                  <span>Rrotullime: {session.totalSpins}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-center gap-2 sm:gap-3">
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200">
                  {realMoneyAvailable&&user?.role==='PLAYER'?'Basti në Lek':'Basti demo'}
                  <select value={bet} onChange={event => {setAuto(false);setBet(Number(event.target.value));}}
                    disabled={auto||spinBusy||!!pendingSpin.current} className="h-11 rounded-lg border border-white/20 bg-[#142237] px-3 font-bold text-white">
                    {BET_OPTIONS.map(option => <option key={option} value={option}>{option} {realMoneyAvailable&&user?.role==='PLAYER'?'Lek':'kredite'}</option>)}
                  </select>
                </label>
                <button type="button" disabled={!canPlay || auto || spinBusy} onClick={()=>void spin()}
                  className="flex h-11 min-w-[130px] items-center justify-center gap-2 rounded-lg bg-amber-400 px-6 font-black text-[#251802] shadow-lg transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">
                  <Play size={19} fill="currentColor" /> {session.respins > 0 ? 'RESPIN' : session.freeSpins > 0 ? 'FALAS' : 'SPIN'}
                </button>
                {(!realMoneyAvailable||user?.role!=='PLAYER')&&<button type="button" disabled={!canPlay && !auto}
                  onClick={() => setAuto(current => !current)}
                  className={
                    'flex h-11 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-bold transition ' +
                    (auto ? 'border-rose-400 bg-rose-500/20 text-rose-200' : 'border-white/25 bg-white/10 text-white hover:bg-white/20') +
                    (!canPlay && !auto ? ' cursor-not-allowed opacity-50' : '')
                  }>
                  {auto ? <Square size={15} fill="currentColor" /> : <RotateCcw size={16} />}
                  {auto ? 'NDALO AUTO' : 'AUTO'}
                </button>}
              </div>
              {spinError&&<p role="alert" className="mt-3 text-center text-xs text-rose-200">{spinError}</p>}
              {!canPlay && <p className="mt-3 text-center text-xs text-rose-200">{realMoneyAvailable?'Nuk ka fonde të mjaftueshme.':'Nuk ka mjaft kredite demo.'}</p>}
              <p className="mt-3 text-center text-[11px] text-white/60">
                {realMoneyAvailable&&user?.role==='PLAYER'?'Transaksionet regjistrohen në bilancin e përbashkët dhe mund të kontrollohen në historik.':'Vetëm simulim lokal.'}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-[#17212e]">
              <button type="button" onClick={() => setShowRules(value => !value)} aria-expanded={showRules}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold">
                Rregullat e demonstrimit <span>{showRules ? '−' : '+'}</span>
              </button>
              {showRules && <div className="space-y-2 border-t border-white/10 px-4 py-3 text-sm text-slate-300">
                <p>{game.mode === 'tumble'
                  ? 'Në këtë demo, 8 ose më shumë simbole të njëjta të dukshme paguajnë një fitore. 4 simbole ✨ japin 6 rrotullime falas.'
                  : 'Në këtë demo, 3, 4 ose 5 simbole të njëjta duke filluar nga kolona e parë japin fitore në 9 linja. 3 simbole ✨ japin 6 rrotullime falas.'}
                </p>
                {game.mode === 'hold' && <p>Katër ose më shumë 🪙 aktivizojnë 3 respin falas. Monedhat ruhen derisa të mbarojë bonusi.</p>}
                <p>Shpërndarja dhe pagesat janë krijuar për këtë demo. Nuk riprodhojnë matematikën, animacionet ose RTP-në e lojës origjinale.</p>
              </div>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {GAMES.filter(item => item.id !== game.id).map(item => (
                <button key={item.id} type="button" onClick={() => openGame(item.id)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:border-amber-400/50">
                  {item.title}
                </button>
              ))}
            </div>
          </div>
          </CasinoFullscreen>
        )}
      </main>
    </div>
  );
}
