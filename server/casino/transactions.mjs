/**
 * Server-authoritative, idempotent casino wallet transaction.
 * A single locked DB transaction covers player stake/payout, manager liability,
 * round record and both sides' audit ledger entries.
 */
import {pool} from '../db.mjs';
import {assertPlayerCanBet} from '../ledger/player-controls.mjs';
import {gradeGrid,symbolMatrix} from './sizzling-demo.mjs';
import {randomProfileGrid,profileById} from './rtp-profiles.mjs';

const money=n=>Number(Number(n).toFixed(2));
const fault=(status,message)=>Object.assign(new Error(message),{status});
const enabled=()=>process.env.CASINO_REAL_MONEY_ENABLED==='true'
  &&process.env.CASINO_MATH_APPROVED==='true';
export function isCasinoDeploymentApproved(){return enabled();}

export async function placeCasinoSpin({userId,requestId,bet,denomination=1,lines=5}){
  if(!enabled())throw fault(403,'Monetary casino mode is not approved for deployment');
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
    if(Number(player.balance)<stake)throw fault(400,'Insufficient balance');
    await assertPlayerCanBet(client,userId,stake);
    const grid=randomProfileGrid(profile);
    const grading=gradeGrid(grid,bet,denomination);
    const payout=money(grading.total);
    const result={symbols:symbolMatrix(grid),line_wins:grading.line_wins,total:payout.toFixed(2)};
    const version=profile;
    const debitAfter=money(Number(player.balance)-stake);
    const balance=money(debitAfter+payout);
    const round=await client.query(
      "insert into app_casino_round(user_id,client_request_id,game_id,game_version,bet,denomination,lines,stake,payout,balance_after,result) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) returning id",
      [userId,requestId,'sizzling',version,bet,denomination,lines,stake,payout,balance,JSON.stringify(result)]);
    const roundId=round.rows[0].id;
    await client.query(
      "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_SPIN',$3,$4,$5)",
      [userId,-stake,roundId,debitAfter,'Sizzling Hot Deluxe · spin']);
    if(payout>0)await client.query(
      "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_WIN',$3,$4,$5)",
      [userId,payout,roundId,balance,'Sizzling Hot Deluxe · payout']);
    await client.query('update app_user set balance=$2,updated_at=now() where id=$1',[userId,balance]);
    if(manager){
      const delta=money(stake-payout);
      const managerAfter=money(Number(manager.balance)+delta);
      await client.query('update app_user set balance=$2,updated_at=now() where id=$1',[manager.id,managerAfter]);
      await client.query(
        "insert into app_transaction(user_id,amount,type,reference_id,balance_after,description) values($1,$2,'CASINO_MANAGER_NET',$3,$4,$5)",
        [manager.id,delta,roundId,managerAfter,'Casino result · '+player.username]);
    }
    await client.query('commit');
    return {roundId,stake,payout,balance,result,profile:version,replayed:false};
  }catch(error){await client.query('rollback').catch(()=>{});throw error;}
  finally{client.release();}
}
