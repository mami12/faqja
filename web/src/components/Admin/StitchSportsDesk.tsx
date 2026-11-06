import { useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '../../api/client';
import ManualReviewQueue from './ManualReviewQueue';

type Review = { lineId: string; matchName: string; marketName: string; outcomeName: string; notificationActive: boolean; reason: string };
type DeskSection = { id: string; title: string; panel: () => ReactNode };
const explanations: Record<string,string> = {
 MISSING_EVENT_TIMELINE: 'Mungon kronologjia për të provuar këtë përzgjedhje.',
 CONFLICTING_API_STATISTICS: 'Burimet japin statistika që kundërshtojnë njëra-tjetrën.',
 MISSING_MARKET_STATISTICS: 'Mungojnë statistikat e kërkuara për këtë treg.',
 MISSING_FINAL_RESULT: 'Mungon rezultati përfundimtar i konfirmuar.',
 VOID_NEEDS_CONFIRMATION: 'Anulimi kërkon kontroll.',
};

export default function StitchSportsDesk({sections}:{sections:DeskSection[]}) {
 const [items,setItems]=useState<Review[]>([]);
 const [error,setError]=useState(false);
 const [active,setActive]=useState('');
 const [review,setReview]=useState<string|null>(null);
 useEffect(()=>{
  let mounted=true;
  async function refresh(){
   try {
    const {data}=await apiClient.get('/admin/settlement-review-queue',{params:{limit:100}});
    if(mounted){setItems(Array.isArray(data.items)?data.items:[]);setError(false);}
   }catch{if(mounted)setError(true);}
  }
  void refresh();
  const timer=window.setInterval(()=>void refresh(),15000);
  return ()=>{mounted=false;window.clearInterval(timer);};
 },[]);
 const notices=items.filter(item=>item.notificationActive);
 const section=sections.find(item=>item.id===active);
 return <section className="mx-auto max-w-7xl space-y-4 p-3 sm:p-6" aria-labelledby="stitch-heading">
  <header className="flex items-center gap-4 rounded-xl border border-tertiary bg-secondary p-4">
   <svg viewBox="0 0 120 100" className="h-20 w-24 shrink-0" role="img" aria-label="Maskota blu e Stitch">
    <g className="motion-safe:animate-pulse">
     <path d="M39 43Q8 8 4 26Q1 54 35 63M81 43Q112 8 116 26Q119 54 85 63" fill="#5488dc" stroke="#1e3976" strokeWidth="3"/>
     <path d="M30 51Q12 27 10 32Q12 48 30 55M90 51Q108 27 110 32Q108 48 90 55" fill="#d799cd"/>
     <ellipse cx="60" cy="59" rx="35" ry="28" fill="#5488dc" stroke="#1e3976" strokeWidth="3"/>
     <ellipse cx="44" cy="55" rx="11" ry="13" fill="#a7d7ff"/><ellipse cx="76" cy="55" rx="11" ry="13" fill="#a7d7ff"/>
     <circle cx="45" cy="56" r="6" fill="#172b54"/><circle cx="75" cy="56" r="6" fill="#172b54"/>
     <ellipse cx="60" cy="66" rx="9" ry="6" fill="#263d79"/><path d="M50 75Q60 83 70 75" fill="none" stroke="#263d79" strokeWidth="3" strokeLinecap="round"/>
    </g>
   </svg>
   <div><h2 id="stitch-heading" className="text-lg font-bold">Stitch · Sportbastet</h2><p className="text-sm">Njoftime dhe kontrolle të sportbasteve për adminin.</p></div>
  </header>
  {error&&<p role="alert">Njoftimet nuk u rifreskuan. Prova tjetër bëhet automatikisht.</p>}
  <section className="space-y-2" aria-label="Njoftime për verifikim">
   <h3 className="font-bold">Për verifikim ({notices.length})</h3>
   {!error&&!notices.length&&<p className="text-sm">S’ka njoftime aktive në listën e ngarkuar.</p>}
   {notices.map(item=><article key={item.lineId} className="space-y-2 rounded-xl border border-tertiary bg-secondary p-3">
    <h4 className="font-semibold">{item.matchName}</h4>
    <p className="text-sm">{item.marketName} · {item.outcomeName}</p>
    <p className="text-sm">{explanations[item.reason]??'Përzgjedhja kërkon verifikim manual.'}</p>
    <button type="button" className="min-h-11 rounded-lg border border-tertiary px-4" onClick={()=>{setActive('');setReview(item.lineId);}}>Kontrollo përzgjedhjen</button>
   </article>)}
  </section>
  <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Kontrollet e sportbasteve">
   {sections.map(item=><button key={item.id} type="button" aria-pressed={active===item.id} className="min-h-11 rounded-lg border border-tertiary bg-secondary px-4 text-left" onClick={()=>{setReview(null);setActive(item.id);}}>{item.title}</button>)}
  </nav>
  {review&&<ManualReviewQueue key={review} onlyLineId={review}/>}
  {section&&<div key={section.id}>{section.panel()}</div>}
 </section>;
}
