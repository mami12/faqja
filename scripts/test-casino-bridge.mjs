import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const messages=[],calls=[];
class Element{}
class XHR{open(...args){calls.push(args);}}
const origin='https://casino.example',parent={postMessage:(...args)=>messages.push(args)};
const window={parent,location:{origin},casinoWalletConfig:{agtApi:'/app/api/casino/original/fruit-queen/dinit.php'},addEventListener(){}};
const sandbox={window,location:window.location,document:{baseURI:origin+'/app/casino-original/agt/fruitqueen.html'},Element,XMLHttpRequest:XHR,URL,Promise,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'}};
vm.runInNewContext(readFileSync(new URL('../web/public/casino-original/wallet-bridge.js',import.meta.url),'utf8'),sandbox);
const body=new Element();
// The original AGT strict-mode client assigns this alias on the body element.
body.requestFullScreen=body.webkitRequestFullScreen;
await body.requestFullScreen();assert.equal(messages[0][0].type,'casino:fullscreen');assert.equal(messages[0][1],origin);
const xhr=new XHR();xhr.open('GET','/app/api/casino/agt/dinit.php?action=spin&gamename=fruitqueen&amount=0.5',true);
let url=new URL(calls[0][1]);assert.equal(url.pathname,'/app/api/casino/original/fruit-queen/dinit.php');assert.equal(url.searchParams.get('request_id'),'00000000-0000-4000-8000-000000000001');assert.equal(url.searchParams.get('amount'),'0.5');
xhr.open('GET','/app/api/casino/agt/dinit.php?action=start&gamename=fruitqueen',true);url=new URL(calls[1][1]);assert(!url.searchParams.has('request_id'));
xhr.open('GET','https://other.example/app/api/casino/agt/dinit.php?action=spin',true);assert.equal(calls[2][1],'https://other.example/app/api/casino/agt/dinit.php?action=spin');
console.log('PASS provider fullscreen alias compatibility, parent Back preservation and replay-safe wallet transport routing');
