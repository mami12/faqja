/**
 * Server-authoritative settlement for the Sizzling Hot Deluxe real wallet.
 *
 * Money flow (kept identical to the physical cabinet so the casino meter and
 * the sportsbook balance never disagree):
 *   spin     -> debit the stake only; the win stays PENDING (gamble_state)
 *   collect  -> credit the pending win (this is when the balance grows)
 *   gamble   -> only the pending amount changes, never the balance
 *   init     -> any abandoned pending win is auto-collected
 */
import {pool} from '../db.mjs';
import {assertPlayerCanBet} from '../ledger/bet-risk.mjs';
import {randomProfileGrid,profileById,profileFactor} from './rtp-profiles.mjs';
import {gradeGrid,symbolMatrix} from './sizzling-demo.mjs';

const money=n=>Number(Number(n).toFixed(2));
const fault=(status,message)=>Object.assign(new Error(message),{status});
const GAME_LABEL='Sizzling Hot Deluxe';

/**
 * Credits a pending win and moves the house/manager ledger the other way.
 * Runs inside the caller's transaction; mutates player/manager in memory.
 */
export async function creditPendingWin(db,{userId,player,manager,pending,roundId,label=GAME_LABEL}){
  if(!(pending>0))return Number(player.balance);
  const after=money(Number(player.balance)+pending);
  await db.query('update app_user set balance=$2,updated_at=now() where id=$1',[userId,after]);
  await db.query(
    "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_WIN',$3,$4,$5)",
    [userId,pending,roundId,after,label+' · payout']);
  player.balance=after;
  if(manager){
    const managerAfter=money(Number(manager.balance)-pending);
    await db.query('update app_user set balance=$2,updated_at=now() where id=$1',[manager.id,managerAfter]);
    await db.query(
      "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_MANAGER_NET',$3,$4,$5)",
      [manager.id,-pending,roundId,managerAfter,label+' · payout '+player.username]);
    manager.balance=managerAfter;
  }
  return after;
}

/**
 * Credits whatever is still pending for a player (page reload, new spin or
 * closed tab). Safe to call with no pending state.
 */
export async function settlePendingWin(userId,{roundId=null}={}){
  const db=await pool.connect();
  try{
    await db.query('begin');
    const lookup=await db.query('select manager_id from app_user where id=$1',[userId]);
    if(!lookup.rows.length)throw fault(404,'PLAYER_NOT_FOUND');
    const ids=[userId,lookup.rows[0].manager_id].filter(Boolean).sort();
    const locked=await db.query(
      'select id,username,role,status,balance,manager_id from app_user where id=any($1::uuid[]) order by id for update',[ids]);
    const users=new Map(locked.rows.map(row=>[row.id,row]));
    const player=users.get(userId);
    const manager=player?.manager_id?users.get(player.manager_id):null;
    if(!player)throw fault(404,'PLAYER_NOT_FOUND');
    const state=await db.query(
      'select round_id,pending from app_casino_gamble_state where user_id=$1 for update',[userId]);
    const row=state.rows[0];
    const pending=Number(row?.pending||0);
    if(pending>0){
      await creditPendingWin(db,{userId,player,manager,pending,
        roundId:roundId||row.round_id,label:GAME_LABEL+' · auto-collect'});
      if(row?.round_id)await db.query('update app_casino_round set payout=$2 where id=$1',[row.round_id,pending]);
    }
    await db.query(
      'update app_casino_gamble_state set pending=0,step=0,player_card=null,updated_at=now() where user_id=$1',
      [userId]);
    await db.query('commit');
    return Number(player.balance);
  }catch(error){await db.query('rollback').catch(()=>{});throw error;}
  finally{db.release();}
}

export async function placeCasinoSpin({userId,requestId,bet,denomination=1,lines=5}){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId)))
    throw fault(400,'Unique UUID required');
  bet=Number(bet);denomination=Number(denomination);lines=Number(lines);
  if(![1,2,3,5,10,20,30,50,100].includes(bet)||![.5,1,2,5,10].includes(denomination)||lines!==5)
    throw fault(400,'Invalid Sizzling bet, lines or denomination');
  const stake=money(bet*denomination*lines),client=await pool.connect();
  try{
    await client.query('begin');
    // Manager and player locks follow the same global UUID order as the cashier.
    const lookup=await client.query('select manager_id from app_user where id=$1',[userId]);
    if(!lookup.rows.length)throw fault(404,'Player not found');
    const ids=[userId,lookup.rows[0].manager_id].filter(Boolean).sort();
    const locked=await client.query(
      'select id,username,role,status,balance,manager_id from app_user where id=any($1::uuid[]) order by id for update',[ids]);
    const accounts=new Map(locked.rows.map(x=>[x.id,x]));
    const player=accounts.get(userId);
    if(!player||player.role!=='PLAYER'||player.status!=='ACTIVE')throw fault(403,'Player account disabled');
    if(player.manager_id!==lookup.rows[0].manager_id)throw fault(409,'Manager changed: retry');
    const manager=player.manager_id?accounts.get(player.manager_id):null;
    if(player.manager_id&&(!manager||manager.role!=='MANAGER'))throw fault(409,'Manager unavailable');
    const settings=await client.query('select enabled,profile from app_casino_settings where id=1 for share');
    if(!settings.rows[0]?.enabled)throw fault(403,'Casino disabled by administrator');
    const profile=settings.rows[0].profile;
    if(!profileById(profile))throw fault(503,'Unknown RTP profile');
    const previous=await client.query('select * from app_casino_round where user_id=$1 and client_request_id=$2',
      [userId,requestId]);
    if(previous.rows.length){
      const old=previous.rows[0];
      if(old.game_id!=='sizzling'||Number(old.bet)!==bet||Number(old.denomination)!==denomination||Number(old.lines)!==lines)
        throw fault(409,'Request key was used for a different wager');
      await client.query('commit');
      return {roundId:old.id,stake:Number(old.stake),payout:Number(old.payout),
        balance:Number(old.balance_after),result:old.result,profile:old.game_version,replayed:true};
    }
    // A pending win from an earlier spin is credited before the new wager, so a
    // player can never lose it by spinning (or reloading) without collecting.
    const pendingState=await client.query(
      'select round_id,pending from app_casino_gamble_state where user_id=$1 for update',[userId]);
    const carried=Number(pendingState.rows[0]?.pending||0);
    if(carried>0){
      await creditPendingWin(client,{userId,player,manager,pending:carried,
        roundId:pendingState.rows[0].round_id,label:GAME_LABEL+' · auto-collect'});
      if(pendingState.rows[0]?.round_id)
        await client.query('update app_casino_round set payout=$2 where id=$1',
          [pendingState.rows[0].round_id,carried]);
    }
    if(Number(player.balance)<stake)throw fault(400,'Insufficient balance');
    await assertPlayerCanBet(client,userId,stake);
    const grid=randomProfileGrid(profile);
    const grading=gradeGrid(grid,bet,denomination);
    // Reels are uniform/original; profiles only scale the graded payouts
    // (1 = pays exactly the displayed paytable, i.e. the standard profile).
    const factor=profileFactor(profile);
    const lineWins=grading.line_wins.map(win=>({...win,amount:money(Number(win.amount)*factor).toFixed(2)}));
    const payout=money(lineWins.reduce((sum,win)=>sum+Number(win.amount),0));
    const result={symbols:symbolMatrix(grid),line_wins:lineWins,total:payout.toFixed(2)};
    const version=profile;
    // Only the stake leaves the wallet on a spin; the win is credited on collect.
    const balance=money(Number(player.balance)-stake);
    const round=await client.query(
      "insert into app_casino_round(user_id,client_request_id,game_id,game_version,bet,denomination,lines,stake,payout,balance_after,result) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) returning id",
      [userId,requestId,'sizzling',version,bet,denomination,lines,stake,payout,balance,JSON.stringify(result)]);
    const roundId=round.rows[0].id;
    // The pending win can be doubled or lost in the gamble; it is paid on collect.
    await client.query(
      `insert into app_casino_gamble_state(user_id,round_id,pending,step,player_card)
       values($1,$2,$3,0,null)
       on conflict(user_id) do update set round_id=excluded.round_id,
         pending=excluded.pending,step=0,player_card=null,updated_at=now()`,
      [userId,roundId,payout]);

    await client.query(
      "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_SPIN',$3,$4,$5)",
      [userId,-stake,roundId,balance,GAME_LABEL+' · spin']);
    await client.query('update app_user set balance=$2,updated_at=now() where id=$1',[userId,balance]);
    if(manager){
      // The house keeps the stake now; it pays the win when the player collects.
      const managerAfter=money(Number(manager.balance)+stake);
      await client.query('update app_user set balance=$2,updated_at=now() where id=$1',[manager.id,managerAfter]);
      await client.query(
        "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_MANAGER_NET',$3,$4,$5)",
        [manager.id,stake,roundId,managerAfter,'Casino stake · '+player.username]);
    }
    await client.query('commit');
    return {roundId,stake,payout,balance,result,profile:version,replayed:false};
  }catch(error){await client.query('rollback').catch(()=>{});throw error;}
  finally{client.release();}
}
