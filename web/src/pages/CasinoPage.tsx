import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Cherry, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import CasinoOriginalWallet from './CasinoOriginalWallet';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { casinoAssetUrl, ORIGINAL_LOGOS } from './casinoOriginalArt';

type WalletStatus = {
  balance: number;
  realMoneyAvailable: boolean;
  enabled: boolean;
  deploymentEnabled: boolean;
  mathApproved: boolean;
};

/**
 * One game, one wallet. Never silently fall back to 100,000 demo credits.
 * Both sports bets and the Pixi Sizzling client operate on app_user.balance.
 */
export default function CasinoPage() {
  const { gameId } = useParams<{ gameId?: string }>();
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get<WalletStatus>('/casino/status');
      setStatus(response.data);
      await refreshUser();
    } catch (e: any) {
      setStatus(null);
      setError(e.response?.data?.message || 'Portofoli i sportit nuk u lidh me kazinonë.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadStatus(); }, []);

  if (gameId && gameId !== 'sizzling') return <Navigate to="/casino" replace />;

  const allowed = user?.role === 'PLAYER' && user?.status === 'ACTIVE' && status?.realMoneyAvailable;
  const balance = user?.balance ?? status?.balance ?? 0;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1018] text-white">
      <Header />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-2 pb-12 pt-3 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-[#1c2733] px-4 text-sm font-semibold text-slate-100 hover:bg-[#29394a]">
            <ArrowLeft size={17}/> Kthehu te sporti
          </Link>
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-300">
            <ShieldCheck size={15} className="text-emerald-300"/> Një bilanc: sport + kazino
          </div>
        </div>
        <section aria-label="Sizzling Hot Deluxe" className="overflow-hidden rounded-xl border border-amber-500/30 bg-black shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#111824] px-3 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              {ORIGINAL_LOGOS.sizzling ? (
                <img className="h-11 max-w-36 object-contain sm:h-14 sm:max-w-52"
                  src={casinoAssetUrl(ORIGINAL_LOGOS.sizzling)} alt="Sizzling Hot Deluxe"/>
              ) : <Cherry size={24} className="text-rose-400"/>}
              <div>
                <h1 className="text-sm font-black sm:text-lg">Sizzling Hot Deluxe</h1>
                <p className="text-xs text-slate-400">I njëjti bilanc si në faqen kryesore. Nuk ka kredite demo.</p>
              </div>
            </div>
            {user?.role === 'PLAYER' && (
              <div className="rounded-lg border border-amber-500/30 bg-black/60 px-3 py-2 text-right">
                <p className="text-[11px] text-amber-200">Bilanci sport + kazino</p>
                <p className="font-black tabular-nums text-amber-300">{Number(balance).toLocaleString('sq-AL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lek</p>
              </div>
            )}
          </div>
          {loading ? (
            <div role="status" className="grid min-h-[360px] place-items-center text-amber-200">Po lidhet bilanci i sportit...</div>
          ) : allowed ? <CasinoOriginalWallet /> : (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 px-5 text-center">
              <AlertTriangle size={28} className="text-amber-300"/>
              <h2 className="text-lg font-bold text-white">Sizzling Hot nuk mund të hapet me bilancin e sportit</h2>
              <p role="alert" className="max-w-xl text-sm text-slate-300">
                {error || (user?.role !== 'PLAYER'
                  ? 'Loja me bilanc është vetëm për llogaritë e lojtarëve.'
                  : user.status !== 'ACTIVE'
                    ? 'Llogaria nuk është aktive.'
                    : 'Operatori nuk e ka aktivizuar ende lojën me portofolin e përbashkët. Nuk do të kalosh automatikisht te demo.')}
              </p>
              <button type="button" onClick={() => void loadStatus()}
                className="min-h-11 rounded-lg bg-amber-400 px-5 font-bold text-black">Riprovo lidhjen</button>
            </div>
          )}
          <p className="px-3 py-3 text-xs text-slate-400 sm:px-5">
            Bastet dhe fitimet e Sizzling lëvizin vetëm në portofolin e basteve sportive.
            Asnjë portofol i veçantë apo bilanc demonstrimi nuk përdoret këtu.
          </p>
        </section>
      </main>
    </div>
  );
}
