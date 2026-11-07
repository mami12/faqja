/**
 * Information-only AiScore team-statistics candidate decoder.
 * This intentionally does not authorize a bet to be graded. The caller must
 * independently prove the AiScore match ID and BOTH team names, compare the
 * numbers with the configured final provider review, and verify final phase.
 * Unknown response schemas, one-sided stats and conflicting duplicates
 * are never guessed into financial-grade evidence.
 */
const key=value=>String(value??'').toLowerCase().replace(/[^a-z]/g,'');
const statKey=value=>{
 const normalized=key(value);
 return ['shotsontarget','shotsongoal'].includes(normalized)?'shotsOnTarget':
  ['fouls','foulscommitted','totalfouls'].includes(normalized)?'fouls':null;
};
const nonNegativeInt=value=>{
 if(value==null||typeof value==='boolean'||typeof value==='object'||String(value).trim()==='')
  return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:null;
};
const pair=(home,away)=>{
 const h=nonNegativeInt(home),a=nonNegativeInt(away);
 return h===null||a===null?null:{home:h,away:a};
};
export function parseAiScoreStatCandidates(payload){
 const roots=[payload?.data?.match?.statistics,payload?.data?.match?.stats,
  payload?.data?.statistics,payload?.data?.stats,
  payload?.statistics,payload?.stats].filter(x=>x&&typeof x==='object');
 const candidates=new Map();
 for(const root of roots){
  const found=[];
  if(Array.isArray(root)){
   for(const row of root){
    if(!row||typeof row!=='object')continue;
    const field=statKey(row.stat??row.name??row.type??row.label);
    const value=pair(row.home??row.home_value,row.away??row.away_value);
    if(field&&value)found.push([field,value]);
   }
  }else{
   const home=root.home??root.home_team,away=root.away??root.away_team;
   if(home&&away&&typeof home==='object'&&typeof away==='object'){
    for(const [name,v] of Object.entries(home)){
     const field=statKey(name);if(!field)continue;
     const other=Object.entries(away).find(([candidate])=>statKey(candidate)===field)?.[1];
     const value=pair(v,other);if(value)found.push([field,value]);
    }
   }
   for(const [name,value] of Object.entries(root)){
    const field=statKey(name);
    if(!field||!value||typeof value!=='object'||Array.isArray(value))continue;
    const checked=pair(value.home,value.away);
    if(checked)found.push([field,checked]);
   }
  }
  for(const [field,value] of found){
   const data=candidates.get(field)??{value:null,ambiguous:false};
   if(data.value&&JSON.stringify(data.value)!==JSON.stringify(value))
    data.ambiguous=true;
   else data.value=value;
   candidates.set(field,data);
  }
 }
 return Object.fromEntries([...candidates].filter(([,v])=>v.value&&!v.ambiguous)
  .map(([field,v])=>[field,v.value]));
}
