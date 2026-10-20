/** Lucky Clover X3: isolated virtual-credit demo API. Never touches real wallets. */
import {Router} from 'express';
import {randomBytes} from 'node:crypto';
import {spin,grade} from './luckycloverx3-math.mjs';
const router=Router();
const sessions=new Map();
const ttl=4*60*60*1000;
const money=n=>Math.round(n*100)/100;
function session(req,res){
  let id=/(?:^|;\s*)lucky_x3_demo=([a-f0-9]{32})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  if(!id||!sessions.has(id)){id=randomBytes(16).toString('hex');sessions.set(id,{balance:1000,pending:0,updated:Date.now()});res.cookie('lucky_x3_demo',id,{httpOnly:true,sameSite:'strict',maxAge:ttl,path:'/app/api/casino/luckycloverx3'});}
  const s=sessions.get(id);if(Date.now()-s.updated>ttl){s.balance=1000;s.pending=0;}s.updated=Date.now();
  if(sessions.size>2000)for(const [key,val] of sessions)if(Date.now()-val.updated>ttl)sessions.delete(key);
  return s;
}
router.get('/state',(req,res)=>{const s=session(req,res);res.set('Cache-Control','no-store').json({balance:s.balance,pending:s.pending,currency:'VIRTUAL'});});
router.post('/spin',(req,res)=>{
  const s=session(req,res);
  const bet=Number(req.body?.bet),lines=Number(req.body?.lines);
  if(!Number.isInteger(bet)||bet<1||bet>100||!Number.isInteger(lines)||lines<1||lines>30)return res.status(400).json({error:'Invalid bet or lines'});
  if(s.pending>0)return res.status(409).json({error:'Collect or gamble pending win first',pending:s.pending,balance:s.balance});
  const stake=money(bet*lines/30);
  if(stake<=0||s.balance<stake)return res.status(409).json({error:'Insufficient virtual credits',balance:s.balance});
  const grid=spin(),result=grade(grid,bet/30,lines);
  s.balance=money(s.balance-stake);s.pending=money(result.total);
  res.set('Cache-Control','no-store').json({grid,wins:result.wins,multiplier:result.multiplier,stake,payout:s.pending,pending:s.pending,balance:s.balance});
});
router.post('/collect',(req,res)=>{const s=session(req,res);s.balance=money(s.balance+s.pending);const amount=s.pending;s.pending=0;res.set('Cache-Control','no-store').json({collected:amount,balance:s.balance,pending:0});});
router.post('/gamble',(req,res)=>{
  const s=session(req,res);if(s.pending<=0)return res.status(409).json({error:'Nothing to gamble'});
  const choice=req.body?.choice;if(choice!=='red'&&choice!=='black')return res.status(400).json({error:'Choose red or black'});
  const won=(randomBytes(1)[0]&1)===(choice==='red'?0:1);
  s.pending=money(won?s.pending*2:0);
  res.set('Cache-Control','no-store').json({won,choice,pending:s.pending,balance:s.balance});
});
export default router;
