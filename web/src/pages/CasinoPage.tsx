import { ArrowLeft, BookOpen, Cherry } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import CasinoOriginalWallet, { type CasinoGame } from './CasinoOriginalWallet';
import { casinoAssetUrl } from './casinoOriginalArt';

type GameMeta = {
  id: CasinoGame | 'lucky-clover-x3';
  demo?: boolean;
  title: string;
  subtitle: string;
  logo: string;
  background: string;
};

const GAMES: GameMeta[] = [
  {
    id: 'lucky-clover-x3',
    title: 'Lucky Clover X3',
    subtitle: '5 lines · Wild x3 · Double Up · DEMO',
    logo: 'lucky-clover-x3/main/top_name.webp',
    background: 'lucky-clover-x3/main/background.webp',
    demo: true,
  },
  {
    id: 'sizzling',
    title: 'Sizzling Hot Deluxe',
    subtitle: '5 linja · fruta · Kuq/Zi',
    logo: 'sizzling/logo-alpha.png',
    background: 'sizzling/background.webp',
  },
  {
    id: 'bookofra',
    title: 'Book of Ra Deluxe',
    subtitle: '10 linja · Book wild · 10 free spins',
    logo: 'book-ra/logo-alpha.png',
    background: 'book-ra/background.webp',
  },
];

function GameArt({ game, className }: { game: GameMeta; className: string }) {
  return (
    <img
      src={casinoAssetUrl(game.logo)}
      alt={game.title}
      className={className}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

/**
 * Original cabinets: Novomatic games use the player's real account balance —
 * the same wallet used by sports betting. A game is only embedded after the
 * wallet session cookie has been verified against the /real/play endpoint.
 * Lucky Clover is a separately labelled demo with its own virtual-credit API.
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
              <Link
                key={game.id}
                to={`/casino/${game.id}`}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl transition hover:border-amber-400/80"
              >
                <div className="relative h-40 overflow-hidden sm:h-44">
                  <img
                    src={casinoAssetUrl(game.background)}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-300 group-hover:scale-105 group-hover:opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"/>
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-center px-4 pb-3">
                    <GameArt game={game} className="max-h-20 w-auto max-w-[85%] object-contain"/>
                  </div>
                  {game.id === 'bookofra'
                    ? <BookOpen size={18} className="absolute right-3 top-3 text-amber-300/80"/>
                    : <Cherry size={18} className="absolute right-3 top-3 text-rose-300/80"/>}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#111824] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-black sm:text-base">{game.title}</h2>
                    <p className="text-xs text-slate-400">{game.subtitle}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black group-hover:bg-amber-300">
                    Hap lojën
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            Sizzling Hot Deluxe dhe Book of Ra përdorin bilancin e llogarisë. Lucky Clover X3 është DEMO me kredite virtuale.
          </p>
        </main>
      </div>
    );
  }

  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return <Navigate to="/casino" replace />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
      <Header />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-2 pb-12 pt-3 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/casino" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-[#1c2733] px-4 text-sm font-semibold text-slate-100 hover:bg-[#29394a]">
            <ArrowLeft size={17}/> Kazinoja
          </Link>
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
            {game.demo ? 'DEMO · Virtual credits' : 'Bilanci i llogarisë · i njëjti me sportin'}
          </div>
        </div>

        <section aria-label={game.title} className="overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl">
          <div className="relative flex items-center gap-3 border-b border-white/10 px-3 py-3 sm:px-5">
            <img
              src={casinoAssetUrl(game.background)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
            <div className="relative flex items-center gap-3">
              <GameArt game={game} className="h-10 w-auto max-w-48 object-contain sm:h-12"/>
              <div>
                <h1 className="text-sm font-black sm:text-lg">{game.title}</h1>
                <p className="text-xs text-slate-300">{game.subtitle}{!game.demo && ' · bilanc real (jo kredite demo)'}</p>
              </div>
            </div>
          </div>
          {game.id === 'lucky-clover-x3' ? (
            <iframe
              title="Lucky Clover X3 — original client, demo"
              src={import.meta.env.BASE_URL + 'casino-original/lucky-clover-x3/index.html'}
              className="block h-[min(88vh,980px)] min-h-[580px] w-full border-0"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          ) : <CasinoOriginalWallet game={game.id} />}
        </section>
      </main>
    </div>
  );
}
