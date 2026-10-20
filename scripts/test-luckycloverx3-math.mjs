import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REELS,LINES,spin,grade} from '../server/casino/luckycloverx3-math.mjs';
test('original reel profile and CT paylines',()=>{
  assert.deepEqual(REELS.map(x=>x.length),[49,48,50,48,49]);
  assert.equal(LINES.length,30);
});
test('spin returns a valid 5x3 grid',()=>{
  const grid=spin(()=>0);
  assert.equal(grid.length,5);
  assert.ok(grid.every(reel=>reel.length===3));
  assert.ok(grade(grid).total>=0);
});
test('five sevens pay 3000 on one line',()=>{
  const grid=Array.from({length:5},()=>[8,4,8]);
  assert.equal(grade(grid,1,1).total,3000);
});
test('consecutive wild reels double a line win',()=>{
  const grid=[[8,4,8],[1,4,8],[1,4,8],[8,4,8],[8,4,8]];
  assert.equal(grade(grid,1,1).total,6000);
});
test('invalid bets and line counts rejected',()=>{
  assert.throws(()=>grade(spin(()=>0),-1,5));
  assert.throws(()=>grade(spin(()=>0),1,31));
});
