/**
 * Explicit result/count propositions which do NOT require an event timeline.
 * FT counters and 1H scores must be externally verified before the caller
 * may grade. Unrecognised names, outcomes, periods or missing fields => null.
 *
 * No market-label heuristics are allowed to reinterpret an offered selection.
 * This intentionally excludes early payout, Asian quarter lines, corners race,
 * minutes, players, bookings points, extra time and shootouts.
 */
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/g,' ').trim();
const whole=value=>{
 if(value==null||value===''||!/^\d{1,3}$/.test(String(value).trim()))return null;
 return Number(value);
};
const num=value=>{
 if(value==null||value===''||!/^\d+(?:[.,]\d+)?$/.test(String(value).trim()))return null;
 return Number(String(value).replace(',','.'));
};
const values=line=>[line?.outcome_key,line?.outcome_name].map(fold).filter(Boolean);
const victory=(a,b)=>a>b?'home':a<b?'away':'draw';
const decide=truth=>truth?'WON':'LOST';
const yesNo=line=>{
 for(const v of values(line)){
  if(['yes','po'].includes(v))return true;
  if(['no','jo'].includes(v))return false;
 }
 return null;
};
const side=(v,result)=>{
 if(['1','home','home team','team 1'].includes(v)||result?.home_team&&v===fold(result.home_team))return 'home';
 if(['2','away','away team','team 2'].includes(v)||result?.away_team&&v===fold(result.away_team))return 'away';
 if(['x','draw','tie','barazim'].includes(v))return 'draw';
 return null;
};
const outcomeSide=(line,result)=>{
 for(const v of values(line)){const s=side(v,result);if(s)return s;}
 return null;
};
const scope=(name,result)=>{
 const v=fold(name);
 if(/\b(?:home(?: team)?|team 1)\b/.test(v)||result?.home_team&&v.includes(fold(result.home_team)))return 'home';
 if(/\b(?:away(?: team)?|team 2)\b/.test(v)||result?.away_team&&v.includes(fold(result.away_team)))return 'away';
 return null;
};
const scores=result=>{
 const h=whole(result?.home_score),a=whole(result?.away_score);
 return h==null||a==null?null:{home:h,away:a};
};
const halfScores=result=>{
 const h=whole(result?.half_home_score),a=whole(result?.half_away_score);
 return h==null||a==null?null:{home:h,away:a};
};
const secondScores=result=>{
 const full=scores(result),half=halfScores(result);
 if(!full||!half||half.home>full.home||half.away>full.away)return null;
 return {home:full.home-half.home,away:full.away-half.away};
};
const corners=result=>{
 const home=whole(result?.corners_home),away=whole(result?.corners_away);
 return home==null||away==null?null:{home,away};
};
const cards=result=>{
 const home=whole(result?.cards_home),away=whole(result?.cards_away);
 return home==null||away==null?null:{home,away};
};
const periodPrefix='(?:1st|first|2nd|second)';
const excluded=/(?:\b(?:early payout|asian|handicap|booking points|player|scorer|minutes?|interval|first to|race|next|method|shootout|penalty|extra time|overtime)\b)/;
export function aggregateOutcomeFamily(marketName=''){
 const name=fold(marketName).replace(/[–—]/g,'-');
 if(!name||excluded.test(name))return null;
 if(/^(?:2nd|second) half[ .:-]+(?:result|1x2|winner)$/.test(name))return 'SECOND_HALF_RESULT';
 if(/^(?:2nd|second) half[ .:-]+(?:double chance)$/.test(name))return 'SECOND_HALF_DC';
 if(/^(?:2nd|second) half[ .:-]+(?:both teams to score|btts)$/.test(name))return 'SECOND_HALF_BTTS';
 if(/^(?:2nd|second) half[ .:-]+(?:(?:total )?goals?|total)(?:[ .:-]+(?:over\s*\/\s*under))?$/.test(name))return 'SECOND_HALF_TOTAL';
 if(/^(?:(?:1st|first|2nd|second) half)[ .:-]+(?:correct|exact) score$/.test(name))
  return /^(?:1st|first)/.test(name)?'FIRST_HALF_SCORE':'SECOND_HALF_SCORE';
 if(/^(?:home(?: team)?|away(?: team)?|team [12]) (?:to keep a )?clean sheet$/.test(name)||
    /^clean sheet (?:home(?: team)?|away(?: team)?|team [12])$/.test(name))return 'CLEAN_SHEET';
 if(/^(?:home(?: team)?|away(?: team)?|team [12]) to win to nil$/.test(name))return 'TEAM_WIN_TO_NIL';
 if(/^(?:(?:full time|match) )?(?:win to nil|winning to nil)$/.test(name))return 'WIN_TO_NIL';
 if(/^(?:(?:full time|match) )?(?:winning margin|margin of victory)$/.test(name))return 'WINNING_MARGIN';
 if(/^(?:(?:full time|match) )?(?:total goals|goals total|goals?)\s*(?:\((?:exact|bands|range|multi[- ]?goals)\)|(?:exact|bands|range|multi[- ]?goals))$/.test(name)||
    /^(?:exact(?:ly)? (?:number of )?goals|total (?:number of )?goals exact)$/.test(name))return 'TOTAL_GOALS_BAND';
 if(/^(?:(?:full time|match) )?(?:(?:corners?|corner kicks?)\s*(?:1x2|result)|(?:corner|corners?)\s+1\s*x\s*2)$/.test(name))return 'CORNERS_1X2';
 if(/^(?:(?:full time|match) )?(?:total )?(?:corners?|corner kicks?)\s*(?:odd\s*\/\s*even|even\s*\/\s*odd)$/.test(name))return 'CORNERS_ODD_EVEN';
 if(/^(?:(?:full time|match) )?(?:(?:total )?corners?|corner kicks?)(?:\s*(?:\((?:exact|bands|range)\)|(?:exact|bands|range)))$/.test(name))
  return 'CORNERS_BAND';
 if(/^(?:(?:full time|match) )?(?:total )?cards?\s*(?:odd\s*\/\s*even|even\s*\/\s*odd)$/.test(name))return 'CARDS_ODD_EVEN';
 if(/^(?:(?:full time|match) )?(?:total )?cards?(?:\s*(?:\((?:exact|bands|range)\)|(?:exact|bands|range)))$/.test(name))
  return 'CARDS_BAND';
 return null;
}
const scoreSelection=line=>{
 for(const v of values(line)){
  const m=v.match(/^(\d{1,2})\s*[:\-]\s*(\d{1,2})$/);
  if(m)return {home:Number(m[1]),away:Number(m[2])};
 }
 return null;
};
const bandSelection=line=>{
 for(const v of values(line)){
  let m=v.match(/^(?:exact(?:ly)?\s+)?(\d{1,3})$/);
  if(m)return {type:'exact',target:Number(m[1])};
  m=v.match(/^(\d{1,3})\s*(?:-|to|or|through)\s*(\d{1,3})$/);
  if(m&&Number(m[1])<=Number(m[2]))return {type:'range',min:Number(m[1]),max:Number(m[2])};
  m=v.match(/^(\d{1,3})\s*(?:\+|or more|and over)$/);
  if(m)return {type:'min',min:Number(m[1])};
 }
 return null;
};
const oddEven=line=>{
 for(const v of values(line)){
  if(['odd','tek'].includes(v))return 1;
  if(['even','cift','çift'].includes(v))return 0;
 }
 return null;
};
const totalChoice=line=>{
 for(const v of values(line)){
  const m=v.match(/^(over|under)\s*(\d+(?:[.,]\d+)?)?$/);
  if(!m)continue;
  const n=num(m[2]??line.line??line.specifier);
  if(n!=null&&Number.isInteger(n*2))return {kind:m[1],line:n};
 }
 return null;
};
const gradeTotal=(count,choice)=>{
 if(!choice)return null;
 if(count===choice.line&&Number.isInteger(choice.line))return 'VOID';
 return decide(choice.kind==='over'?count>choice.line:count<choice.line);
};
const gradeBand=(count,choice)=>{
 if(!choice)return null;
 if(choice.type==='exact')return decide(count===choice.target);
 if(choice.type==='range')return decide(count>=choice.min&&count<=choice.max);
 if(choice.type==='min')return decide(count>=choice.min);
 return null;
};
const gradeDC=(line,score)=>{
 for(const v of values(line)){
  if(v==='1x'||v==='homeordraw')return decide(score.home>=score.away);
  if(v==='x2'||v==='draworaway')return decide(score.away>=score.home);
  if(v==='12'||v==='homeoraway')return decide(score.home!==score.away);
 }
 return null;
};
const requireEvidence=(family,result)=>{
 if(['CORNERS_1X2','CORNERS_ODD_EVEN','CORNERS_BAND'].includes(family))return corners(result)!=null;
 if(['CARDS_ODD_EVEN','CARDS_BAND'].includes(family))return cards(result)!=null;
 if(['SECOND_HALF_RESULT','SECOND_HALF_DC','SECOND_HALF_BTTS','SECOND_HALF_TOTAL','SECOND_HALF_SCORE'].includes(family))return secondScores(result)!=null;
 if(family==='FIRST_HALF_SCORE')return halfScores(result)!=null;
 return scores(result)!=null;
};
export function hasAggregateOutcomeEvidence(line,result){
 const family=aggregateOutcomeFamily(line?.market_name);
 return family!==null&&requireEvidence(family,result);
}
/** Verified aggregate grading only. Null is PENDING, not VOID or LOST. */
export function gradeAggregateOutcome(line,result){
 const family=aggregateOutcomeFamily(line?.market_name);
 if(!family||!requireEvidence(family,result))return null;
 const ft=scores(result),second=secondScores(result),half=halfScores(result),corner=corners(result),card=cards(result);
 if(family==='SECOND_HALF_RESULT') {
  const selected=outcomeSide(line,result);
  return selected?decide(selected===victory(second.home,second.away)):null;
 }
 if(family==='SECOND_HALF_DC')return gradeDC(line,second);
 if(family==='SECOND_HALF_BTTS'){
  const selected=yesNo(line);
  return selected===null?null:decide((second.home>0&&second.away>0)===selected);
 }
 if(family==='SECOND_HALF_TOTAL')return gradeTotal(second.home+second.away,totalChoice(line));
 if(family==='FIRST_HALF_SCORE'||family==='SECOND_HALF_SCORE'){
  const selected=scoreSelection(line),actual=family==='FIRST_HALF_SCORE'?half:second;
  return selected?decide(selected.home===actual.home&&selected.away===actual.away):null;
 }
 if(family==='CLEAN_SHEET'||family==='TEAM_WIN_TO_NIL'){
  const selected=scope(line.market_name,result),choice=yesNo(line);
  if(!selected||choice===null)return null;
  const trueCondition=family==='CLEAN_SHEET'?
   (selected==='home'?ft.away===0:ft.home===0):
   (selected==='home'?ft.home>ft.away&&ft.away===0:ft.away>ft.home&&ft.home===0);
  return decide(trueCondition===choice);
 }
 if(family==='WIN_TO_NIL'){
  const selected=outcomeSide(line,result);
  if(!selected)return null;
  const winner=ft.home>ft.away&&ft.away===0?'home':
   ft.away>ft.home&&ft.home===0?'away':'draw';
  return decide(winner===selected);
 }
 if(family==='WINNING_MARGIN'){
  let prediction=null;
  for(const value of values(line)){
   if(['draw','x','tie'].includes(value)){prediction={side:'draw'};break;}
   const m=value.match(/^(home|away|1|2)\s+by\s+(\d{1,2})(\+)?(?:\s+goals?)?$/);
   if(m){prediction={side:['home','1'].includes(m[1])?'home':'away',
    amount:Number(m[2]),atLeast:!!m[3]};break;}
  }
  if(!prediction)return null;
  if(prediction.side==='draw')return decide(ft.home===ft.away);
  const margin=prediction.side==='home'?ft.home-ft.away:ft.away-ft.home;
  return decide(prediction.atLeast?margin>=prediction.amount:margin===prediction.amount);
 }
 if(family==='TOTAL_GOALS_BAND')return gradeBand(ft.home+ft.away,bandSelection(line));
 if(family==='CORNERS_1X2'){
  const selected=outcomeSide(line,result);
  return selected?decide(selected===victory(corner.home,corner.away)):null;
 }
 if(family==='CORNERS_ODD_EVEN'||family==='CARDS_ODD_EVEN'){
  const choice=oddEven(line),pair=family==='CORNERS_ODD_EVEN'?corner:card;
  return choice===null?null:decide((pair.home+pair.away)%2===choice);
 }
 if(family==='CORNERS_BAND'||family==='CARDS_BAND'){
  const pair=family==='CORNERS_BAND'?corner:card;
  return gradeBand(pair.home+pair.away,bandSelection(line));
 }
 return null;
}
