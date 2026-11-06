import assert from 'node:assert/strict';
import express from 'express';
import puppeteer from 'puppeteer';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
 '<body><div id="root"></div><script type="module">'+
 "import React from 'react';import {createRoot} from 'react-dom/client';"+
 "import MarketLab from '/src/components/Admin/MarketLab.tsx';"+
 "import {reconcileFeedRevision} from '/src/api/feedRevision.ts';"+
 "import '/src/index.css';"+
 "window.testRevision=reconcileFeedRevision;"+
 "createRoot(document.getElementById('root')).render(React.createElement(MarketLab));"+
 '</script></body></html>';
const id='00000000-0000-4000-8000-000000000001';
let created=false,refreshes=0,runCount=0,realCount=0,server,vite,browser;
const run={id,started_at:new Date().toISOString(),finished_at:null,
 requested_matches:8,selected_matches:1,coverage:{
  'next-goal':{created:1,available:true},
  'next-corner':{created:0,available:false},
  'goal-window':{created:0,available:false}},
 cases:1,passed:1,failed:0,inconclusive:0,pending:0,observed:0};
const sample={id:'case-1',run_id:id,match_id:123,
 match_name:'Arsenal – Chelsea',market_name:'Next Goal',
 market_line:'',outcome_name:'Chelsea',odds:2.15,
 contract:{kind:'sequence',event:'goal',target:2},
 status:'PASS',engine_status:'WON',stitch_status:'WON',
 evidence:{reason:'INDEPENDENT_CHECK_AGREES',frameAt:new Date().toISOString()},
 opened_at:new Date().toISOString(),last_checked_at:new Date().toISOString()};
try{
 vite=await createServer({root:resolve('web'),configFile:false,plugins:[react()],
  server:{middlewareMode:true,hmr:false},appType:'custom'});
 const app=express();app.use(express.json());
 app.get('/app/api/admin/market-lab',(_req,res)=>res.json({
  mode:'VIRTUAL_ONLY_NO_WALLET',runs:created?[run]:[],cases:created?[sample]:[]
 }));
 app.post('/app/api/admin/market-lab/runs',(req,res)=>{
  assert.equal(req.body.matchCount,8);created=true;runCount++;
  res.json({runId:id,created:1,selectedMatches:1,coverage:run.coverage});
 });
 app.post('/app/api/admin/market-lab/refresh',(_req,res)=>{refreshes++;res.json({examined:1,passed:1});});
 app.get('/app/api/admin/market-lab/real',(_req,res)=>res.json({
  mode:'REAL_MONEY',adminBalance:1200,currency:'LEK',runs:[],cases:[]
 }));
 app.post('/app/api/admin/market-lab/real-runs',(req,res)=>{
  assert.equal(req.body.stakePerTicket,100);
  assert.equal(req.body.ticketCount,6);
  assert.match(req.body.requestId,/^[0-9a-f-]{36}$/);
  realCount++;
  res.json({runId:id,queued:0,maxDebit:0,coverage:{}});
 });
 app.get('/',async(_req,res)=>res.type('html').send(await vite.transformIndexHtml('/',html)));
 app.use(vite.middlewares);
 server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.goto('http://127.0.0.1:'+server.address().port);
 try{await page.waitForFunction(()=>document.body.textContent.includes('Testim i tregjeve me bileta dhe shlyerje reale'),{timeout:15000});}catch(e){console.error('Market lab initial render failed',{errors,html:(await page.content()).slice(0,1800),body:await page.$eval('body',x=>x.textContent?.slice(0,800)),overlay:await page.evaluate(()=>document.querySelector('vite-error-overlay')?.shadowRoot?.textContent?.slice(0,1800))});throw e;}
 const click=label=>page.evaluate(label=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label)?.click(),label);
 assert.equal(realCount,0,'No real wager before admin clicks the placement button');
 const before=await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Vendos baste reale'))?.disabled);
 assert.equal(before,false,'Admin explicit button click is the consent; no REAL typing or checkbox');
 assert.equal(await page.$('input[placeholder="REAL"]'),null);
 await click('Vendos baste reale');
 await page.waitForFunction(()=>document.body.textContent.includes('Nuk u gjetën tregje live të mbështetura'));
 assert.equal(realCount,1,'One explicit real-money request with no manufactured bets');
 await click('Simulime pa para');
 await page.waitForFunction(()=>document.body.textContent.includes('Laboratori LIVE i tregjeve'));
 await click('Testo tregjet');
 await page.waitForFunction(()=>document.body.textContent.includes('Arsenal – Chelsea')&&document.body.textContent.includes('Nuk u testua në këtë kampion'));
 assert.equal(runCount,1,'One virtual run only');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,
  'Mobile lab viewport has no horizontal page overflow');
 const versions=await page.evaluate(()=>{
  const first=window.testRevision(null,{syncStream:'a',syncSequence:1});
  const second=window.testRevision(first.next,{syncStream:'a',syncSequence:3});
  const old=window.testRevision(second.next,{syncStream:'a',syncSequence:2});
  const restart=window.testRevision(second.next,{syncStream:'b',syncSequence:1});
  return [first.refetch,second.refetch,old.stale,restart.refetch];
 });
 assert.deepEqual(versions,[false,true,true,true],'Missed, late and restarted socket frames are distinguished');
 await click('Kontrollo tani');await page.waitForFunction(()=>document.body.textContent.includes('Përputhet'));
 assert.equal(refreshes,1);
 assert.deepEqual(errors,[]);
 console.log('PASS virtual admin lab browser, mobile layout and stream revision resync behavior');
}finally{await browser?.close();await vite?.close();if(server)await new Promise(done=>server.close(done));}
