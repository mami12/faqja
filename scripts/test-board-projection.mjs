import './fixtures/isolated-casino-env.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../server/db.mjs';
import { LEDGER_SQL } from '../server/ledger/schema.mjs';
import { config } from '../server/config.mjs';
import { projectBoardMatches } from '../server/ledger/board-projection.mjs';
import { ledgerRouter } from '../server/ledger/routes.mjs';
import { initLedgerSchema } from '../server/ledger/store.mjs';
import * as matches from '../server/match-store.mjs';
import * as odds from '../server/odds-store.mjs';
import { snapshot } from '../server/ledger/overrides.mjs';

const raw = [{id:'1',marketCount:80,markets:[
  {name:'1st Half Result',period:1,line:''},
  {name:'Full Time Result',period:0,line:''},
  {name:'Match Result',period:0,line:''},
  {name:'Total Goals',period:0,line:'3.5'},
  {name:'Total Goals',period:0,line:'2.5'},
  {name:'Both Teams To Score',period:0,line:''},
  {name:'Result and Total Goals',period:0,line:'2.5'},
  {name:'Corners',period:0,line:'2.5'},
]}];
const original = structuredClone(raw), projected = projectBoardMatches(raw);
assert.deepEqual(raw,original,'projection never mutates full detail data');
assert.equal(projected[0].marketCount,80);
assert.deepEqual(projected[0].markets.map(m=>m.name),['Full Time Result','Total Goals','Both Teams To Score']);
assert.equal(projected[0].markets.find(m=>m.name==='Total Goals').line,'2.5');
assert.equal(projectBoardMatches([{markets:raw[0].markets}])[0].marketCount,8);
assert.deepEqual(projectBoardMatches([{marketCount:20}])[0].markets,[]);

const sql = new PGlite(), originalQuery = pool.query;
let server, catalogQueries=0;
pool.query=(text,params)=>{
  if(/select[\s\S]*from app_bet_builder_template/i.test(text)) catalogQueries++;
  if(text===LEDGER_SQL)return sql.exec(text).then(()=>({rows:[]}));
  return sql.query(text,params);
};
try {
  config.matchStore='memory';config.oddsStore='memory';
  snapshot().at=Number.MAX_SAFE_INTEGER;
  await initLedgerSchema();catalogQueries=0;
  matches.clear();
  const matchId=774411;
  matches.upsert([{match_id:matchId,sport_id:18,sport_tag:'football',category_slug:'test',category_name:'Test',
    tournament_id:1,tournament_name:'Test league',home:'Home',away:'Away',service:'PREMATCH',start_at:new Date(Date.now()+3600000)}]);
  const source=[
    ...['1','X','2'].map((outcomeKey,index)=>({marketKey:'result',marketName:'Full Time Result',line:'',outcomeKey,outcomeName:outcomeKey,price:2+index})),
    ...['Over','Under'].map(outcomeKey=>({marketKey:'total',marketName:'Total Goals',line:'2.5',outcomeKey,outcomeName:outcomeKey,price:1.9})),
    ...['Yes','No'].map(outcomeKey=>({marketKey:'btts',marketName:'Both Teams To Score',line:'',outcomeKey,outcomeName:outcomeKey,price:1.9})),
    ...Array.from({length:100},(_,index)=>({marketKey:`corners${index}`,marketName:'Total Corners',line:`${index}.5`,outcomeKey:'Over',outcomeName:'Over',price:2})),
  ].map(row=>({matchId,...row}));
  odds.applyRows(source);
  const app=express();app.use('/app/api',ledgerRouter);
  server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  const base=`http://127.0.0.1:${server.address().port}/app/api`;
  const get=async path=>{const response=await fetch(base+path);assert.equal(response.status,200,path);return response.json();};
  for(const path of ['/matches?view=board','/sports/18/matches?view=board']){
    const board=await get(path);assert.equal(board.length,1);assert.equal(board[0].markets.length,3);
    assert.equal(board[0].marketCount,103,'board retains full detail market count');
    assert.equal(catalogQueries,0,'board must never load or decorate builder templates');
  }
  const full=await get('/matches');
  assert.equal(full[0].markets.length,103,'default API retains full market semantics');
  assert.ok(catalogQueries>0,'default full API still applies existing builder policy');
  const board=await get('/matches?view=board');
  assert.ok(JSON.stringify(board).length<JSON.stringify(full).length/8,'board payload materially shrinks while keeping playable base prices');
  assert.deepEqual(await get('/sports/99/matches?view=board'),[]);
  const detail=await get(`/matches/${matchId}`);
  assert.ok(detail.markets.length>=103,'detail endpoint retains all underlying markets');
  console.log('PASS board projection: base-market contracts, original count, immutable detail, both actual HTTP routes, no builder catalog work and substantially smaller payload');
} finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  pool.query=originalQuery;await sql.close();
}
