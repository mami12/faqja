/**
 * Server-authoritative settlement for Book of Ra Deluxe (real wallet).
 *
 * Same money flow as Sizzling: a paid spin debits only the stake and keeps the
 * win PENDING; the free spins add to that pending amount; collect pays it.
 */
import {pool} from '../db.mjs';
import {assertPlayerCanBet} from '../ledger/player-controls.mjs';
import {creditPendingWin} from './transactions.mjs';
import {FREE_SPINS, LINES, PAYTABLE, gradeGrid, pickMudSymbol, randomGrid} from './bookofra.mjs';

const money=n=>Number(Number(n).toFixed(2));
const fault=(status,message)=>Object.assign(new Error(message),{status});
const BETS=[1,2,3,5,10,20,30,50,100];
const DENOM=[.5,1,2,5,10];
const LABEL='Book of Ra Deluxe';

async function lockAccounts(db,userId){
  const lookup=await db.query('select manager_id from app_user where id=$1',[userId]);
  if(!lookup.rows.length)throw fault(404,'Player not found');
  const ids=[userId,lookup.rows[0].manager_id].filter(Boolean).sort();
  const locked=await db.query(
    'select id,username,role,status,balance,manager_id from app_user where id=any($1::uuid[]) order by id for update',[ids]);
  const accounts=new Map(locked.rows.map(x=>[x.id,x]));
  const player=accounts.get(userId);
  if(!player||player.role!=='PLAYER'||player.status!=='ACTIVE')throw fault(403,'Player account disabled');
  if(player.manager_id!==lookup.rows[0].manager_id)throw fault(409,'Manager changed: retry');
  const manager=player.manager_id?accounts.get(player.manager_id):null;
  if(player.manager_id&&(!manager||manager.role!=='MANAGER'))throw fault(409,'Manager unavailable');
  return {player,manager};
}

/** Credits a pending win that a previous round left behind (reload/new spin). */
async function flushPending(db,userId,player,manager){
  const state=await db.query('select round_id,pending from app_casino_gamble_state where user_id=$1 for update',[userId]);
  const pending=Number(state.rows[0]?.pending||0);
  if(pending>0){
    await creditPendingWin(db,{userId,player,manager,pending,roundId:state.rows[0].round_id,label:LABEL+' · auto-collect'});
    if(state.rows[0]?.round_id)await db.query('update app_casino_round set payout=$2 where id=$1',[state.rows[0].round_id,pending]);
  }
  await db.query('update app_casino_gamble_state set pending=0,step=0,player_card=null,updated_at=now() where user_id=$1',[userId]);
}

export async function bookOfRaFreeState(userId){
  const {rows}=await pool.query(
    'select left_spins,done_spins,mud,bet,lines from app_casino_freespin_state where user_id=$1',[userId]);
  return rows[0]||null;
}

export async function placeBookOfRaSpin({userId,requestId,bet,denomination=1,lines=10,mode='spin'}){
  bet=Number(bet);denomination=Number(denomination);lines=Number(lines);
  const db=await pool.connect();
  try{
    await db.query('begin');
    const {player,manager}=await lockAccounts(db,userId);
    const settings=await db.query('select enabled from app_casino_settings where id=1 for share');
    if(!settings.rows[0]?.enabled)throw fault(403,'Casino disabled by administrator');

    if(mode==='freespin'){
      const state=await db.query(
        'select round_id,left_spins,done_spins,mud,bet,lines from app_casino_freespin_state where user_id=$1 for update',[userId]);
      const fs=state.rows[0];
      if(!fs)throw fault(409,'NO_FREE_SPINS');
      const grid=randomGrid();
      const graded=gradeGrid(grid,Number(fs.bet),Number(fs.lines),Number(fs.mud));
      const left=Number(fs.left_spins)-1, done=Number(fs.done_spins)+1;
      const pending=await db.query('select pending from app_casino_gamble_state where user_id=$1 for update',[userId]);
      const before=Number(pending.rows[0]?.pending||0);
      const total=money(before+graded.total);
      await db.query(
        `insert into app_casino_gamble_state(user_id,round_id,pending,step,player_card)
         values($1,$2,$3,0,null)
         on conflict(user_id) do update set pending=excluded.pending,round_id=excluded.round_id,updated_at=now()`,
        [userId,fs.round_id,total]);
      if(left>0)await db.query('update app_casino_freespin_state set left_spins=$2,done_spins=$3,updated_at=now() where user_id=$1',
        [userId,left,done]);
      else await db.query('delete from app_casino_freespin_state where user_id=$1',[userId]);
      await db.query('commit');
      return {grid,graded,balance:Number(player.balance),pending:total,free:{left,done,mud:Number(fs.mud)}};
    }

    if(!BETS.includes(bet)||![...DENOM].includes(denomination)||lines!==LINES.length)
      throw fault(400,'Invalid Book of Ra bet, lines or denomination');
    const stake=money(bet*denomination*lines);
    const previous=await db.query('select * from app_casino_round where user_id=$1 and client_request_id=$2',[userId,requestId]);
    if(previous.rows.length){
      const old=previous.rows[0];
      await db.query('commit');
      return {roundId:old.id,stake:Number(old.stake),payout:Number(old.payout),
        balance:Number(old.balance_after),result:old.result,replayed:true,grid:null};
    }
    await flushPending(db,userId,player,manager);
    if(Number(player.balance)<stake)throw fault(400,'Insufficient balance');
    await assertPlayerCanBet(db,userId,stake);
    const grid=randomGrid();
    const graded=gradeGrid(grid,bet,lines);
    const balance=money(Number(player.balance)-stake);
    const round=await db.query(
      `insert into app_casino_round(user_id,client_request_id,game_id,game_version,bet,denomination,lines,stake,payout,balance_after,result)
       values($1,$2,'bookofra','BOOKOFRA_V1',$3,$4,$5,$6,$7,$8,$9::jsonb) returning id`,
      [userId,requestId,bet,denomination,lines,stake,graded.total,balance,
        JSON.stringify({symbols:Object.fromEntries(grid.map((c,i)=>[i,Object.fromEntries(c.map((s,r)=>[r,{code:s}]))])),
          line_wins:graded.line_wins,total:graded.total.toFixed(2)})]);
    const roundId=round.rows[0].id;
    await db.query(
      `insert into app_casino_gamble_state(user_id,round_id,pending,step,player_card)
       values($1,$2,$3,0,null)
       on conflict(user_id) do update set round_id=excluded.round_id,pending=excluded.pending,step=0,player_card=null,updated_at=now()`,
      [userId,roundId,graded.total]);
    await db.query(
      "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_SPIN',$3,$4,$5)",
      [userId,-stake,roundId,balance,LABEL+' · spin']);
    await db.query('update app_user set balance=$2,updated_at=now() where id=$1',[userId,balance]);
    if(manager){
      const managerAfter=money(Number(manager.balance)+stake);
      await db.query('update app_user set balance=$2,updated_at=now() where id=$1',[manager.id,managerAfter]);
      await db.query(
        "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_MANAGER_NET',$3,$4,$5)",
        [manager.id,stake,roundId,managerAfter,'Casino stake · '+player.username]);
    }
    const books=grid.flat().filter(s=>s===0).length;
    let free=null;
    if(books>=3){
      const mud=pickMudSymbol();
      await db.query(
        `insert into app_casino_freespin_state(user_id,round_id,left_spins,done_spins,mud,bet,lines)
         values($1,$2,$3,0,$4,$5,$6)
         on conflict(user_id) do update set round_id=excluded.round_id,left_spins=excluded.left_spins,
           done_spins=0,mud=excluded.mud,bet=excluded.bet,lines=excluded.lines,updated_at=now()`,
        [userId,roundId,FREE_SPINS,mud,bet,lines]);
      free={left:FREE_SPINS,done:0,add:0,mud,wins:{total:graded.total,win_before_chain:0},type:'freespins'};
    }
    await db.query('commit');
    return {roundId,stake,payout:graded.total,balance,grid,graded,free,replayed:false};
  }catch(error){await db.query('rollback').catch(()=>{});throw error;}
  finally{db.release();}
}

export {PAYTABLE};
