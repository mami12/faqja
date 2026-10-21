import {Router} from 'express';
import jwt from 'jsonwebtoken';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {config} from '../config.mjs';
import {requireAuth} from '../ledger/auth.mjs';
import {isLedgerReady} from '../ledger/store.mjs';
import {settlePendingWin} from './transactions.mjs';
import {createOriginalWalletStore,ORIGINAL_GAMES,walletFault} from './original-wallet-store.mjs';
import {originalClientShell} from './original-client-shell.mjs';

const MAX_AGE=7200,cookieName=id=>'casino_original_'+id;
const prefix=id=>'/app/api/casino/original/'+id;
const safe=handler=>(req,res)=>Promise.resolve(handler(req,res)).catch(error=>{
 if(!error.status||error.status>=500)console.error('[original casino]',error);
 res.status(error.status||500).json({error:1,error_txt:error.status?error.message:'Casino service unavailable',message:error.status?error.message:'Casino service unavailable'});
});
function sameOrigin(req){
 if(['cross-site','same-site'].includes(req.get('sec-fetch-site')))throw walletFault(403,'Same origin required');
 if(req.get('origin')&&new URL(req.get('origin')).host!==req.get('host'))throw walletFault(403,'Same origin required');
}
function claim(req,id){
 const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(id)+'='))?.slice(cookieName(id).length+1);
 let value;try{value=jwt.verify(token,config.jwtSecret);}catch{throw walletFault(401,'Game session expired. Reopen the game.');}
 if(value.kind!=='casino-original-wallet'||value.game!==id||typeof value.jti!=='string')throw walletFault(401,'Invalid game session');
 return value;
}
const publicRoot=fileURLToPath(new URL('../../web/public/',import.meta.url));
function assetRoot(){const dist=fileURLToPath(new URL('../../web/dist/',import.meta.url));return existsSync(path.join(dist,'index.html'))?dist:publicRoot;}
function shell(file,base,settings={}){
 const html=readFileSync(path.join(assetRoot(),file),'utf8');
 return originalClientShell(html,base,settings);
}
export function createOriginalWalletRouter({store=createOriginalWalletStore(),auth=requireAuth,ready=isLedgerReady}={}){
 const router=Router();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');if(!ready())return res.status(503).json({message:'Ledger unavailable'});next();});
 router.post('/pixi/close',auth,safe(async(req,res)=>{
  sameOrigin(req);if(req.user.role!=='PLAYER'||req.user.status!=='ACTIVE')throw walletFault(403,'Player account required');
  res.json({balance:await settlePendingWin(req.user.id)});
 }));
 router.post('/:id/session',auth,safe(async(req,res)=>{
  sameOrigin(req);const id=req.params.id;
  if(req.user.role!=='PLAYER'||req.user.status!=='ACTIVE')throw walletFault(403,'Player account required');
  const {sessionId}=await store.launch(req.user.id,id);
  res.cookie(cookieName(id),jwt.sign({kind:'casino-original-wallet',sub:req.user.id,game:id,jti:sessionId},config.jwtSecret,{expiresIn:MAX_AGE}),{httpOnly:true,sameSite:'strict',secure:req.secure||req.get('x-forwarded-proto')==='https',path:prefix(id),maxAge:MAX_AGE*1000});
  const url=new URL(prefix(id)+'/launch','http://local');
  if(ORIGINAL_GAMES[id].kind==='ct')url.search=new URLSearchParams({locale:'en-GB',lang:'en_GB',game_id:'wallet',serverurl:prefix(id)+'/rgsm',exitAllow:'0',video:'0'});
  res.json({ready:true,gameUrl:url.pathname+url.search});
 }));
 router.post('/:id/close',auth,safe(async(req,res)=>{
  sameOrigin(req);const c=claim(req,req.params.id);if(c.sub!==req.user.id)throw walletFault(403,'Wrong player');
  res.json(await store.close(c.sub,c.game,c.jti));
 }));
 router.get('/:id/launch',safe(async(req,res)=>{
  const c=claim(req,req.params.id),g=ORIGINAL_GAMES[c.game];if(!g)throw walletFault(404,'Unknown game');
  // Verify current player, casino and durable session before shipping the client.
  await store.inspect(c.sub,c.game,c.jti);
  const base=g.kind==='ct'?`/app/casino-original/${g.folder}/vendor/html-20200413-stable/${g.app}/`:'/app/casino-original/agt/';
  res.type('html').send(shell(g.kind==='ct'?`casino-original/${g.folder}/vendor/html-20200413-stable/${g.app}/app.html`:`casino-original/agt/${g.app}.html`,base,{game:c.game,agtApi:prefix(c.game)+'/dinit.php'}));
 }));
 router.get('/:id/rgsm',safe(async(req,res)=>{
  sameOrigin(req);const c=claim(req,req.params.id);
  if(ORIGINAL_GAMES[c.game]?.kind!=='ct')throw walletFault(404,'Unknown protocol');
  let commands;try{commands=JSON.parse(req.query.request);}catch{throw walletFault(400,'Invalid request');}
  if(!Array.isArray(commands)||!commands.length||commands.length>20||commands.some(x=>!x||typeof x.command!=='string'||!Number.isSafeInteger(x.sequence_number)||x.sequence_number<0))throw walletFault(400,'Invalid commands');
  res.json(await store.act(c.sub,c.game,c.jti,commands));
 }));
 router.get('/:id/dinit.php',safe(async(req,res)=>{
  sameOrigin(req);const c=claim(req,req.params.id);
  if(ORIGINAL_GAMES[c.game]?.kind!=='agt')throw walletFault(404,'Unknown protocol');
  // Only wager fields participate in replay keys; cache busting/statistics do not.
  const fields=['action','gamename','li','di','amount','color','request_id'];
  const params=Object.fromEntries(fields.filter(k=>req.query[k]!==undefined).map(k=>[k,req.query[k]]));
  const reply=await store.act(c.sub,c.game,c.jti,params);
  // Provider token-compatibility marker only. Authentication/funds are the
  // verified HttpOnly wallet cookie and the SQL transaction above.
  res.set('token','demo');res.json(reply);
 }));
 return router;
}
// Keep existing Pixi money clients inside the parent fullscreen container too.
export const originalFrameShellRouter=Router();
originalFrameShellRouter.get('/:id/index-real.html',safe(async(req,res,next)=>{
 if(!['sizzling','bookofra'].includes(req.params.id))return res.sendStatus(404);
 res.set('Cache-Control','no-store').type('html').send(shell(`casino-original/${req.params.id}/index-real.html`,`/app/casino-original/${req.params.id}/`));
}));
