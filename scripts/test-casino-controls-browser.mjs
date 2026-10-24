import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import express from 'express';
import puppeteer from 'puppeteer';
import {createServer} from 'vite';

// Real React controls and wallet launcher, using isolated HTTP fixtures only.
const root=fileURLToPath(new URL('../web',import.meta.url));
process.chdir(root);
const definitions=[['lucky-clover-x3','Lucky Clover X3'],['vikings-fun',"Viking's Fun"],['fruit-queen','Fruit Queen'],['seven-hot','Seven Hot'],['sizzling','Sizzling Hot Deluxe'],['bookofra','Book of Ra Deluxe']];
const makeGame=([gameId,title])=>({gameId,title,profile:'p95',theoreticalRtp:95,profiles:[{id:'p90',label:'90%',theoreticalRtp:90},{id:'p95',label:'95%',theoreticalRtp:95}],configurationError:null,configurationWarning:null,controls:{mode:'original',rtp:95,hitFrequency:20},effectiveRtp:95,effectiveHitFrequency:null,mathVersion:gameId+'-original',customLimits:{minWinMultiplier:.01,maxWinMultiplier:5000}});
const settings={enabled:true,warning:null,games:definitions.map(makeGame),stakeLimits:{min:.20,max:5000,currency:'ALL'}};
const html=`<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import CasinoSettings from '/src/components/Admin/CasinoSettings.tsx';
import CasinoOriginalWallet from '/src/pages/CasinoOriginalWallet.tsx';import '/src/index.css';
const root=createRoot(document.getElementById('root'));
window.mountAdmin=()=>root.render(React.createElement(CasinoSettings));
window.mountWallet=(game)=>root.render(React.createElement('div',{className:'casino-game-stage'},React.createElement('div',{className:'casino-game-toolbar'},'Fixture toolbar'),React.createElement('div',{className:'casino-game-content'},React.createElement(CasinoOriginalWallet,{key:game,game}))));
window.mountAdmin();</script></body></html>`;
let server,vite,browser,changeOnSession=false;
const saved=[],sessions=[],errors=[];
const setCustom=(gameId,rtp,hit)=>{
 const game=settings.games.find(item=>item.gameId===gameId);
 Object.assign(game,{controls:{mode:'custom',rtp,hitFrequency:hit},effectiveRtp:rtp,effectiveHitFrequency:hit,mathVersion:gameId+'-custom-'+rtp+'-'+hit});
};
try{
 vite=await createServer({root,configFile:false,plugins:[(await import('@vitejs/plugin-react')).default()],server:{middlewareMode:true,hmr:false,fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]}},appType:'custom',optimizeDeps:{include:['react','react-dom/client','axios','lucide-react']}});
 const app=express();app.use(express.json());
 app.get(['/app/api/admin/casino/settings','/app/api/casino/status'],(_req,res)=>res.json(settings));
 app.get('/app/api/admin/casino/finance',(_req,res)=>res.json({totals:{casinoStake:0,casinoPayout:0,casinoSpins:0}}));
 app.patch('/app/api/admin/casino/controls',(req,res)=>{
  saved.push(req.body);const game=settings.games.find(item=>item.gameId===req.body.gameId);
  if(req.body.mode==='custom')setCustom(game.gameId,req.body.rtp,req.body.hitFrequency);
  else Object.assign(game,{controls:{...req.body},effectiveRtp:game.theoreticalRtp,effectiveHitFrequency:null,mathVersion:game.gameId+'-original'});
  res.json(settings);
 });
 app.patch('/app/api/admin/casino/profile',(req,res)=>{const game=settings.games.find(item=>item.gameId===req.body.gameId);game.profile=req.body.profile;game.theoreticalRtp=game.profiles.find(item=>item.id===req.body.profile).theoreticalRtp;res.json(settings);});
 const session=(gameId,req,res)=>{
  sessions.push({gameId,...req.body});
  if(changeOnSession){changeOnSession=false;setCustom(gameId,75,25);}
  const game=settings.games.find(item=>item.gameId===gameId);
  if(req.body.mathVersion!==game.mathVersion)return res.status(409).json({message:'Game settings changed. Review the current terms.'});
  res.json({ready:true,mathVersion:game.mathVersion,gameUrl:['sizzling','bookofra'].includes(gameId)?'/app/casino-original/'+gameId+'/index-real.html':'/app/api/casino/original/'+gameId+'/launch'});
 };
 for(const [gameId] of definitions){
  const path=gameId==='sizzling'?'/app/api/casino/session':gameId==='bookofra'?'/app/api/casino/bookofra/session':'/app/api/casino/original/'+gameId+'/session';
  app.post(path,(req,res)=>session(gameId,req,res));
 }
 app.post(['/app/api/casino/sizzlinghotdeluxe/real/play','/app/api/casino/bookofra/real/play'],(_req,res)=>res.json({init:{start_symbols:[1,2,3]},balance:{after:1000}}));
 app.get(['/app/api/casino/original/:game/launch','/app/casino-original/:game/index-real.html'],(_req,res)=>res.type('html').send('<!doctype html><html><body style="background:#174"><div id="gameContainer">ISOLATED GAME</div><canvas id="slotCanvas" width="1600" height="900"></canvas></body></html>'));
 app.get('/fixture',async(_req,res,next)=>{try{res.type('html').send(await vite.transformIndexHtml('/fixture',html));}catch(error){next(error);}});
 app.use(vite.middlewares);server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 // Speed up only the status refresh in this fixture; real launch uses 30 seconds.
 await page.evaluateOnNewDocument(()=>{const interval=window.setInterval;window.setInterval=(callback,delay,...args)=>interval(callback,delay===30000?200:delay,...args);});
 await page.setViewport({width:1100,height:820});
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture',{waitUntil:'networkidle0'});
 await page.waitForSelector('article');
 const changeSelect=async(selector,value)=>page.select(selector,value);
 const setNumber=async(selector,value)=>{await page.click(selector,{clickCount:3});await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type(String(value));};
 const clickSave=async(index)=>page.evaluate(index=>document.querySelectorAll('article')[index].querySelector('button').click(),index);
 for(let index=0;index<definitions.length;index++){
  const [gameId,title]=definitions[index];
  await changeSelect(`select[aria-label="${title}: modaliteti"]`,'custom');
  await setNumber(`input[aria-label="${title}: RTP"]`,0);
  assert.equal(await page.$eval(`article:nth-child(${index+1}) button`,element=>element.disabled),true,'inconsistent zero pair cannot be saved');
  await setNumber(`input[aria-label="${title}: Hit frequency"]`,0);
  await clickSave(index);
  await page.waitForFunction(index=>{const article=document.querySelectorAll('article')[index];return article.textContent.includes('Aktive: E personalizuar')&&!article.querySelector('input').disabled&&article.querySelector('button').disabled;},{timeout:10000},index);
  assert.deepEqual(saved.at(-1),{gameId,mode:'custom',rtp:0,hitFrequency:0});
 }
 assert.equal(saved.length,6,'all six games have independent 0% controls');
 assert.ok((await page.$eval('body',element=>element.textContent)).includes('0.20–5,000 lekë'));

 // No session, game frame, or paid-round API is opened before custom terms.
 await page.evaluate(()=>window.mountWallet('lucky-clover-x3'));
 await page.waitForSelector('section[aria-label="Kushtet e lojës"]');
 assert.equal(sessions.length,0);assert.equal(await page.$('iframe'),null);
 assert.ok((await page.$eval('body',element=>element.textContent)).includes('Every new stake will be lost.'));
 await page.click('section[aria-label="Kushtet e lojës"] button');
 await page.waitForSelector('iframe');
 assert.equal(sessions.at(-1).mathVersion,'lucky-clover-x3-custom-0-0');
 const bounds=await page.$eval('iframe',element=>{const r=element.getBoundingClientRect(),parent=element.closest('.casino-game-content').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,parent:{x:parent.x,y:parent.y,right:parent.right,bottom:parent.bottom}};});
 assert.ok(bounds.x>=bounds.parent.x-1&&bounds.y>=bounds.parent.y-1&&bounds.right<=bounds.parent.right+1&&bounds.bottom<=bounds.parent.bottom+1,'game remains within space reserved below terms');
 setCustom('lucky-clover-x3',50,25);
 await page.waitForFunction(()=>document.body.textContent.includes('Settings changed · Review before next paid spin'));
 assert.ok(await page.$('iframe'),'changed settings preserve the accepted frame for owed bonus/collect');
 await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Settings changed')).click());
 await page.waitForSelector('section[aria-label="Kushtet e lojës"]');
 assert.ok((await page.$eval('body',element=>element.textContent)).includes('50%'));
 assert.equal(await page.$('iframe'),null);
 changeOnSession=true;
 await page.click('section[aria-label="Kushtet e lojës"] button');
 await page.waitForSelector('p[role="alert"]');
 assert.equal(await page.$('iframe'),null,'racing settings update cannot launch under stale acknowledgement');
 await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Rilidhu')).click());
 await page.waitForSelector('section[aria-label="Kushtet e lojës"]');
 assert.ok((await page.$eval('body',element=>element.textContent)).includes('75%'));
 await page.click('section[aria-label="Kushtet e lojës"] button');await page.waitForSelector('iframe');
 assert.equal(sessions.at(-1).mathVersion,'lucky-clover-x3-custom-75-25');

 // All original cabinets also receive the disclosed version and bet limits.
 for(const [gameId,title] of definitions){
  const game=settings.games.find(item=>item.gameId===gameId);game.controls.mode='original';game.effectiveRtp=95;game.effectiveHitFrequency=null;game.mathVersion=gameId+'-original';
  if(gameId==='lucky-clover-x3'){await page.evaluate(()=>window.mountAdmin());await page.waitForSelector('article');}
  await page.evaluate(gameId=>window.mountWallet(gameId),gameId);await page.waitForSelector(`iframe[title="${title} · bilanci i llogarisë"]`);
  assert.equal(sessions.at(-1).gameId,gameId);assert.equal(sessions.at(-1).mathVersion,gameId+'-original');
  assert.equal(await page.$('section[aria-label="Kushtet e lojës"]'),null);
  assert.ok((await page.$eval('body',element=>element.textContent)).includes('Bet: 0.20–5,000 lekë'));
 }
 assert.deepEqual(errors,[]);
 console.log('casino controls browser: six 0% settings, invalid pair, disclosure, version race, bonus-preserving change notice, and all six launch contracts PASS');
}finally{
 await browser?.close();await vite?.close();
 if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
}
