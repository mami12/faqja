import StitchSportsDesk from '../components/Admin/StitchSportsDesk';
import MarketCatalog from '../components/Admin/MarketCatalog';
import { useEffect,useState } from 'react';
import {apiClient} from '../api/client';
import ManualReviewQueue from '../components/Admin/ManualReviewQueue';
import Header from '../components/Layout/Header';
import AdminDashboard from '../components/Admin/AdminDashboard';
import UserManagement from '../components/Admin/UserManagement';
import MatchControl from '../components/Admin/MatchControl';
import BetBuilderManager from '../components/Admin/BetBuilderManager';
import LiveRiskManager from '../components/Admin/LiveRiskManager';
import TicketAudit from '../components/Admin/TicketAudit';
import { adminUiText } from '../components/Admin/adminUiCopy';
import { useLanguage } from '../context/LanguageContext';
import AdminAuditLog from '../components/Admin/AdminAuditLog';
import TransactionHistoryPage from './TransactionHistoryPage';
import CasinoFinanceCenter from '../components/Finance/CasinoFinanceCenter';
import CasinoSettings from '../components/Admin/CasinoSettings';
import FinancialReset from '../components/Admin/FinancialReset';
import BoardSettings from '../components/Admin/BoardSettings';
import MatchExposure from '../components/Admin/MatchExposure';
import { LayoutDashboard, Users, Trophy, Ticket, ClipboardList, Receipt, ShieldCheck, ChevronRight, Layers, ShieldAlert, Dices, BellRing } from 'lucide-react';

type AdminTab = 'match-exposure' | 'market-catalog' | 'dashboard' | 'users' | 'matches' | 'builders' | 'risk' | 'tickets' | 'transactions' | 'audit' | 'casino-finance' | 'casino-settings' | 'financial-reset' | 'board-settings' | 'manual-review' | 'sports-evidence' | 'sports-roadmap' | 'stitch';
const sections: { title: string; items: { id: AdminTab; label: string; description: string; icon: typeof Users }[] }[] = [
  {
    title: 'Puna e përditshme',
    items: [
      { id: 'dashboard', label: 'Paneli kryesor', description: 'Statistikat dhe financat', icon: LayoutDashboard },
      { id:'manual-review',label:'Njoftime: bileta për kontroll',description:'Të pavlefshme ose pa prova nga API-ja',icon:BellRing },
      { id:'stitch',label:'Stitch',description:'Njoftime dhe veprime për sportbastet',icon:BellRing },
      { id: 'tickets', label: 'Skedinat', description: 'Kontrolli i basteve', icon: Ticket },
      { id: 'users', label: 'Përdoruesit', description: 'Lojtarë, menaxherë dhe bilance', icon: Users },
    ],
  },
  {
    title: 'Sportbastet',
    items: [
      { id: 'matches', label: 'Ndeshjet dhe kuotat', description: 'Pezullime dhe ndryshime kuotash', icon: Trophy },
      {id:'market-catalog',label:'Tregjet dhe renditja',description:'Aktivizimi global dhe radha e tregjeve',icon:Layers},
      { id: 'risk', label: 'Menaxhimi i rrezikut', description: 'Mbyllja e tregjeve dhe kufijtë e basteve drejtpërdrejt', icon: ShieldAlert },
      { id: 'match-exposure', label: 'Bastet dhe verifikimi', description: 'Ekspozimi për ndeshje dhe vendime manuale', icon: ShieldAlert },
      { id: 'board-settings', label: 'Lista e ndeshjeve', description: 'Kufiri para fillimit dhe ligat kryesore', icon: Trophy },
      { id: 'builders', label: 'Kombinime ndeshjeje', description: 'Kombinime nga tregjet e ndeshjeve', icon: Layers },
      { id:'sports-evidence',label:'Tregje pa prova të plota',description:'Çfarë duhet për verifikimin e tregjeve sportive',icon:BellRing },
      { id:'sports-roadmap',label:'Plani i sportbasteve',description:'Punët e mbetura dhe rendi i zbatimit',icon:Layers },
    ],
  },
  {
    title: 'Financat dhe historiku',
    items: [
      { id: 'transactions', label: 'Transaksionet', description: 'Lëvizjet financiare', icon: Receipt },
      { id: 'audit', label: 'Regjistri', description: 'Historiku i veprimeve', icon: ClipboardList },
      { id: 'casino-finance', label: 'Financat Sport + Kazino', description: 'Përdoruesit, fitimet dhe humbjet', icon: Dices },
    ],
  },
  {
    title: 'Cilësime të avancuara',
    items: [
      { id: 'casino-settings', label: 'Cilësimet Kazino / RTP', description: 'Profile të verifikuara dhe aktivizimi', icon: Dices },
      { id: 'financial-reset', label: 'Zerimi financiar', description: 'Backup, bileta dhe bilance nga zero', icon: ShieldAlert },
    ],
  },
];
type ReviewNotice = {lineId:string;matchName:string;marketName:string;outcomeName:string;notificationActive:boolean};
const allItems = sections.flatMap(section => section.items);

export default function AdminPage() {
  const { t, lang } = useLanguage();
  const tr = (value: string) => adminUiText(value, lang);
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [reviewCount,setReviewCount]=useState(0);
  const [notices,setNotices]=useState<ReviewNotice[]>([]);
  const [reviewLine,setReviewLine]=useState<string|null>(null);
  const go=(next:AdminTab)=>{setReviewLine(null);setTab(next);};
  const [stitchCount,setStitchCount]=useState(0);
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{
      try{const res=await apiClient.get('/admin/settlement-review-queue',{params:{limit:200}});
        if(active){
          setReviewCount(Number(res.data?.notificationCount)||0);
          setNotices((Array.isArray(res.data?.items)?res.data.items:[]).filter((item:ReviewNotice)=>item.notificationActive).slice(0,5));
        }
      }catch{if(active)setReviewCount(0);}
    };
    const refreshStitch=async()=>{
      try{const res=await apiClient.get('/admin/live-event-test',{params:{summary:true}});
        if(active)setStitchCount(Number(res.data?.count)||0);
      }catch{if(active)setStitchCount(0);}
    };
    const refreshAll=()=>{void refresh();void refreshStitch();};
    refreshAll();
    const timer=window.setInterval(refreshAll,15000);
    return()=>{active=false;window.clearInterval(timer);};
  },[tab]);
  const active = allItems.find(item => item.id === tab)!;
  const ActiveIcon = active.icon;

  return (
    <div className="min-h-[100dvh] bg-primary flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0 w-full">
        <aside className="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col border-r border-tertiary bg-secondary/75 px-3 py-5">
          <div className="flex items-center gap-3 px-3 pb-6 border-b border-tertiary/70">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-accent-green/15 text-accent-green">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="font-black text-white">{tr("Administrimi")}</div>
              <div className="text-xs text-text-secondary">{tr("Qendra e kontrollit")}</div>
            </div>
          </div>
          <nav aria-label={tr("Menuja e administratorit")} className="mt-5 space-y-5">
            {sections.map(section => (
              <div key={section.title}>
                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-text-secondary">{tr(section.title)}</div>
                <div className="space-y-1">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    const selected = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={selected ? 'page' : undefined}
                        onClick={() => go(item.id)}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${selected ? 'bg-accent-green/15 text-accent-green ring-1 ring-accent-green/30' : 'text-text-secondary hover:text-white hover:bg-tertiary/70'}`}
                      >
                        <Icon size={19} className="shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold">{tr(item.label)}</span>
                          <span className="block truncate text-[11px] opacity-75">{tr(item.description)}</span>
                        </span>
                        {item.id==='manual-review'&&reviewCount>0&&<span className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white" aria-label={`${reviewCount} bileta për kontroll`}>{reviewCount}</span>}
                         {selected && <ChevronRight size={15} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="lg:hidden sticky top-0 z-20 border-b border-tertiary bg-secondary/95 backdrop-blur-md">
            <label className="block px-3 py-2 text-xs font-semibold">
              {tr("Menuja e administratorit")}
              <select className="mt-1 min-h-11 w-full rounded-lg border border-tertiary bg-primary px-3 text-sm text-white" value={tab} onChange={event=>go(event.target.value as AdminTab)}>
                {sections.map(section=><optgroup key={section.title} label={tr(section.title)}>
                  {section.items.map(item=><option key={item.id} value={item.id}>{tr(item.label)}{item.id==='manual-review'&&reviewCount>0?` (${reviewCount})`:''}</option>)}
                </optgroup>)}
              </select>
            </label>
          </div>
          <main className="min-w-0 pb-10">
            {tab!=='stitch'&&stitchCount>0&&<div className="mx-3 my-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-tertiary bg-secondary p-3">
              <p className="text-sm"><strong>Stitch</strong> · Serveri ka gjetur rezultat të mundshëm për {stitchCount} përzgjedhje.</p>
              <button type="button" onClick={()=>setTab('stitch')} className="min-h-11 rounded-lg border border-tertiary px-3">Shiko çfarë gjeti</button>
            </div>}
            {tab==='dashboard'&&notices.length>0&&<section aria-label="Bileta që kërkojnë kontroll" className="mx-3 my-3 space-y-2 rounded-xl border border-tertiary bg-secondary p-3">
              <h2 className="font-bold">Bileta që kërkojnë kontroll ({reviewCount})</h2>
              <ul className="divide-y divide-tertiary">
                {notices.map(item=><li key={item.lineId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0 break-words"><p className="font-semibold">{item.matchName}</p><p className="text-sm">{item.marketName} · {item.outcomeName}</p></div>
                  <button type="button" className="min-h-11 rounded-lg border border-tertiary px-3" onClick={()=>{setReviewLine(item.lineId);setTab('manual-review');}}>Kontrollo biletën</button>
                </li>)}
              </ul>
              {reviewCount>notices.length&&<button type="button" className="min-h-11 px-3 text-sm underline" onClick={()=>go('manual-review')}>Shiko të gjitha</button>}
            </section>}
            {tab !== 'matches' && tab !== 'dashboard' && <div className="mx-auto max-w-7xl px-3 pt-5 pb-1 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary border border-tertiary text-accent-green">
                  <ActiveIcon size={19} />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white">{tr(active.label)}</h1>
                  <p className="text-xs sm:text-sm text-text-secondary">{tr(active.description)}</p>
                </div>
              </div>
            </div>}
            {tab === 'dashboard' && <AdminDashboard />}
            {tab === 'users' && <UserManagement />}
            {tab === 'market-catalog' && <MarketCatalog />}
            {tab === 'matches' && <MatchControl />}
            {tab === 'board-settings' && <BoardSettings />}
            {tab === 'builders' && <BetBuilderManager />}
            {tab === 'risk' && <LiveRiskManager />}
            {tab === 'tickets' && <TicketAudit />}
             {tab === 'manual-review' && <>
               {reviewLine&&<button type="button" className="mx-3 min-h-11 rounded-lg border border-tertiary px-3" onClick={()=>setReviewLine(null)}>Shiko gjithë listën</button>}
               <ManualReviewQueue key={reviewLine??'all'} onlyLineId={reviewLine??undefined} />
             </>}
             {tab === 'stitch' && <StitchSportsDesk sections={[
               {id:'players',title:'Përdoruesit',panel:()=> <UserManagement />},
               {id:'transactions',title:'Transaksionet',panel:()=> <TransactionHistoryPage embedded />},
               {id:'tickets',title:'Biletat dhe historiku',panel:()=> <TicketAudit />},
               {id:'review',title:'Verifikimet e hapura',panel:()=> <ManualReviewQueue />},
               {id:'matches',title:'Ndeshjet',panel:()=> <MatchControl />},
               {id:'publication',title:'Publikimi live dhe prematch',panel:()=> <BoardSettings />},
               {id:'builders',title:'Kombinimet e tregjeve',panel:()=> <BetBuilderManager />},
               {id:'evidence',title:'Tregjet që kërkojnë prova shtesë',panel:()=> <MarketCatalog evidenceOnly />},
               {id:'markets',title:'Tregjet dhe koeficientët',panel:()=> <MarketCatalog />},
               {id:'exposure',title:'Ekspozimi i basteve',panel:()=> <MatchExposure />},
               {id:'risk',title:'Rreziku live',panel:()=> <LiveRiskManager />},
               {id:'audit',title:'Historiku i veprimeve',panel:()=> <AdminAuditLog />},
             ]}/>} 
             {tab === 'sports-roadmap' && (
               <section aria-labelledby="sports-roadmap-heading" className="mx-auto max-w-4xl space-y-4 p-3 sm:p-6">
                 <h2 id="sports-roadmap-heading" className="text-lg font-bold">Plani i sportbasteve</h2>
                 <ol className="list-decimal space-y-3 pl-6">
                   <li><strong>Verifiko tregjet dhe njoftimet në shfletues.</strong> Provo që tregu i fshehur refuzohet në një bast të ri dhe që një vendim manual prek vetëm përzgjedhjen e zgjedhur.</li>
                   <li><strong>Lidh API-në rezervë.</strong> Merr kronologjinë vetëm për ndeshjet dhe përzgjedhjet e prekura që presin verifikim.</li>
                   <li><strong>Mat mbulimin për ligat dhe tregjet.</strong> Kontrollo rendin dhe minutën e ngjarjeve, korrigjimet, intervalet dhe mospërputhjet e burimeve.</li>
                   <li><strong>Arkivo provën e çdo vendimi.</strong> Lidhe burimin, ngjarjen dhe arsyen me përzgjedhjen në historikun e biletës.</li>
                   <li><strong>Provo shlyerjen para aktivizimit.</strong> Krahaso parashikimet me feed real dhe verifiko që kombinimet paguhen vetëm sipas gjendjes së të gjitha përzgjedhjeve, pa kreditim të dyfishtë.</li>
                   <li><strong>Përfundo pastrimin e ndeshjeve pa bast.</strong> Hiq edhe rekordet e tepërta pa humbur përmbledhjen 48-orëshe te Favorites ose provat e biletave.</li>
                 </ol>
               </section>
             )}
             {tab === 'sports-evidence' && (
               <section aria-labelledby="sports-evidence-heading" className="space-y-3">
                 <h2 id="sports-evidence-heading" className="text-lg font-bold">Tregje pa prova të plota</h2>
                 <p className="text-sm">Këto përzgjedhje kërkojnë prova shtesë kur burimi aktual nuk mbulon kushtin e bastit. Biletat konkrete për kontroll gjenden te Njoftimet.</p>
                 <dl className="space-y-3">
                   <div><dt className="font-semibold">Goli ose korneri i radhës, gara deri në X kornera</dt><dd>Kur mungon rendi pas ndërprerjes, duhet kronologjia me skuadrën dhe rendin ose sekondat e ngjarjeve.</dd></div>
                   <div><dt className="font-semibold">Gol, korner ose karton në interval</dt><dd>Duhet minuta reale dhe skuadra kur tregu është sipas skuadrës. Për përgjigjen Jo duhet kronologjia e plotë deri në mbylljen e intervalit.</dd></div>
                   <div><dt className="font-semibold">Faulle dhe goditje në portë</dt><dd>Për totalet duhet numri i verifikuar për periudhën e tregut. Për intervalet duhet minuta e çdo ngjarjeje dhe, sipas tregut, skuadra.</dd></div>
                   <div><dt className="font-semibold">Ngjarje të anuluara ose burime kontradiktore</dt><dd>Duhet statusi i korrigjimit ose një vendim i dokumentuar i adminit për përzgjedhjen e prekur.</dd></div>
                 </dl>
                 <div className="space-y-1 text-sm">
                   <p><strong>Fshih tregun për baste të reja</strong> kur burimet aktuale nuk provojnë kushtin e tij. Për shembull, numri total i faulleve nuk mjafton për një bast mbi faullet në minutat 20–30.</p>
                   <p><strong>Mbaj aktiv tregun e verifikueshëm</strong> kur prova ekziston. Për shembull, një korner me minutë dhe skuadër nga burimi aktual mund të mbulojë kushtin përkatës, ndërsa mungesa e kornerit kërkon mbulim të plotë të intervalit.</p>
                   <p><strong>Rihape pas verifikimit</strong> të burimit për ligën dhe periudhën përkatëse, përfshirë rikuperimin pas ndërprerjes dhe korrigjimet. Biletat ekzistuese pa prova shkojnë për kontroll manual.</p>
                 </div>
                 <MarketCatalog evidenceOnly />
               </section>
             )}
            {tab === 'match-exposure' && <MatchExposure />}
            {tab === 'transactions' && <TransactionHistoryPage embedded />}
            {tab === 'audit' && <AdminAuditLog />}
            {tab === 'casino-finance' && <CasinoFinanceCenter role="admin" />}
            {tab === 'casino-settings' && <CasinoSettings />}
            {tab === 'financial-reset' && <FinancialReset />}
          </main>
        </div>
      </div>
    </div>
  );
}
