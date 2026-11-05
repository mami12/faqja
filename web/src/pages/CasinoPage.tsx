import { useLanguage } from '../context/LanguageContext';
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
  id: CasinoGame | 'prophecy-ra-demo';
  title: string;
  subtitle: string;
  logo: string;
  background: string;
  demo?: boolean;
};

const GAMES: (GameMeta & { id: CasinoGame })[] = [
  {id:'fortune-teller',title:'Fortune Teller',subtitle:'20 linja · 15/20/25 rrotullime falas · Tarot',logo:'fortune-teller/logo.png',background:'fortune-teller/background.jpg'},
  {id:'vikings-fun',title:"Viking's Fun",subtitle:'25 linja · 15 rrotullime falas · Dyfishim',logo:'vikings-fun/top_name.webp',background:'vikings-fun/background.webp'},
  {id:'fruit-queen',title:'Fruit Queen',subtitle:'18 linja · Dyfishim',logo:'fruit-queen/top.webp',background:'fruit-queen/emptyback.jpg'},
  {id:'seven-hot',title:'Seven Hot',subtitle:'20 linja · Dyfishim',logo:'seven-hot/top.webp',background:'seven-hot/emptyback.jpg'},
  {id:'firejoker',title:'Fire Joker',subtitle:'5 linja · 10 free-spins · Slotopol',logo:'firejoker/logo-atlas.png',background:'firejoker/background.jpg'},
  {
    id: 'lucky-clover-x3',
    title: 'Lucky Clover X3',
    subtitle: '5 linja · Simbol zëvendësues x3 · Dyfishim',
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
    subtitle: '10 linja · Libri zëvendësues · 10 rrotullime falas',
    logo: 'book-ra/logo-alpha.png',
    background: 'book-ra/background.webp',
  },
];

const DEMO_GAME: GameMeta = {
  id: 'prophecy-ra-demo',
  title: 'Prophecy of Ra · Demo',
  subtitle: '13 linja · Rrotullime falas · Kredi virtuale',
  logo: 'prophecy-ra-demo/assets/card/logo.webp',
  background: 'prophecy-ra-demo/assets/card/background.webp',
  demo: true,
};
const ALL_GAMES = [...GAMES, DEMO_GAME];

function GameArt({ game, className }: { game: GameMeta; className: string }) {
  if(game.id==='fortune-teller')return <span role="img" aria-label={game.title} className={'block h-[74px] w-[210px] max-w-[85%] shrink-0 bg-left-top bg-no-repeat '+className} style={{backgroundImage:`url("${casinoAssetUrl(game.logo)}")`,backgroundSize:'535px auto'}}/>;
  if (game.id === 'firejoker') return <span role="img" aria-label={game.title} className={'block h-10 w-[210px] max-w-[85%] shrink-0 bg-left-top bg-no-repeat '+className}
    style={{ backgroundImage: `url("${casinoAssetUrl(game.logo)}")`, backgroundSize: '255px auto' }} />;
  return (
    <img
      src={game.demo ? '/app/casino-original/prophecy-ra-demo/assets/card/logo.webp' : casinoAssetUrl(game.logo)}
      alt={game.title}
      className={className}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

/** Original provider cabinets connected to the shared sportsbook wallet. */
export default function CasinoPage() {
  const { t } = useLanguage();
  const { gameId } = useParams<{ gameId?: string }>();
  const navigate=useNavigate(),{refreshUser}=useAuth();
  const exitGame=useMemo(()=>createCasinoExitController({
    releaseDisplay:()=>releaseCasinoLandscape({keepSession:true}),
    closeWallet:()=>apiClient.post(['lucky-clover-x3','vikings-fun','fruit-queen','seven-hot','firejoker','fortune-teller'].includes(gameId||'')?'/casino/original/'+gameId+'/close':'/casino/original/pixi/close',{},{timeout:5000,validateStatus:status=>status===401||(status>=200&&status<300)}),
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
              <ArrowLeft size={17}/> {" " + t("Kthehu te sporti")}</Link>
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
              {t("Lojërat me wallet përdorin të njëjtin bilanc me sportin")}</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {ALL_GAMES.map((game) => (
              <Link
                key={game.id}
                to={`/casino/${game.id}`}
                onClick={()=>{void requestCasinoLandscape();}}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl transition hover:border-amber-400/80"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <img
                    src={game.demo ? '/app/casino-original/prophecy-ra-demo/assets/card/background.webp' : casinoAssetUrl(game.background)}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-300 group-hover:scale-105 group-hover:opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"/>
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-center px-4 pb-3">
                    <GameArt game={game} className="max-h-20 w-auto max-w-[85%] object-contain"/>
                  </div>
                  {game.demo
                    ? <span className="absolute right-3 top-3 rounded-sm border border-amber-300/70 bg-black/75 px-2 py-1 text-[10px] font-black text-amber-200">DEMO</span>
                    : game.id === 'bookofra'
                    ? <BookOpen size={18} className="absolute right-3 top-3 text-amber-300/80"/>
                    : <Cherry size={18} className="absolute right-3 top-3 text-rose-300/80"/>}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#111824] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-black sm:text-base">{game.title}</h2>
                    <p className="truncate text-xs text-slate-400">{game.subtitle}</p>
                  </div>
                  <span className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-amber-400 px-3 text-xs font-bold text-black group-hover:bg-amber-300">
                    {t("Hap lojën")}</span>
                </div>
              </Link>
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            {t("Prophecy of Ra Demo përdor vetëm kredi virtuale dhe nuk lidhet me bilancin e llogarisë.")}</p>
        </main>
      </div>
    );
  }

  if (gameId === DEMO_GAME.id) {
    return <CasinoFullscreen key={DEMO_GAME.id} title={DEMO_GAME.title} onExit={() => navigate('/casino')}>
      <div className="flex h-full min-h-0 flex-col bg-black">
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-300/30 bg-[#17130d] px-3 py-2 text-center text-xs font-bold text-amber-100">
          <span className="rounded-sm bg-amber-300 px-1.5 py-0.5 text-[9px] font-black text-black">DEMO</span>
          <span>{t('Kredi virtuale · Nuk përdor bilancin e llogarisë')}</span>
        </div>
        <iframe
          title="Prophecy of Ra Demo"
          src="/app/casino-original/prophecy-ra-demo/src/index.html"
          allow="autoplay; fullscreen"
          className="min-h-0 w-full flex-1 border-0 bg-black"
        />
      </div>
    </CasinoFullscreen>;
  }

  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return <Navigate to="/casino" replace />;

  return <CasinoFullscreen key={game.id} title={game.title} onExit={exitGame}>
    <CasinoOriginalWallet game={game.id}/>
  </CasinoFullscreen>;
}
