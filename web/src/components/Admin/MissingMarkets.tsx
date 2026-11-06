import {useEffect,useState} from 'react';
import {apiClient} from '../../api/client';
import {eventMarketRequirement} from '../../../../server/ledger/event-market-policy.mjs';
import {statisticMarketContract} from '../../../../server/ledger/statistic-markets.mjs';

type Market = {key:string;name:string};
const reasons:Record<string,string>={
 PLAYER_EVENT_DATA_REQUIRED:'Duhen prova për lojtarin, për shembull kush shënoi ose kush bëri faull.',
 TIMED_EVENT_DATA_REQUIRED:'Duhen minuta reale dhe lista e plotë e ngjarjeve për intervalin.',
 EVENT_SEQUENCE_DATA_REQUIRED:'Duhet rendi i konfirmuar i ngjarjeve dhe një rregull i verifikuar shlyerjeje.',
 GOAL_CONTRACT_DATA_REQUIRED:'Duhet provë për llojin e golit ose për kushtin e tregut.',
 UNSUPPORTED_STAT:'Duhet statistikë e verifikuar për këtë lojtar, skuadër ose periudhë.',
};
export default function MissingMarkets(){
 const [markets,setMarkets]=useState<Market[]|null>(null);
 const [error,setError]=useState(false);
 const [search,setSearch]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  apiClient.get<{markets:Market[]}>('/admin/market-catalog',{signal:controller.signal})
   .then(({data})=>{if(!controller.signal.aborted)setMarkets(Array.isArray(data.markets)?data.markets:[]);})
   .catch(()=>{if(!controller.signal.aborted)setError(true);});
  return ()=>controller.abort();
 },[]);
 const missing=(markets??[]).flatMap(market=>{
  const stats=statisticMarketContract(market);
  const reason=eventMarketRequirement(market)??(stats&&!stats.supported?'UNSUPPORTED_STAT':null);
  return reason?[{...market,reason}]:[];
 });
 const visible=missing.filter(market=>market.name.toLowerCase().includes(search.trim().toLowerCase()));
 return <section className="space-y-2" aria-labelledby="missing-market-list">
  <h3 id="missing-market-list" className="font-bold">Tregje nga katalogu që kërkojnë prova ({missing.length})</h3>
  <p className="text-sm">Këto tregje kërkojnë kontroll shtesë. Mbulimi mund të ndryshojë sipas ndeshjes dhe burimit.</p>
  <label className="block text-sm">Kërko tregun
   <input className="mt-1 block min-h-11 w-full rounded-lg border border-tertiary bg-secondary px-3" value={search} onChange={event=>setSearch(event.target.value)} />
  </label>
  {error?<p role="alert">Lista nuk u ngarkua.</p>:!markets?<p>Po ngarkoj tregjet…</p>:
   !visible.length?<p>Nuk u gjet asnjë treg për këtë kërkim.</p>:
   <ul className="divide-y divide-tertiary rounded-lg border border-tertiary bg-secondary p-3">
    {visible.map(market=><li key={market.key} className="break-words py-2">
     <strong>{market.name}</strong><p className="text-sm">{reasons[market.reason]??market.reason}</p>
    </li>)}
   </ul>}
 </section>;
}
