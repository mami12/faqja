/** Conservative live settlement facts. A provider observation is evidence, not
 * a prediction. Unknown identity, clock, order or completeness => PENDING.
 * This module never updates tickets, balances or database state.
 */
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const number=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const yesNo=line=>{
 const label=norm(line.outcome_name??line.outcomeName??line.outcome_key??line.outcomeKey);
 if(['yes','po'].includes(label))return true;
 if(['no','jo'].includes(label))return false;
 return null;
};
const sideOf=v=>['1','home','home team','team 1'].includes(norm(v))?'home':['2','away','away team','team 2'].includes(norm(v))?'away':['none','no goal','no corner','no more goals','no more corners'].includes(norm(v))?'none':null;
const typeOf=name=>/\b(?:corners?|corner kicks?|kornera?)\b/.test(name)?'corner':
 /\b(?:goals?|scores?|golat?|gola?)\b/.test(name)?'goal':
 /\b(?:cards?|bookings?|kartona?)\b/.test(name)?'card':
 /\b(?:fouls?|faulle?)\b/.test(name)?'foul':null;
const nonNeg=v=>{const n=number(v);return n!==null&&Number.isInteger(n)&&n>=0?n:null;};
export function parseEventWindow(line,clock=null) {
 let name=norm(line.market_name??line.marketName??line.name);
 const kind=typeOf(name);
 if(!kind||!/minutes?|mins?|first \d+|next \d+|within|before|by the \d+/.test(name))return null;
 const choice=yesNo(line);if(choice===null)return null;
 let start,end;
 const fixed=name.match(/\b(?:minutes?|mins?)\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\b|\b(?:between|from)\s+(?:minutes?\s+)?(\d{1,3})\s*(?:and|to|[-–])\s*(\d{1,3})\b/);
 const first=name.match(/\b(?:first|opening)\s+(\d{1,3})\s+minutes?\b/);
 const by=name.match(/\b(?:by|before|until)\s+(?:the\s+)?(?:minute\s+)?(\d{1,3})(?:st|nd|rd|th)?(?:\s+minute)?\b/);
 const rolling=name.match(/\b(?:next|following)\s+(\d{1,2})\s+minutes?\b/);
 if(fixed){start=Number(fixed[1]??fixed[3]);end=Number(fixed[2]??fixed[4]);}
 else if(first){start=0;end=Number(first[1]);}
 else if(by){start=0;end=Number(by[1]);}
 else if(rolling){
  const current=number(clock);
  if(current===null||current<0||current>=130)return null;
  start=current;end=current+Number(rolling[1]);
 }else return null;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||start>=end||end>130)return null;
 // Freeze the window at selection acceptance. No later moving reference clocks.
 return {version:1,kind:'window',event:kind,from:start,to:end,choice,startExclusive:!!rolling,clockAtAcceptance:number(clock)};
}
export function parseSequenceBet(line,counts={}) {
 const name=norm(line.market_name??line.marketName??line.name);
 const event=/\bcorner/.test(name)?'corner':/\bgoal/.test(name)?'goal':null;
 if(!event)return null;
 const isNext=/^(?:next|who (?:scores|takes) (?:the )?next)\s+(?:goal|corner)\b|^(?:which team )?(?:scores|wins) next (?:goal|corner)/.test(name);
 const numbered=name.match(/^(?:(?:who (?:scores|takes) (?:the )?)|(?:which team (?:scores|wins) (?:the )?))?(\d+)(?:st|nd|rd|th)?\s+(?:goal|corner)\b|^(?:who (?:scores|takes) )?(?:goal|corner)\s*(\d+)\b/);
 const race=name.match(/\brace to (\d{1,3}) corners?\b/);
 if(!isNext&&!numbered&&!race)return null;
 const side=sideOf(line.outcome_name??line.outcomeName)??sideOf(line.outcome_key??line.outcomeKey);
 if(!side)return null;
 if(race){
  const threshold=Number(race[1]);
  if(!Number.isInteger(threshold)||threshold<1||threshold>100||side==='none')return null;
  return {version:1,kind:'race',event:'corner',target:threshold,side};
 }
 let target=numbered?Number(numbered[1]??numbered[2]):null;
 if(isNext){
  const c=counts[event];
  const home=nonNeg(c?.home),away=nonNeg(c?.away);
  if(home===null||away===null)return null;
  target=home+away+1;
 }
 if(!Number.isSafeInteger(target)||target<1||target>100)return null;
 return {version:1,kind:'sequence',event,target,side};
}
export function parseCountMarket(line) {
 const name=norm(line.market_name??line.marketName??line.name);
 const event=typeOf(name);
 if(!event||/\b(?:next|first|last|race|interval|minutes?|fouls? won|player|scorer|penalty|handicap|asian|odd|even|both|each)\b|[&+]/.test(name))return null;
 // Only explicit full-match aggregate count markets, never a team or half.
 if(!/^(?:(?:full time|match|total)\s+)?(?:total\s+)?(?:goals?|corners?|cards?|fouls?)(?:\s+(?:total|over\/under))?$/.test(name))return null;
 const rawLabel=norm(line.outcome_name??line.outcomeName??line.outcome_key);
 const numeric=nonNeg(line.line??line.specifier);
 const over=rawLabel.match(/^over(?:\s+(\d+(?:[.,]\d+)?))?$/);
 const under=rawLabel.match(/^under(?:\s+(\d+(?:[.,]\d+)?))?$/);
 if(over||under){const n=number((over??under)[1]?.replace(',','.')??numeric);if(n===null||n<0||n>300)return null;return {version:1,kind:over?'over':'under',event,threshold:n};}
 const exact=rawLabel.match(/^(?:exact(?:ly)?\s+)?(\d{1,3})$/);
 if(exact)return {version:1,kind:'exact',event,target:Number(exact[1])};
 const band=rawLabel.match(/^(\d{1,3})\s*(?:to|[-–])\s*(\d{1,3})$/);
 if(band&&Number(band[2])>=Number(band[1]))return {version:1,kind:'range',event,min:Number(band[1]),max:Number(band[2])};
 const plus=rawLabel.match(/^(\d{1,3})\s*(?:\+|or more)$/);
 if(plus)return {version:1,kind:'atLeast',event,target:Number(plus[1])};
 return null;
}
export const liveContract=(line,{counts={},clock=null}={})=>
 parseEventWindow(line,clock)??parseSequenceBet(line,counts)??parseCountMarket(line);

const sortEvents=(events,event)=>{
 const all=events.filter(e=>e.type===event&&e.disabled!==true&&e.cancelled!==true);
 const valid=all.every(e=>Number.isFinite(Number(e.minute))&&Number(e.minute)>=0&&
  (e.team==='home'||e.team==='away'||event==='card'||event==='foul'));
 if(!valid)return null;
 // Preserve explicit unique provider order where available. A same-minute
 // tie without sub-minute order cannot settle a sequence or race reliably.
 const ordered=[...all].sort((a,b)=>a.minute-b.minute||
  (Number.isFinite(a.seconds)&&Number.isFinite(b.seconds)?a.seconds-b.seconds:0));
 if(ordered.some((e,i)=>i&&e.minute===ordered[i-1].minute&&
  (!Number.isFinite(e.seconds)||!Number.isFinite(ordered[i-1].seconds)||e.seconds===ordered[i-1].seconds)))return {events:ordered,orderKnown:false};
 return {events:ordered,orderKnown:true};
};
const eventCount=(count,event)=>count?.[event];
const fullCoverage=(evidence,event,through)=>{
 const covered=number(evidence?.coverage?.[event+'Through']);
 return covered!==null&&covered>=through;
};
/** Returns WON, LOST or null. Never infers an absence from a missing event.
 * 'ended' requires a confirmed terminal feed phase, not wall-clock time.
 */
export function gradeLiveContract(contract,evidence={}, {ended=false,scopeEnded=false}={}){
 if(!contract||!['window','sequence','race','over','under','exact','range','atLeast'].includes(contract.kind))return null;
 const {event}=contract;
 const ordered=sortEvents(Array.isArray(evidence.events)?evidence.events:[],event);
 const clock=number(evidence.clock),count=number(eventCount(evidence.counts,event));
 if(contract.kind==='window'){
  if(!ordered)return null;
  // A positive event can be proven by an event that is individually verified.
  const relevant=ordered.events.filter(e=>(contract.startExclusive?Number(e.minute)>contract.from:Number(e.minute)>=contract.from)&&Number(e.minute)<=contract.to);
  if(relevant.length&&relevant.some(e=>fullCoverage(evidence,event,Number(e.minute))))return contract.choice?'WON':'LOST';
  if((scopeEnded||ended)&&fullCoverage(evidence,event,Math.min(contract.to,clock??contract.to)))return contract.choice?'LOST':'WON';
  if(clock!==null&&clock>contract.to&&fullCoverage(evidence,event,contract.to))return contract.choice?'LOST':'WON';
  return null;
 }
 if(contract.kind==='sequence'||contract.kind==='race'){
  if(!ordered?.orderKnown||clock===null||!fullCoverage(evidence,event,clock))return null;
  const relevant=ordered.events;
  if(contract.kind==='sequence'){
   const goal=relevant[contract.target-1];
   if(goal)return contract.side===goal.team?'WON':contract.side==='none'?'LOST':'LOST';
   return ended?contract.side==='none'?'WON':'LOST':null;
  }
  const teamCounts={home:0,away:0};let winner=null;
  for(const e of relevant){if(!['home','away'].includes(e.team))return null;teamCounts[e.team]++;
   if(teamCounts[e.team]===contract.target){winner=e.team;break;}}
  if(winner)return winner===contract.side?'WON':'LOST';
  return ended?'LOST':null;
 }
 if(count===null)return null;
 if(contract.kind==='over')return count>contract.threshold?'WON':(scopeEnded||ended)?'LOST':null;
 if(contract.kind==='under')return count>contract.threshold?'LOST':(scopeEnded||ended)?count===contract.threshold&&Number.isInteger(contract.threshold)?'VOID':'WON':null;
 if(contract.kind==='atLeast')return count>=contract.target?'WON':(scopeEnded||ended)?'LOST':null;
 if(contract.kind==='exact')return count>contract.target?'LOST':(scopeEnded||ended)?count===contract.target?'WON':'LOST':null;
 if(contract.kind==='range')return count>contract.max?'LOST':(scopeEnded||ended)?count>=contract.min?'WON':'LOST':null;
 return null;
}
