import { useEffect, useState } from 'react';
import { ArrowLeft, Cherry, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import CasinoFullscreen from '../components/Layout/CasinoFullscreen';
import CasinoOriginalWallet from './CasinoOriginalWallet';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { casinoAssetUrl, ORIGINAL_LOGOS } from './casinoOriginalArt';

/**
 * Casino contains only Sizzling Hot Deluxe.
 * Both modes load the unchanged Pixi/Spine/Howler game from New-folder.
 * Money mode uses the server wallet; the ordinary default remains demo.
 */
export default function CasinoPage() {
  const { gameId } = useParams<{ gameId?: string }>();
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [realMoneyAvailable, setRealMoneyAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    void apiClient.get<{realMoneyAvailable:boolean}>('/casino/status')
      .then(response => {
        if (active) setRealMoneyAvailable(Boolean(response.data.realMoneyAvailable));
      })
      .catch(() => { if (active) setRealMoneyAvailable(false); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  if (gameId && gameId !== 'sizzling') return <Navigate to="/casino" replace />;
  const walletMode = realMoneyAvailable && user?.role === 'PLAYER';
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
      <Header />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-2 pb-12 pt-3 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-[#1c2733] px-4 text-sm font-semibold text-slate-100 hover:bg-[#29394a]">
            <ArrowLeft size={17}/> Kthehu te sporti
          </Link>
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-300">
            <ShieldCheck size={15} className="text-emerald-300"/>
            {walletMode ? 'Bilanc i përbashkët sport + kazino' : 'DEMO: pa para reale'}
          </div>
        </div>
        <section aria-label="Sizzling Hot Deluxe" className="overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 bg-[#111824] px-3 py-2 sm:px-5">
            {ORIGINAL_LOGOS.sizzling ? (
              <img className="h-11 max-w-36 object-contain sm:h-14 sm:max-w-52"
                src={casinoAssetUrl(ORIGINAL_LOGOS.sizzling)} alt="Sizzling Hot Deluxe"/>
            ) : <Cherry size={24} className="text-rose-400"/>}
            <div>
              <h1 className="text-sm font-black sm:text-lg">Sizzling Hot Deluxe</h1>
              <p className="text-xs text-slate-400">Loja origjinale vizuale, me animacione, audio, bastet dhe 5 linja</p>
            </div>
          </div>
          {!ready ? (
            <div role="status" className="grid min-h-[400px] place-items-center text-amber-200">Po ngarkohet loja...</div>
          ) : walletMode ? <CasinoOriginalWallet/> : (
            <CasinoFullscreen>
              <iframe title="Sizzling Hot Deluxe - klienti origjinal"
                src={import.meta.env.BASE_URL + 'casino-original/sizzling/index.html'}
                className="block h-[min(84dvh,900px)] min-h-[530px] w-full border-0"
                allow="autoplay; fullscreen" allowFullScreen/>
            </CasinoFullscreen>
          )}
          <p className="px-3 py-3 text-xs text-slate-400 sm:px-5">
            {walletMode
              ? 'Bastet dhe fitimet regjistrohen në portofolin e përbashkët dhe në historikun financiar.'
              : 'Po luhen vetëm kredite demonstrimi. Butoni Fullscreen përdor landscape kur lejohet nga pajisja.'}
          </p>
        </section>
      </main>
    </div>
  );
}
