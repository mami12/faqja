/** Browser probe for original GWT s777d engine. Diagnostic only until runtime is verified. */
import express from 'express';
import puppeteer from 'puppeteer';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app=express();
app.use('/app',express.static(join(root,'web/dist')));
const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
let browser;
try{
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();
 await page.setViewport({width:900,height:610,deviceScaleFactor:1});
 const events=[];
 const requests=[];
 page.on('request',q=>{if(requests.length<75)requests.push({method:q.method(),url:q.url().slice(0,230),post:q.postData()?.slice(0,600)});});
 page.on('pageerror',e=>events.push({type:'pageerror',text:String(e).slice(0,400)}));
 page.on('console',e=>{if(['error','warning'].includes(e.type()))events.push({type:e.type(),text:e.text().slice(0,400)})});
 page.on('requestfailed',r=>events.push({type:'failed',text:r.url().slice(0,200)+' '+r.failure()?.errorText}));
 page.on('response',r=>{if(r.status()>=400)events.push({type:'HTTP '+r.status(),text:r.url().slice(0,210)})});
 const url='http://127.0.0.1:'+server.address().port+'/app/casino-goldsvet/s777d/index.html';
 const first=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 await new Promise(r=>setTimeout(r,16000));
 const info=await page.evaluate(()=>{
  const canvases=[...document.querySelectorAll('canvas')];
  const imgs=[...document.images].slice(0,50).map(i=>({src:i.src.slice(-100),w:i.naturalWidth,h:i.naturalHeight}));
  const frames=[...document.querySelectorAll('iframe')].map(x=>({src:x.src,id:x.id}));
  return {diag:window.__s777dDiagnostics,bodyHtml:document.body.innerHTML.slice(0,1800),canvas:canvases.map(c=>({w:c.width,h:c.height,style:c.getAttribute('style')})),imgs,frames,bodyText:document.body.innerText.slice(0,500),title:document.title};
 });
 const fullJs=readFileSync(join(root,'web/dist/casino-goldsvet/s777d/s777d/B6FA10F25A93883264359F51D1E0D3A5.cache.js'),'utf8');
 const patterns=['https://','http://','game_session','sessionId','demoMode','serverUrl','serverURL','/game/','/api/','json','/games/','slotEvent','act:', 'nCGuJ1R7Iw98aD7o'];
 const references=Object.fromEntries(patterns.map(key=>{let n=0,positions=[];for(let i=fullJs.indexOf(key);i>=0&&n<12;i=fullJs.indexOf(key,i+key.length)){n++;positions.push(fullJs.slice(Math.max(0,i-75),i+155))}return [key,positions]}));
 console.log('GWT_RUNTIME_STRINGS',JSON.stringify(references).slice(0,17000));
 const loaded=await page.evaluate(async()=>{
  let urls=['./s777d/s777d.nocache.js','./s777d/B6FA10F25A93883264359F51D1E0D3A5.cache.js','./s777d/s777d-0.js','./s777d/style.css'];
  return Promise.all(urls.map(async u=>{let r=await fetch(u,{method:'HEAD'});return {url:u,status:r.status,length:r.headers.get('content-length')}}));
 });
 console.log('GWT_ORIGINAL_PROBE',JSON.stringify({status:first.status(),loaded,info,requests,events:events.slice(0,35)}));
}finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
