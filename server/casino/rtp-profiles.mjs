/**
 * Transparent immutable math profiles for the custom Sizzling demo adapter.
 * NOT Novomatic math/certification. Every profile uses secure independent
 * reel stops. The exact long-run expectation is calculated analytically, not
 * inferred from a few simulated spins. Never change profiles per player.
 */
import { randomInt } from 'node:crypto';
import { REELS, paytable, paylines } from './sizzling-demo.mjs';

export const RTP_PROFILES = Object.freeze([
  { id: 'SIZZLING_STANDARD_V1', label: 'Standard (versioni 1)', boost: 38 },
  { id: 'SIZZLING_CALM_V1', label: 'RTP më i ulët (versioni 1)', boost: 43 },
  { id: 'SIZZLING_BONUS_V1', label: 'RTP më i lartë (versioni 1)', boost: 33 },
]);
export const profileById = id => RTP_PROFILES.find(x => x.id === id) || null;
const normalize = x => {
  const profile = profileById(x);
  if (!profile) throw new Error('Unknown casino RTP profile: ' + x);
  return profile;
};
function stopWeights(reel, profile, reelIndex) {
  // Each reel favors a DIFFERENT fixed symbol. These weights are global and
  // immutable; they cannot depend on player balance, bets or session outcome.
  // The exact expectation is calculated from the weights and original paytable.
  const preferredSymbol = [1,2,3,4,5][reelIndex];
  return reel.map(symbol => symbol===preferredSymbol ? profile.boost : 1);
}
const cache = new Map();
function reelModel(profileId) {
  const profile = normalize(profileId);
  if (cache.has(profileId)) return cache.get(profileId);
  const models = REELS.map((reel,reelIndex) => {
    const weights = stopWeights(reel, profile, reelIndex);
    const total = weights.reduce((a, b) => a + b, 0);
    const symbols = Array.from({length:3}, () => Array(8).fill(0));
    const scatter = Array(4).fill(0);
    reel.forEach((_symbol, stop) => {
      const weight = weights[stop];
      if (!weight) return;
      let scatters = 0;
      for (let row=0;row<3;row++){
        const symbol = reel[(stop+row)%reel.length];
        symbols[row][symbol] += weight;
        if (symbol===0) scatters++;
      }
      scatter[scatters] += weight;
    });
    return {
      reel, weights, total,
      probabilities: symbols.map(row=>row.map(n=>n/total)),
      scatter: scatter.map(n=>n/total),
    };
  });
  cache.set(profileId,models);
  return models;
}
export function randomProfileGrid(profileId='SIZZLING_STANDARD_V1', random=bound=>randomInt(bound)) {
  return reelModel(profileId).map(({reel,weights,total})=>{
    let selected = random(total);
    let stop = 0;
    while(stop<weights.length-1 && selected>=weights[stop]) {
      selected -= weights[stop];
      stop++;
    }
    return [reel[stop],reel[(stop+1)%reel.length],reel[(stop+2)%reel.length]];
  });
}
export function theoreticalRtp(profileId='SIZZLING_STANDARD_V1') {
  const models=reelModel(profileId);
  let lineReturn=0;
  // Each independently weighted reel has a different symbol distribution at
  // each row. All wins are left-to-right; count=5 also covers the final reel.
  for (const line of paylines) {
    for (let symbol=1;symbol<=7;symbol++){
      let prefix=1;
      for(let n=1;n<=5;n++){
        prefix *= models[n-1].probabilities[line[n-1]][symbol];
        if(n<2)continue;
        const multiplier=paytable[symbol]?.[n]||0;
        if(!multiplier)continue;
        const exact=prefix*(n<5 ? 1-models[n].probabilities[line[n]][symbol] : 1);
        lineReturn += multiplier*exact;
      }
    }
  }
  // Exactly 3, 4, 5 visible scatter symbols across all columns pay.
  // Cells on a reel are dependent, hence this convolution uses stop-level counts.
  let distribution=[1];
  for(const model of models){
    const next=Array(distribution.length+3).fill(0);
    for(let i=0;i<distribution.length;i++)
      for(let count=0;count<=3;count++)
        next[i+count]+=distribution[i]*model.scatter[count];
    distribution=next;
  }
  let scatterReturn=0;
  for(const [str,count] of Object.entries(paytable[0]))
    scatterReturn += (distribution[Number(str)]||0)*count*paylines.length;
  // A 1-unit bet on each of the five lines costs five units.
  const totalBet=paylines.length;
  return Number(((lineReturn+scatterReturn)/totalBet*100).toFixed(6));
}
export function publicRtpProfiles(){
  return RTP_PROFILES.map(p=>({id:p.id,label:p.label,theoreticalRtp:theoreticalRtp(p.id),certified:false}));
}
