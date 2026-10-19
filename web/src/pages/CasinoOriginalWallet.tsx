import {useEffect,useState} from 'react';
import {AlertTriangle,RefreshCw} from 'lucide-react';
import {apiClient} from '../api/client';
import {useAuth} from '../context/AuthContext';
import CasinoFullscreen from '../components/Layout/CasinoFullscreen';

/**
 * Original Pixi/Spine/Howler assets and controls. A short-lived HttpOnly
 * cookie bridges the Bearer-authenticated sportsbook wallet to same-origin
 * original game POST requests. React never calculates a monetary outcome.
 */
export default function CasinoOriginalWallet(){
  const {refreshUser}=useAuth();
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const connect=async()=>{
    setLoading(true);setError('');
    try{
      const response=await apiClient.post<{ready:boolean;gameUrl:string}>('/casino/session');
      if(!response.data.ready||!response.data.gameUrl.startsWith('/app/casino-original/sizzling/'))
        throw new Error('Game session unavailable');
      setUrl(response.data.gameUrl);
    }catch(e:any){
      setUrl('');
      setError(e.response?.data?.message||e.message||'Lidhja me portofolin dështoi');
    }finally{setLoading(false);}
  };
  useEffect(()=>{void connect();},[]);
  useEffect(()=>{
    // Keep the sports header synchronized while the embedded game is active.
    const id=window.setInterval(()=>void refreshUser().catch(()=>{}),15000);
    return()=>window.clearInterval(id);
  },[refreshUser]);
  if(loading)return <div role="status" className="flex min-h-56 items-center justify-center bg-black p-8 text-center text-amber-200">Po lidhet bilanci i përbashkët i kazinosë...</div>;
  if(error||!url)return <div className="flex min-h-56 flex-col items-center justify-center gap-4 bg-black p-8 text-center">
    <AlertTriangle className="text-amber-300" size={30}/>
    <p role="alert" className="text-sm text-rose-200">{error||'Loja nuk është e disponueshme'}</p>
    <button onClick={()=>void connect()} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 font-bold text-black"><RefreshCw size={16}/>Riprovo lidhjen</button>
  </div>;
  return <CasinoFullscreen>
    <iframe title="Sizzling Hot Deluxe · portofoli sport & kazino"
      src={url} className="block h-[min(84vh,920px)] min-h-[530px] w-full border-0"
      allow="autoplay; fullscreen" allowFullScreen/>
  </CasinoFullscreen>;
}
