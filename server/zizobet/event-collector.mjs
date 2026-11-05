import {eventWatchIds,saveEventEvidence,normalizeEvents} from '../ledger/event-evidence.mjs';
const json=async url=>{const r=await fetch(url,{headers:{origin:'https://googstreams.com',referer:'https://googstreams.com/'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Tracker HTTP '+r.status);return r.json();};
const available=r=>r?.data?.status?.status==='AVAILABLE';
/** No browser or Sportradar requests; bounded to fixtures with pending tickets. */
export function createEventCollector({getWatchIds=eventWatchIds,save=saveEventEvidence,request=json,now=Date.now,refreshMs=15000,maxActive=3}={}){
 let active=0;const last=new Map(),inflight=new Set();
 return async function collectEventEvidence(row,data){
  const id=String(row.match_id);
  if(!(await getWatchIds()).has(id)||inflight.has(id)||active>=maxActive)return;
  if(now()-(last.get(id)??-Infinity)<refreshMs)return;
  inflight.add(id);active++;last.set(id,now());if(last.size>3000)last.delete(last.keys().next().value);
  try{
   let evidence=normalizeEvents(data,'zizobet');const game=data.Match??{};
   const bg=game.bgenid??String(game.lsUrl??'').match(/fixtureId=(\d+)/)?.[1];
   if(/^\d+$/.test(String(bg??''))){try{
    const base='https://gsm-widgets.betstream.betgenius.com/v1/widget/',tail='/customer/googstreams/locale/any/geolocale/any-?fixtureId='+bg;
    const [play,board,stats]=await Promise.all(['playByPlay','multisportscoreboardwidget','teamStats'].map(k=>request(base+k+tail)));
    const b=board.data?.details,periods=play.data?.details?.playByPlayInfo;
    if(available(play)&&available(board)&&b?.homeTeam?.competitorId!=null&&b?.awayTeam?.competitorId!=null&&periods&&typeof periods==='object'){
     const payload=normalizeEvents(play,'betgenius');
     for(const e of payload.events)e.team=String(e.team)===String(b.homeTeam.competitorId)?'home':String(e.team)===String(b.awayTeam.competitorId)?'away':null;
     payload.stats=available(stats)?stats.data?.details?.stats??[]:[];
     payload.final=/^(?:finished|ended|complete|completed|postmatch)$/i.test(String(b.matchSummaries?.matchStatus??''));
     payload.complete=payload.final&&Array.isArray(periods.H1)&&Array.isArray(periods.H2);
     // The live Zizobet timeline can prove a completed corner window against
     // its own corner counters. Do not replace that proof with an incomplete
     // secondary play-by-play response; completed final sources still win.
     if(payload.complete||evidence.coverage?.cornersThrough==null)evidence=payload;
    }
   }catch{/* An unavailable secondary source is not evidence of zero events. */}}
   await save(row.match_id,evidence);
  }finally{inflight.delete(id);active--;}
 };
}
export const collectEventEvidence=createEventCollector();
