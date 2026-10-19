/** Server-only game math for custom, non-provider generic slots.
 * Never call browser Math.random or accept client-provided wins.
 */
import {randomInt} from 'node:crypto';

const GAMES=Object.freeze({
  aladdin:{reels:5,rows:3,mode:'lines'},
  'big-bass':{reels:5,rows:3,mode:'hold'},
  'book-ra':{reels:5,rows:3,mode:'lines'},
  'five-reel':{reels:5,rows:3,mode:'lines'},
  gates:{reels:6,rows:5,mode:'tumble'},
  'jewels-ra':{reels:5,rows:3,mode:'lines'},
  atlantis:{reels:5,rows:3,mode:'lines'},
  anubis:{reels:5,rows:3,mode:'lines'},
});
export const GENERIC_GAME_IDS=Object.keys(GAMES);
const PATHS=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
  [0,1,2,1,0],[2,1,0,1,2],[0,0,1,0,0],[2,2,1,2,2],
  [1,0,0,0,1],[1,2,2,2,1]];
const weights=[18,17,15,14,12,10,9,5],weightTotal=weights.reduce((a,b)=>a+b,0);
const round=x=>Number(Number(x).toFixed(2));
function pick(random=randomInt){
  let n=random(weightTotal);
  for(let i=0;i<weights.length;i++){n-=weights[i];if(n<0)return i;}
  return 7;
}
function generate(game,random=randomInt){
  return Array.from({length:game.rows},()=>Array.from({length:game.reels},()=>pick(random)));
}
function evaluate(game,grid,stake){
  const cells=new Set();
  let win=0;
  if(game.mode==='tumble'){
    for(let symbol=0;symbol<7;symbol++){
      const locations=[];
      grid.forEach((row,r)=>row.forEach((s,c)=>{if(s===symbol)locations.push(r*game.reels+c);}));
      if(locations.length>=8){
        win+=stake*(locations.length>=12?10:locations.length>=10?4:1.5);
        locations.forEach(n=>cells.add(n));
      }
    }
  }else{
    for(const path of PATHS){
      const symbol=grid[path[0]][0];if(symbol===7)continue;
      let count=1;
      for(let col=1;col<game.reels;col++){
        if(grid[path[col]][col]!==symbol)break;
        count++;
      }
      if(count>=3){
        win+=stake*({3:1,4:3,5:12}[count]||0)/PATHS.length;
        for(let col=0;col<count;col++)cells.add(path[col]*game.reels+col);
      }
    }
  }
  return {win:round(win),winningCells:[...cells]};
}
export function playGenericGame(gameId,stake,random=randomInt){
  const game=GAMES[gameId];
  if(!game)throw new Error('Unknown casino game');
  if(![1,2,5,10,20,50].includes(Number(stake)))throw new Error('Invalid casino stake');
  const initial=generate(game,random),base=evaluate(game,initial,stake);
  let total=base.win,winningCells=base.winningCells,message=base.win>0?'Raund fitues':'Raundi u mbyll';
  let grid=initial,bonusSpins=0,respins=0;
  const scatters=initial.flat().filter(s=>s===7).length;
  if(scatters>=(game.mode==='tumble'?4:3)){
    bonusSpins=6;
    for(let i=0;i<bonusSpins;i++)total=round(total+evaluate(game,generate(game,random),stake).win);
    message='6 free spins u llogaritën në këtë raund';
  }
  if(game.mode==='hold'){
    const held=new Set();
    initial.forEach((row,r)=>row.forEach((s,c)=>{if(s===6)held.add(r*game.reels+c);}));
    if(held.size>=4){
      let left=3;const max=15;
      while(left>0&&respins<max&&held.size<game.reels*game.rows){
        respins++;
        const next=generate(game,random);let newCoins=0;
        next.forEach((row,r)=>row.forEach((s,c)=>{
          const index=r*game.reels+c;
          if(held.has(index))next[r][c]=6;
          else if(s===6){held.add(index);newCoins++;}
        }));
        grid=next;
        left=newCoins?3:left-1;
      }
      total=round(total+held.size*stake*.5);
      winningCells=[...held];
      message='Hold & Respin: '+respins+' rrotullime bonus';
    }
  }
  return {
    grid,win:round(total),winningCells,message,
    bonusSpins,respins,bet:stake,
  };
}
