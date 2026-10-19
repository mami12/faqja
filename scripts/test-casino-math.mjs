import assert from 'node:assert/strict';
import {theoreticalRtp,publicRtpProfiles,randomProfileGrid} from '../server/casino/rtp-profiles.mjs';
import {gradeGrid} from '../server/casino/sizzling-demo.mjs';

const allProfiles=publicRtpProfiles();
const profiles=allProfiles.filter(profile=>!profile.id.startsWith('SCHOOL_RTP_'));
const simulations=allProfiles.filter(profile=>profile.id.startsWith('SCHOOL_RTP_'));
assert.equal(simulations.length,101);
for(let rtp=0;rtp<=100;rtp++){
  const profile=simulations.find(profile=>profile.id==='SCHOOL_RTP_'+rtp);
  assert.ok(profile);
  assert.equal(profile.theoreticalRtp,rtp);
  assert.equal(theoreticalRtp(profile.id),rtp);
}
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
console.log('Sizzling math/profile verification passed:',profiles);
