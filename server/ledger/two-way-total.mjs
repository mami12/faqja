/** Settlement for TWO-WAY whole/half-number count totals.
 * Never treat a three-way Over/Exactly/Under market as a refundable Asian total.
 * Quarter lines need split-stake accounting and deliberately remain pending.
 */
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const numeric=value=>{
 if(value==null||typeof value==='boolean')return null;
 const raw=String(value).trim().replace(',','.');
 return /^(?:\d+)(?:\.\d+)?$/.test(raw)&&Number.isFinite(Number(raw))?Number(raw):null;
};
export function isThreeWayTotalMarket(name=''){
 const label=normalize(name);
 return /\b(?:3\s*[- ]?\s*way|three\s*[- ]?\s*way|over\s*\/\s*exactly\s*\/\s*under|over\s*\/\s*draw\s*\/\s*under)\b/.test(label);
}
export function overUnderSide(line={}){
 const candidates=[line.outcome_key,line.outcomeKey,line.outcome_name,line.outcomeName];
 let result=null;
 for(const candidate of candidates){
  const name=normalize(candidate);
  const side=/^(?:over|mbi|o)(?:\s|$)/.test(name)?'over':/^(?:under|nen|nën|u)(?:\s|$)/.test(name)?'under':null;
  if(side&&result&&side!==result)return null;
  if(side)result=side;
 }
 return result;
}
export function totalThreshold(line={}){
 for(const candidate of [line.line,line.specifier]){
  const n=numeric(candidate);if(n!==null)return n;
 }
 const label=normalize(line.outcome_name??line.outcomeName);
 const outcome=label.match(/^(?:over|under|mbi|nen|nën|o|u)\s+(\d+(?:[.,]\d+)?)$/);
 if(outcome)return numeric(outcome[1]);
 const market=normalize(line.market_name??line.marketName??line.name);
 const trailing=market.match(/(?:^|[ :(-])(?:over\s*\/\s*under\s*)?(\d+(?:[.,]\d+)?)\)?$/);
 return trailing?numeric(trailing[1]):null;
}
export function gradeCountTotal({count,threshold,side,marketName='',finished=true}={}){
 const n=numeric(count),target=numeric(threshold);
 if(!finished||n===null||target===null||!['over','under'].includes(side))return null;
 // Asian quarter lines can be half-won or half-lost. A single status cannot encode them.
 if(!Number.isInteger(target*2))return null;
 if(n===target){
  return Number.isInteger(target)&&!isThreeWayTotalMarket(marketName)?'VOID':'LOST';
 }
 return (side==='over'?n>target:n<target)?'WON':'LOST';
}
export function cardTotalScope(line={},teams={}){
 let name=normalize(line.market_name??line.marketName??line.name);
 if(/\b(?:yellow|red|player|first|last|next|minute|interval|half|period|asian|handicap|result|winner|most|both|each|points|booking points|3\s*way|3-way|three-way)\b|[&+]/.test(name))return null;
 name=name.replace(/^(?:full[ -]?time|match)\s*[-:.]?\s*/,'');
 name=name.replace(/\s*\(?\d+(?:[.,]\d+)?\)?\s*$/,'').replace(/^[ :.-]+|[ :.-]+$/g,'');
 const base=x=>/^(?:total\s+)?(?:cards?|bookings?)(?:\s+total)?$/.test(x);
 if(base(name))return 'total';
 const sides=[['home',['home','home team','team 1',normalize(teams.home_team??teams.homeTeam??teams.home)]],
 ['away',['away','away team','team 2',normalize(teams.away_team??teams.awayTeam??teams.away)]]];
 for(const [scope,aliases] of sides)for(const alias of aliases.filter(Boolean)){
  if(name.startsWith(alias+' ')&&base(name.slice(alias.length).replace(/^[: .-]+/,'')))return scope;
  if(name.endsWith(' '+alias)&&base(name.slice(0,-alias.length).replace(/[: .-]+$/,'')))return scope;
  if(name.startsWith('total '+alias+' ')&&base('total '+name.slice(('total '+alias).length).trim()))return scope;
 }
 return null;
}
