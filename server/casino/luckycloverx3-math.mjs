/** Lucky Clover x3 math, adapted from Slotopol (MIT license).
 * Source: github.com/slotopol/server/game/slot/ct/luckycloverx3
 * The reel strips below are the 95.023624 RTP profile for 5 selected lines.
 * Pure functions only. Not connected to any account balance.
 */
import {randomInt} from 'node:crypto';
export const REELS=[[9,9,9,5,4,7,9,6,9,9,9,7,11,11,11,5,11,11,11,2,6,5,6,5,7,8,8,8,6,3,7,8,8,8,3,11,11,8,10,10,10,4,10,10,7,10,10,10,7],[6,7,8,8,8,1,11,11,7,5,7,5,7,5,9,9,9,8,6,7,4,5,2,9,9,9,6,10,10,10,11,11,11,10,10,9,4,8,8,8,6,7,10,10,10,11,11,11],[10,10,11,11,11,6,5,1,8,8,8,9,9,9,11,11,7,8,8,8,7,5,9,9,9,3,9,7,5,8,6,3,4,7,6,7,10,10,10,6,10,10,10,7,11,11,11,2,5,4],[6,5,11,11,5,10,10,8,8,8,4,6,9,9,9,2,7,11,11,11,9,9,9,7,11,11,11,5,6,4,7,1,8,8,8,9,10,10,10,7,10,10,10,5,7,8,7,6],[7,9,11,11,11,4,8,6,10,10,10,9,9,9,7,3,7,9,9,9,7,5,6,5,10,10,10,11,11,11,8,8,8,7,8,8,8,6,3,10,10,4,6,11,11,5,7,2,5]];
export const LINES=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1],[0,1,0,1,0],[2,1,2,1,2],[0,1,1,1,1],[2,1,1,1,1],[1,1,0,0,0],[1,1,2,2,2],[1,0,0,0,0],[1,2,2,2,2],[0,0,0,0,1],[2,2,2,2,1],[2,2,1,2,2],[0,0,1,0,0],[0,1,1,1,0],[2,1,1,1,2],[2,0,0,0,2],[0,2,2,2,0],[0,2,0,2,0],[2,0,2,0,2],[2,0,1,0,2],[0,2,1,2,0],[1,0,0,0,1]];
const PAY=[[],[],[],[0,10,50,200,3000],[0,0,40,100,500],[0,0,40,100,500],[0,0,20,50,200],[0,0,10,30,100],[0,0,10,30,100],[0,0,10,30,100],[0,0,10,30,100]];
export function spin(rand=randomInt){
  return REELS.map(strip=>{const stop=rand(strip.length);if(!Number.isInteger(stop)||stop<0||stop>=strip.length)throw Error('Bad reel stop');return [0,1,2].map(i=>strip[(stop+i)%strip.length]);});
}
export function grade(grid,bet=1,selectedLines=5){
  if(!Array.isArray(grid)||grid.length!==5||grid.some(r=>!Array.isArray(r)||r.length!==3||r.some(s=>!Number.isInteger(s)||s<1||s>11)))throw Error('Bad grid');
  if(!Number.isFinite(bet)||bet<=0||!Number.isInteger(selectedLines)||selectedLines<1||selectedLines>30)throw Error('Bad bet/lines');
  const wildReels=[false,...[1,2,3].map(x=>grid[x].includes(1)),false];
  let consecutive=0;
  for(let x=1;x<4;x++){if(wildReels[x])consecutive++;else break;}
  const multiplier=consecutive===3?3:consecutive===2?2:1;
  const wins=[];
  for(let li=0;li<selectedLines;li++){
    const rows=LINES[li],sym=grid[0][rows[0]];
    let count=1;
    for(let x=1;x<5;x++){if(wildReels[x]||grid[x][rows[x]]===sym)count++;else break;}
    const factor=PAY[sym-1]?.[count-1]||0;
    if(factor)wins.push({type:'line',line:li,symbol:sym,count,positions:rows.slice(0,count).map((r,x)=>[x,r]),amount:bet*factor*multiplier});
  }
  const positions=id=>grid.flatMap((r,x)=>r.flatMap((s,y)=>s===id?[[x,y]]:[]));
  const star=positions(2),banana=positions(3);
  if(star.length>=3){const factor=([0,0,3,20,100][star.length-1]||0);if(factor)wins.push({type:'scatter',symbol:2,positions:star,amount:bet*selectedLines*factor*multiplier});}
  else if(banana.length>=3){const factor=([0,0,20][banana.length-1]||0);if(factor)wins.push({type:'scatter',symbol:3,positions:banana,amount:bet*selectedLines*factor*multiplier});}
  return {total:wins.reduce((sum,w)=>sum+w.amount,0),wins,multiplier};
}
