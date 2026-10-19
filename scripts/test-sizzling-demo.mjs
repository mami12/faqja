import assert from 'node:assert/strict';
import express from 'express';
import {
  REELS, paylines, paytable, gradeGrid, randomGrid, symbolMatrix, createSizzlingDemoRouter,
} from '../server/casino/sizzling-demo.mjs';

assert.equal(REELS.length, 5);
assert.ok(REELS.every(reel => reel.length === 75), 'each Goldsvet Sizzling strip has 75 stops');
assert.equal(paylines.length, 5);
assert.equal(paytable[7][2], 5, 'cherry pays on two adjacent symbols');
assert.equal(paytable[1][5], 5000, 'five 7s pay correctly');
assert.equal(paytable[0][3], 2, '3+ scatters pay with total stake');

const first = randomGrid(() => 0);
assert.equal(first.length, 5);
assert.ok(first.every(column => column.length === 3));
assert.equal(Object.keys(symbolMatrix(first)).length, 5);
assert.equal(Object.keys(symbolMatrix(first)[0]).length, 3);

const all7 = Array.from({length:5},()=>[1,1,1]);
const jackpot = gradeGrid(all7,1,1);
assert.equal(jackpot.line_wins.length,5);
assert.equal(jackpot.total,25_000);
assert.deepEqual(jackpot.line_wins[0].pos,[[0,1],[1,1],[2,1],[3,1],[4,1]]);
const pair = [[7,1,1],[7,2,2],[2,3,3],[4,4,4],[5,5,5]];
assert.equal(gradeGrid(pair,1).line_wins.some(win=>win.code===7&&win.pos.length===2),true);
const scat = [[0,1,1],[1,0,1],[1,1,0],[1,1,1],[1,1,1]];
assert.equal(gradeGrid(scat,1).line_wins.some(win=>win.code===0&&win.type==='scatter'),true);

const app=express();
app.use(express.json());
app.use('/app/api/casino/sizzlinghotdeluxe',createSizzlingDemoRouter());
const server=await new Promise(done=>{
  const listener=app.listen(0,'127.0.0.1',()=>done(listener));
});
try {
  const base='http://127.0.0.1:'+server.address().port+'/app/api/casino/sizzlinghotdeluxe/play';
  let cookie='';
  const post=async (value,kind='form')=>{
    const params=new FormData();
    params.append('data',JSON.stringify(value));
    params.append('cookies',JSON.stringify({'':null}));
    const response=await fetch(base,{
      method:'POST',headers:cookie?{Cookie:cookie}:undefined,
      body:kind==='form'?params:JSON.stringify(value),
    });
    const setCookie=response.headers.get('set-cookie');
    if(setCookie)cookie=setCookie.split(';')[0];
    return { status:response.status, body:await response.json() };
  };
  const init=await post({action:'init',request_id:'0'});
  assert.equal(init.status,200);
  assert.equal(init.body.balance.after,100000);
  assert.deepEqual(init.body.available_actions,['spin']);
  assert.equal(init.body.init.extra.symbol_types.scatters[0],0);
  assert.equal(init.body.init.directory.lines.length,5);
  assert.equal(Object.keys(init.body.init.start_symbols).length,5);
  assert.equal(init.body.init.ranges.bet[1].length,9);
  assert.equal(init.body.init.currency,'EUR');
  assert.ok(cookie.startsWith('sizzling_demo_session='));
  const before=init.body.balance.after;
  const request={action:'spin',bet:1,lines:5,denomination:1,request_id:'2'};
  const spin=await post(request);
  assert.equal(spin.status,200);
  assert.equal(Object.keys(spin.body.spin.symbols).length,5);
  assert.equal(spin.body.spin.wins.line_wins.length>=0,true);
  assert.ok(spin.body.balance.after>=before-5);
  assert.equal(typeof spin.body.macro_round.wins.total,'string');
  const replay=await post(request);
  assert.deepEqual(replay.body,spin.body,'identical retry must not debit twice');
  const collected=await post({action:'collect',request_id:'3'});
  assert.equal(collected.status,200);
  assert.deepEqual(collected.body.available_actions,['spin']);
  // Regression: the visible demo cabinet uses actual paytable winnings,
  // and both original red/black Gamble actions work with demo credits.
  // Keep spinning until a natural win so the test exercises live reel math.
  let winning = null;
  let requestId = 5;
  for(let i=0;i<600;i++){
    const result=await post({action:'spin',bet:1,lines:5,denomination:1,
      request_id:String(requestId++)});
    assert.equal(result.status,200);
    const displayed=Number(result.body.spin.wins.total);
    const sum=result.body.spin.wins.line_wins.reduce((n,w)=>n+Number(w.amount),0);
    assert.ok(Math.abs(displayed-sum)<0.01,'Demo line win total must match winning symbols');
    if(displayed>0){winning=result;break;}
  }
  assert.ok(winning,'Demo should pay a natural winning spin from its original reel strips');
  const pending=Number(winning.body.spin.wins.total);
  assert.ok(winning.body.available_actions.includes('gamble'),
    'Gamble must appear after a demo win');
  const offer=await post({action:'get_double',request_id:String(requestId++)});
  assert.equal(offer.status,200);
  assert.equal(offer.body.gamble.bet,pending);
  assert.ok(offer.body.available_actions.includes('set_double'));
  const amountBefore=Number(offer.body.balance.after);
  const gambleRequest={action:'set_double',choice:0,request_id:String(requestId++)};
  const dealt=await post(gambleRequest);
  assert.equal(dealt.status,200,'Demo gamble must accept a red/black card');
  const card=dealt.body.gamble.history.items[1];
  const red=['hearts','diamonds'].includes(card.suit);
  assert.equal(dealt.body.gamble.status,red?'win':'lose');
  assert.ok(Math.abs(Number(dealt.body.balance.after)-
    (amountBefore+(red?pending:-pending)))<0.01,
    'Gamble credits/debits must match the result');
  const again=await post(gambleRequest);
  assert.deepEqual(again.body,dealt.body,'Gamble request retry must not pay twice');
  const finalize=await post({action:'collect',request_id:String(requestId++)});
  assert.equal(finalize.status,200);
  assert.deepEqual(finalize.body.available_actions,['spin']);
  const other=await fetch(base,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({data:JSON.stringify({action:'init'})}),
  });
  const otherData=await other.json();
  assert.equal(otherData.balance.after,100000,'different cookies have isolated credits');
  assert.ok(await other.headers.get('set-cookie'),'anonymous session must have own cookie');
  const bad=await post({action:'spin',bet:-5,lines:5,denomination:1,request_id:'4'});
  assert.equal(bad.status,400);
  const status=await fetch('http://127.0.0.1:'+server.address().port+
    '/app/api/casino/sizzlinghotdeluxe/status');
  assert.equal((await status.json()).realMoney,false);
  console.log('Original Sizzling demo API: real reel strips, paylines, init, spin, retry, collect, cookies, invalid bet passed');
} finally {
  await new Promise(done=>server.close(done));
}
