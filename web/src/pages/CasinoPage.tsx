import { ArrowLeft, BookOpen, Cherry } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import CasinoOriginalWallet, { type CasinoGame } from './CasinoOriginalWallet';
import { casinoAssetUrl, ORIGINAL_LOGOS } from './casinoOriginalArt';

const GAMES: { id: CasinoGame; title: string; subtitle: string }[] = [
  { id: 'sizzling', title: 'Sizzling Hot Deluxe', subtitle: '5 linja · fruta · Kuq/Zi' },
  { id: 'bookofra', title: 'Book of Ra Deluxe', subtitle: '10 linja · Book wild · 10 free spins' },
];

/**
 * Casino cabinet. Every game plays with the player's real account balance —
 * the same wallet used by sports betting. A game is only embedded after
 * POST /app/api/casino/session (or /casino/bookofra/session) issued its
 * HttpOnly cookie and that cookie was verified against the /real/play endpoint.
 */
export default function CasinoPage() {
  const { gameId } = useParams<{ gameId?: string }>();

  if (!gameId) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
        <Header />
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-2 pb-12 pt-3 sm:px-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-[#1c2733] px-4 text-sm font-semibold text-slate-100 hover:bg-[#29394a]">
              <ArrowLeft size={17}/> Kthehu te sporti
            </Link>
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
              Bilanci i llogarisë · i njëjti me sportin
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {GAMES.map((game) => (
              <Link key={game.id} to={`/casino/${game.id}`}
                className="group overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl transition hover:border-amber-400/70">
                <div className="flex items-center gap-3 border-b border-white/10 bg-[#111824] px-4 py-3">
                  {game.id === 'sizzling' && ORIGINAL_LOGOS.sizzling
                    ? <img className="h-11 max-w-36 object-contain" src={casinoAssetUrl(ORIGINAL_LOGOS.sizzling)} alt={game.title}/>
                    : game.id === 'bookofra'
                      ? <BookOpen size={26} className="text-amber-300"/>
                      : <Cherry size={26} className="text-rose-400"/>}
                  <div>
                    <h2 className="text-sm font-black sm:text-base">{game.title}</h2>
                    <p className="text-xs text-slate-400">{game.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-4 text-xs text-slate-400">
                  <span>Luaj me bilancin real</span>
                  <span className="rounded-lg bg-amber-400 px-3 py-2 font-bold text-black group-hover:bg-amber-300">Hap lojën</span>
                </div>
              </Link>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const game = (GAMES.find((g) => g.id === gameId)?.id ?? null) as CasinoGame | null;
  if (!game) return <Navigate to="/casino" replace />;
  const meta = GAMES.find((g) => g.id === game)!;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
      <Header />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-2 pb-12 pt-3 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/casino" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-[#1c2733] px-4 text-sm font-semibold text-slate-100 hover:bg-[#29394a]">
            <ArrowLeft size={17}/> Kazinoja
          </Link>
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
            Bilanci i llogarisë · i njëjti me sportin
          </div>
        </div>
        <section aria-label={meta.title} className="overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 bg-[#111824] px-3 py-3 sm:px-5">
            {game === 'sizzling' && ORIGINAL_LOGOS.sizzling
              ? <img className="h-11 max-w-36 object-contain sm:h-14 sm:max-w-52" src={casinoAssetUrl(ORIGINAL_LOGOS.sizzling)} alt={meta.title}/>
              : game === 'bookofra'
                ? <BookOpen size={26} className="text-amber-300"/>
                : <Cherry size={24} className="text-rose-400"/>}
            <div>
              <h1 className="text-sm font-black sm:text-lg">{meta.title}</h1>
              <p className="text-xs text-slate-400">{meta.subtitle} · bilanc real (jo kredite demo)</p>
            </div>
          </div>
          <CasinoOriginalWallet game={game} />
        </section>
      </main>
    </div>
  );
}
