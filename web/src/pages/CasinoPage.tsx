import { ArrowLeft, Cherry } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import CasinoFullscreen from '../components/Layout/CasinoFullscreen';
import { casinoAssetUrl, ORIGINAL_LOGOS } from './casinoOriginalArt';

/**
 * Original Pixi/Spine Sizzling cabinet with its own demo-credit session.
 * It never calls /casino/session, /real/play, or the sportsbook wallet.
 */
export default function CasinoPage() {
  const { gameId } = useParams<{ gameId?: string }>();
  if (gameId && gameId !== 'sizzling') return <Navigate to="/casino" replace />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
      <Header />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-2 pb-12 pt-3 sm:px-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-[#1c2733] px-4 text-sm font-semibold text-slate-100 hover:bg-[#29394a]">
            <ArrowLeft size={17}/> Kthehu te sporti
          </Link>
          <span className="text-xs font-medium text-amber-200">Kredite demo, pa lidhje me bilancin e sportit</span>
        </div>
        <section aria-label="Sizzling Hot Deluxe" className="overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 bg-[#111824] px-3 py-3 sm:px-5">
            {ORIGINAL_LOGOS.sizzling ? (
              <img className="h-11 max-w-36 object-contain sm:h-14 sm:max-w-52"
                src={casinoAssetUrl(ORIGINAL_LOGOS.sizzling)} alt="Sizzling Hot Deluxe"/>
            ) : <Cherry size={24} className="text-rose-400"/>}
            <div>
              <h1 className="text-sm font-black sm:text-lg">Sizzling Hot Deluxe</h1>
              <p className="text-xs text-slate-400">Versioni origjinal me 100,000 kredite demo. Start, Spin, Collect dhe Gamble.</p>
            </div>
          </div>
          <CasinoFullscreen>
            <iframe
              title="Sizzling Hot Deluxe - demo credits"
              src="/app/casino-original/sizzling/index.html"
              className="block h-[min(84vh,920px)] min-h-[530px] w-full border-0"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </CasinoFullscreen>
        </section>
      </main>
    </div>
  );
}
