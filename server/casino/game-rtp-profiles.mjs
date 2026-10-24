/** Immutable global reel profiles. Never select a profile using player identity. */
import {readFileSync} from 'node:fs';
import {RTP_PROFILES} from './rtp-profiles.mjs';
import {bookProfiles} from './bookofra-profiles.mjs';
const load=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const clover=load('./lucky-clover-data.json'),vikings=load('./vikings-data.json'),agt=load('./agt-data.json');
const definitions=[
 ['lucky-clover-x3','Lucky Clover X3',clover.reels,clover.defaultRtp],
 ['vikings-fun',"Viking’s Fun",vikings.reels,vikings.defaultRtp],
 ['fruit-queen','Fruit Queen',agt.games.fruitqueen.reels,agt.games.fruitqueen.rtp],
 ['seven-hot','Seven Hot',agt.games.sevenhot20.reels,agt.games.sevenhot20.rtp],
];
const games=new Map(definitions.map(([gameId,title,reels,defaultRtp])=>{
 const profiles=Object.keys(reels).map(key=>Object.freeze({
  id:`SLOTOPOL_${gameId.replaceAll('-','_').toUpperCase()}_RTP_${key.replace('.','_')}_V1`,
  rtp:Number(key),theoreticalRtp:Number(key),label:`${Number(key)}%`,certified:false,
  source:'Slotopol',sourceCommit:clover.commit,
 })).sort((a,b)=>a.rtp-b.rtp);
 return [gameId,{gameId,title,profiles,defaultId:profiles.find(p=>p.rtp===Number(defaultRtp)).id}];
}));
games.set('sizzling',{gameId:'sizzling',title:'Sizzling Hot Deluxe',profiles:RTP_PROFILES.map(p=>({...p,rtp:p.theoreticalRtp})),defaultId:'SIZZLING_ORIGINAL_REELS_V2'});
games.set('bookofra',{gameId:'bookofra',title:'Book of Ra Deluxe',get profiles(){return bookProfiles().map(p=>({...p,rtp:p.theoreticalRtp}));},get defaultId(){
 const profiles=bookProfiles(),original=profiles.find(p=>p.id==='BOOKOFRA_ORIGINAL_REELS_V2');
 return original.theoreticalRtp<=100?original.id:profiles.filter(p=>p.theoreticalRtp<=100).at(-1).id;
}});
export function getGameProfiles(gameId){return games.get(gameId)?.profiles??[];}
export function getGameProfile(gameId,storedProfiles={}){
 const game=games.get(gameId);
 if(!game)throw Object.assign(new Error('Unknown casino game'),{status:400});
 const id=storedProfiles?.[gameId]??game.defaultId;
 const profile=game.profiles.find(p=>p.id===id);
 if(!profile)throw Object.assign(new Error(`Unsupported reel profile for ${gameId}`),{status:503,code:'UNSUPPORTED_MATH_PROFILE'});
 return profile;
}
export function getPaidGameProfile(gameId,storedProfiles={}){
 const profile=getGameProfile(gameId,storedProfiles);
 if(profile.theoreticalRtp>100)throw Object.assign(new Error('Select a supported casino profile before starting a new paid round'),{status:503,code:'UNSUPPORTED_MATH_PROFILE'});
 return profile;
}
export function publicGameProfiles(storedProfiles={}){
 return [...games.values()].map(game=>{
  let active=null,error=null;try{active=getPaidGameProfile(game.gameId,storedProfiles);}catch(e){error=e.message;}
  return {gameId:game.gameId,title:game.title,profile:active?.id??null,theoreticalRtp:active?.theoreticalRtp??null,
   profiles:game.profiles.filter(profile=>profile.theoreticalRtp<=100).map(({reels,baseRtp,bonusRtp,...profile})=>profile),
   configurationError:error,configurationWarning:active?.theoreticalRtp>100?'Profili ekzistues ka kthim teorik mbi 100%. Zgjidh një nga profilet e mbështetura më poshtë.':null,
   scope:'All players; future paid rounds only'};
 });
}
export function validateGameProfile(gameId,id){
 const profile=getGameProfiles(gameId).find(p=>p.id===id&&p.theoreticalRtp<=100);
 if(!profile)throw Object.assign(new Error('Unsupported casino reel profile'),{status:400});
 return profile;
}
