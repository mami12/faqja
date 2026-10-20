import {randomUUID,createHash} from 'node:crypto';
import {pool} from '../db.mjs';
import {assertPlayerCanBet} from '../ledger/player-controls.mjs';
import {creditPendingWin} from './transactions.mjs';
import {createCtProtocol} from './ct-protocol.mjs';
import {createAgtProtocol} from './agt-protocol.mjs';
import {vikingsConfig,mapVikingsRound} from './vikings-ct-router.mjs';
import {spin as vikingSpin,spinRound} from './vikings-engine.mjs';
import {DENOMS} from './clover-ct-config.mjs';

export const ORIGINAL_GAMES={
 'lucky-clover-x3':{title:'Lucky Clover X3',kind:'ct',folder:'lucky-clover-x3',app:'LuckyCloverX3'},
 'vikings-fun':{title:"Viking's Fun",kind:'ct',folder:'vikings-fun',app:'VikingsFun'},
 'fruit-queen':{title:'Fruit Queen',kind:'agt',app:'fruitqueen'},
 'seven-hot':{title:'Seven Hot',kind:'agt',app:'sevenhot20'},
};
export {ORIGINAL_WALLET_SQL} from './original-wallet-schema.mjs';
export const walletFault=(status,message)=>Object.assign(new Error(message),{status});
const cents=n=>Math.round(Number(n)*100),money=n=>n/100;
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const digest=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
const uuid=x=>/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(String(x));

// All account, round, pending-win and protocol changes commit together. The same
// account locks serialize sportsbook wagers, cashier transfers and casino tabs.
export function createOriginalWalletStore({database=pool,checkBet=assertPlayerCanBet,ct=createCtProtocol(),vikings=createCtProtocol({spinFn:spinRound,configFn:vikingsConfig,initialGrid:()=>vikingSpin(25).grid,selectedLines:25,mapRound:mapVikingsRound}),agt=createAgtProtocol()}={}){
 const protocol=id=>id==='vikings-fun'?vikings:ORIGINAL_GAMES[id]?.kind==='ct'?ct:agt;
 const hydrate=s=>({...s,results:new Map()});
 const encode=s=>JSON.stringify({...s,results:undefined});
 async function transaction(userId,gameId,fn){
  const game=ORIGINAL_GAMES[gameId];if(!game)throw walletFault(404,'Unknown game');
  const db=await database.connect();
  try{
   await db.query('begin');
   const lookup=await db.query('select manager_id from app_user where id=$1',[userId]);
   if(!lookup.rows.length)throw walletFault(401,'Player not found');
   const ids=[userId,lookup.rows[0].manager_id].filter(Boolean).sort();
   const locked=await db.query('select id,username,role,status,balance,currency,manager_id from app_user where id=any($1::uuid[]) order by id for update',[ids]);
   const player=locked.rows.find(x=>x.id===userId),manager=locked.rows.find(x=>x.id===player?.manager_id);
   if(!player||player.role!=='PLAYER'||player.status!=='ACTIVE')throw walletFault(403,'Player account disabled');
   if(player.manager_id!==lookup.rows[0].manager_id)throw walletFault(409,'Manager changed. Retry.');
   if(player.manager_id&&(!manager||manager.role!=='MANAGER'))throw walletFault(409,'Manager unavailable');
   const settings=await db.query('select enabled from app_casino_settings where id=1 for share');
   const saved=(await db.query('select * from app_casino_original_state where user_id=$1 and game_id=$2 for update',[userId,gameId])).rows[0];
   const context={db,player,manager,game,saved,enabled:!!settings.rows[0]?.enabled};
   const answer=await fn(context);
   await db.query('commit');return answer;
  }catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{db.release();}
 }
 async function pay(ctx,amount,roundId){
  if(!Number.isSafeInteger(amount)||amount<0||amount>9e13)throw walletFault(400,'Invalid payout');
  if(amount)await creditPendingWin(ctx.db,{userId:ctx.player.id,player:ctx.player,manager:ctx.manager,pending:money(amount),roundId,label:ctx.game.title});
 }
 async function writeState(ctx,state,sessionId){
  await ctx.db.query(`insert into app_casino_original_state(user_id,game_id,session_id,state) values($1,$2,$3,$4::jsonb)
   on conflict(user_id,game_id) do update set session_id=excluded.session_id,state=excluded.state,updated_at=now()`,[ctx.player.id,ctx.saved?.game_id||state.gameId,sessionId,encode(state)]);
 }
 async function settle(ctx,s){
  await pay(ctx,Number(s.pending||0),s.roundId);s.pending=0;
 }
 return {
  async inspect(userId,gameId,sessionId){return transaction(userId,gameId,async ctx=>{
   if(!ctx.saved||ctx.saved.session_id!==sessionId||ctx.saved.state.closed)throw walletFault(401,'Game session expired');
   return {balance:Number(ctx.player.balance)};
  });},
  async launch(userId,gameId){return transaction(userId,gameId,async ctx=>{
   if(!ctx.enabled)throw walletFault(403,'Casino disabled');
   // A new launch invalidates the earlier frame. Closing/reloading never loses
   // an already awarded win, including the precalculated CT free-game chain.
   if(ctx.saved){const old=hydrate(ctx.saved.state);await settle(ctx,old);}
   const s=protocol(gameId).initialState(ORIGINAL_GAMES[gameId].app),sessionId=randomUUID();
   Object.assign(s,{credit:cents(ctx.player.balance),cash:cents(ctx.player.balance),currency:ctx.player.currency||'LEK',gameId,maxSequence:-1});
   await writeState(ctx,s,sessionId);return {sessionId};
  });},
  async close(userId,gameId,sessionId){return transaction(userId,gameId,async ctx=>{
   if(!ctx.saved||ctx.saved.session_id!==sessionId)throw walletFault(401,'Game session expired');
   const s=hydrate(ctx.saved.state);await settle(ctx,s);s.closed=true;
   await writeState(ctx,s,sessionId);return {balance:Number(ctx.player.balance)};
  });},
  async act(userId,gameId,sessionId,params){return transaction(userId,gameId,async ctx=>{
   if(!ctx.saved||ctx.saved.session_id!==sessionId||ctx.saved.state.closed)throw walletFault(401,'Game session expired. Reopen the game.');
   const s=hydrate(ctx.saved.state),isCt=ctx.game.kind==='ct';
   const commands=isCt?params:[params],responses=[];
   // A wager must commit on its own. Otherwise a caller could append a
   // result-dependent invalid command and roll back only losing spins/gambles.
   if(isCt&&commands.length!==1&&commands.some(c=>['play','continue'].includes(c.command)))throw walletFault(400,'Send each wager as one command');
   for(const command of commands){
    const action=isCt?command.command:command.action;
    const requestId=isCt?'ct:'+command.sequence_number:command.request_id;
    const mutating=isCt?!['poll','trace','init_game','subgame_finished'].includes(action):['spin','freespin','double','save'].includes(action);
    if(!isCt&&command.gamename!==ctx.game.app)throw walletFault(400,'Game mismatch');
    if(!isCt&&mutating&&!uuid(requestId))throw walletFault(400,'Unique request ID required');
    const fingerprint=digest(command);
    if(isCt||mutating){
     const old=(await ctx.db.query('select fingerprint,response from app_casino_original_event where user_id=$1 and session_id=$2 and request_id=$3',[userId,sessionId,requestId])).rows[0];
     if(old){if(old.fingerprint!==fingerprint)throw walletFault(409,'Request ID reused');responses.push(old.response);continue;}
     if(isCt&&command.sequence_number<=s.maxSequence)throw walletFault(409,'Stale sequence');
    }
    const before=cents(ctx.player.balance);
    s.credit=before;s.cash=before;
    const paidSpin=isCt?action==='play':action==='spin';
    const gambling=isCt?action==='continue'&&command.continue_params?.double_betpart!=='skip':action==='double';
    let stake=paidSpin?(isCt?Number(command.total_bet)*DENOMS.find(d=>d.id===command.game_denom)?.cents:cents(command.amount)):0;
    if(paidSpin||gambling){
     if(!ctx.enabled)throw walletFault(403,'Casino disabled');
     if(paidSpin&&(!Number.isSafeInteger(stake)||stake<=0||stake>9e13))throw walletFault(400,'Invalid stake');
     await checkBet(ctx.db,userId,money(stake));
    }
    const response=isCt?protocol(gameId).run(s,[command])[0]:agt.run(s,command);
    if(isCt&&response.status?.status!=='ok')throw walletFault(400,response.status?.msg||'Game action rejected');
    const after=isCt?s.credit:s.cash,credited=after-before+stake;
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(s.pending)||s.pending<0||s.pending>9e13||credited<0)throw walletFault(400,'Invalid game settlement');
    if(credited)await pay(ctx,credited,s.roundId);
    if(paidSpin){
     const balance=cents(ctx.player.balance)-stake;
     if(balance<0)throw walletFault(400,'Insufficient balance');
     const result=await ctx.db.query(`insert into app_casino_round(user_id,client_request_id,game_id,game_version,bet,denomination,lines,stake,payout,balance_after,result)
      values($1,$2,$3,'SLOTOPOL_ORIGINAL_V1',$4,$5,$6,$7,$8,$9,$10::jsonb) returning id`,
      [userId,randomUUID(),gameId,isCt?command.line_bet:money(stake),isCt?money(DENOMS.find(d=>d.id===command.game_denom).cents):1,isCt?command.lines:command.li,money(stake),money(s.pending),money(balance),JSON.stringify(response)]);
     s.roundId=result.rows[0].id;
     await ctx.db.query('update app_user set balance=$2,updated_at=now() where id=$1',[userId,money(balance)]);ctx.player.balance=money(balance);
     await ctx.db.query("insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_SPIN',$3,$4,$5)",[userId,-money(stake),s.roundId,money(balance),ctx.game.title+' · spin']);
     if(ctx.manager){const net=cents(ctx.manager.balance)+stake;await ctx.db.query('update app_user set balance=$2,updated_at=now() where id=$1',[ctx.manager.id,money(net)]);ctx.manager.balance=money(net);
      await ctx.db.query("insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_MANAGER_NET',$3,$4,$5)",[ctx.manager.id,money(stake),s.roundId,money(net),ctx.game.title+' · stake '+ctx.player.username]);}
    }else if(s.roundId&&(gambling||action==='freespin')){
     await ctx.db.query('update app_casino_round set payout=$2 where id=$1',[s.roundId,money(s.pending)]);
    }
    if(isCt)s.maxSequence=Math.max(s.maxSequence,command.sequence_number);
    if(isCt||mutating)await ctx.db.query('insert into app_casino_original_event(user_id,session_id,request_id,fingerprint,response) values($1,$2,$3,$4,$5::jsonb)',[userId,sessionId,requestId,fingerprint,JSON.stringify(response)]);
    responses.push(response);
   }
   await writeState(ctx,s,sessionId);return isCt?responses:responses[0];
  });}
 };
}
