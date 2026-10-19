import assert from 'node:assert/strict';
import {theoreticalRtp,publicRtpProfiles,randomProfileGrid} from '../server/casino/rtp-profiles.mjs';
import {gradeGrid} from '../server/casino/sizzling-demo.mjs';
import {GENERIC_GAME_IDS,playGenericGame} from '../server/casino/generic-engine.mjs';

const profiles=publicRtpProfiles();
assert.equal(profiles.length,3);
for(const profile of profiles){
  assert.ok(profile.theoreticalRtp>0&&profile.theoreticalRtp<100,
    'Casino profile must not have >100% theoretical RTP: '+JSON.stringify(profile));
  assert.equal(profile.theoreticalRtp,theoreticalRtp(profile.id));
  for(let i=0;i<100;i++){
    const grid=randomProfileGrid(profile.id);
    assert.equal(grid.length,5);
    assert.ok(grid.every(reel=>reel.length===3&&reel.every(n=>Number.isInteger(n)&&n>=0&&n<=7)));
    const result=gradeGrid(grid,1,1);
    assert.ok(Number.isFinite(result.total)&&result.total>=0);
  }
}
const byId=Object.fromEntries(profiles.map(x=>[x.id,x.theoreticalRtp]));
assert.ok(byId.SIZZLING_CALM_V1 < byId.SIZZLING_STANDARD_V1);
assert.ok(byId.SIZZLING_STANDARD_V1 < byId.SIZZLING_BONUS_V1);
assert.equal(GENERIC_GAME_IDS.length,8);
for(const id of GENERIC_GAME_IDS){
  for(let i=0;i<100;i++){
    const result=playGenericGame(id,5);
    assert.ok(Number.isFinite(result.win)&&result.win>=0);
    assert.ok(result.grid.every(row=>row.every(n=>Number.isInteger(n)&&n>=0&&n<=7)));
    assert.ok(result.grid.length===(id==='gates'?5:3));
    assert.equal(result.grid[0].length,id==='gates'?6:5);
  }
}
console.log('Casino RTP (theoretical, not independently certified):',profiles);
console.log('8 server-authoritative custom casino games tested');
