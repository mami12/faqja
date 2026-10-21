import CasinoFullscreen,{requestCasinoLandscape,releaseCasinoLandscape} from '../components/Layout/CasinoFullscreen';
import {useMemo} from 'react';
import {createCasinoExitController} from './casinoExit';
import {apiClient} from '../api/client';
import {useAuth} from '../context/AuthContext';
import { ArrowLeft, BookOpen, Cherry } from 'lucide-react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import CasinoOriginalWallet, { type CasinoGame } from './CasinoOriginalWallet';
import { casinoAssetUrl } from './casinoOriginalArt';

type GameMeta = {
  id: CasinoGame;
  title: string;
  subtitle: string;
  logo: string;
  background: string;
};

const GAMES: GameMeta[] = [
  {id:'vikings-fun',title:"Viking's Fun",subtitle:'25 lines · 15 free games · Double Up',logo:'vikings-fun/top_name.webp',background:'vikings-fun/background.webp'},
  {id:'fruit-queen',title:'Fruit Queen',subtitle:'18 lines · Double Up',logo:'fruit-queen/top.webp',background:'fruit-queen/emptyback.jpg'},
  {id:'seven-hot',title:'Seven Hot',subtitle:'20 lines · Double Up',logo:'seven-hot/top.webp',background:'seven-hot/emptyback.jpg'},
  {
    id: 'lucky-clover-x3',
    title: 'Lucky Clover X3',
    subtitle: '5 lines · Wild x3 · Double Up',
    logo: 'lucky-clover-x3/main/top_name.webp',
    background: 'lucky-clover-x3/main/background.webp',

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

/** Original provider cabinets connected to the shared sportsbook wallet. */
export default function CasinoPage() {
  const { gameId } = useParams<{ gameId?: string }>();
  const navigate=useNavigate(),{refreshUser}=useAuth();
  const exitGame=useMemo(()=>createCasinoExitController({
    releaseDisplay:()=>releaseCasinoLandscape({keepSession:true}),
    closeWallet:()=>apiClient.post(['lucky-clover-x3','vikings-fun','fruit-queen','seven-hot'].includes(gameId||'')?'/casino/original/'+gameId+'/close':'/casino/original/pixi/close',{},{timeout:5000,validateStatus:status=>status===401||(status>=200&&status<300)}),
    refreshWallet:refreshUser,
    navigate:()=>navigate('/casino'),
  }),[gameId,navigate,refreshUser]);

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
                onClick={()=>{void requestCasinoLandscape();}}
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
            Të gjitha lojërat përdorin të njëjtin bilanc me sport betting.
          </p>
        </main>
      </div>
    );
  }

  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return <Navigate to="/casino" replace />;

  return <CasinoFullscreen key={game.id} title={game.title} onExit={exitGame}>
    <CasinoOriginalWallet game={game.id}/>
  </CasinoFullscreen>;
}
