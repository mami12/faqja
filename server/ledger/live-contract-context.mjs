import {liveContract} from './live-contract-rules.mjs';
import {teamStatisticsFromRow} from '../match-statistics.mjs';
const safe=v=>v!=null&&v!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const time=v=>v!=null&&Number.isFinite(new Date(v).getTime())?new Date(v).getTime():null;
const fail=message=>Object.assign(new Error(message),{status:400,code:'MARKET_EVIDENCE_UNSUPPORTED'});
const eventish=name=>/\b(?:next|race to|(?:first|last|[1-9]\d*(?:st|nd|rd|th))\s+(?:goal|corner)|minutes?|mins?|within|before|after)\b/i.test(name);
/** Freeze what was actually offered at purchase, never derive a live target
 * from the scoreboard when the bet is paid or the page is refreshed.
 */
export function frozenLiveContract(line,match={},at=Date.now()){
 const teams=teamStatisticsFromRow(match);
 const clockMs=match.match_time_ms;
 const clock=Number.isFinite(Number(clockMs))&&clockMs!=null?Number(clockMs)/60000:null;
 const goals={home:safe(match.home_score),away:safe(match.away_score)};
 const corners={home:safe(teams.home?.corners),away:safe(teams.away?.corners)};
 // Resolve team-name outcomes against this exact fixture, never by fuzzy
 // prefixes or a team's position in another match.
 const norm=v=>String(v??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ').trim();
 const label=norm(line.outcome_name??line.outcomeName);
 const home=norm(match.home??match.home_team),away=norm(match.away??match.away_team);
 const selected=label&&home&&label===home?'1':label&&away&&label===away?'2':null;
 const prepared=selected?{...line,outcome_name:selected,outcomeName:selected}:line;
 const contract=liveContract(prepared,{clock,counts:{goal:goals,corner:corners}});
 const name=String(line.market_name??line.marketName??'');
 if(!contract){
  if(eventish(name))throw fail('Ky treg nuk ka kusht të verifikueshëm në këtë moment.');
  return null;
 }
 const live=String(match.service??'').toUpperCase()==='LIVE';
 const current=contract.event==='goal'?goals:contract.event==='corner'?corners:null;
 if(live&&(contract.kind==='sequence'||contract.kind==='race'||contract.kind==='window')){
  const observedAt=time(match.score_at);
  const clockAt=time(match.clock_at);
  if((contract.event==='goal'&&(goals.home==null||goals.away==null||observedAt===null))||
      clock===null||clockAt===null||at-clockAt>45000||clockAt-at>5000||
      (observedAt!==null&&(at-observedAt>90000||observedAt-at>5000)))throw fail('Të dhënat live nuk janë mjaftueshëm të freskëta.');
 }
 if(contract.kind==='sequence'&&current?.home!=null&&current?.away!=null&&
    contract.target<=current.home+current.away)throw fail('Goli/korneri i kërkuar ka ndodhur tashmë.');
 if(contract.kind==='race'&&corners.home!=null&&corners.away!=null&&
    (corners.home>=contract.target||corners.away>=contract.target))throw fail('Gara e kornerave ka përfunduar.');
 if(contract.kind==='window'&&clock!=null&&clock>contract.to)throw fail('Intervali i këtij tregu ka përfunduar.');
 // Live "Next Goal" needs *exactly* the current confirmed cumulative count.
 // Never infer it from the displayed odds or the browser's score.
 if(contract.kind==='sequence'&&/next/i.test(name)&&
    (current?.home==null||current?.away==null))throw fail('Mungon numri i konfirmuar i golave/kornerave.');
 return contract;
}
