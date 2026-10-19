/**
 * Transparent immutable math profiles for the Sizzling Hot Deluxe adapter.
 * NOT Novomatic math/certification.
 *
 * The reels are UNIFORM (every stop equally likely) and use the original
 * Novomatic paytable, exactly like the real cabinet. RTP differences between
 * profiles come from a fixed payout factor applied to the graded line wins —
 * never from skewing which symbols appear on the reels. (An earlier revision
 * boosted one symbol per reel by 33–43x, which made reel 1 show a seven in
 * ~85% of spins: visually nothing like the original game.)
 *
 * The exact long-run expectation is calculated analytically, not inferred
 * from a few simulated spins. Never change profiles per player.
 */
import { randomInt } from 'node:crypto';
import { REELS, paytable, paylines } from './sizzling-demo.mjs';

export const RTP_PROFILES = Object.freeze([
  { id: 'SIZZLING_STANDARD_V1', label: 'Standard (origjinali)', factor: 1 },
  { id: 'SIZZLING_CALM_V1', label: 'RTP më i ulët', factor: 0.955 },
  { id: 'SIZZLING_BONUS_V1', label: 'RTP më i lartë', factor: 1.015 },
]);
export const profileById = id => RTP_PROFILES.find(x => x.id === id) || (/^SCHOOL_RTP_(100|[1-9]?[0-9])$/.test(String(id)) ? {id, label:'Simulim '+String(id).split('_').at(-1)+'%',factor:1} : null);
export const simulationRtp = id => /^SCHOOL_RTP_(100|[1-9]?[0-9])$/.test(String(id)) ? Number(String(id).split('_').at(-1)) : null;
const normalize = x => {
  const profile = profileById(x);
  if (!profile) throw new Error('Unknown casino RTP profile: ' + x);
  return profile;
};

const cache = new Map();
function reelModel() {
  if (cache.has('uniform')) return cache.get('uniform');
  const models = REELS.map(reel => {
    const total = reel.length;
    const symbols = Array.from({length:3}, () => Array(8).fill(0));
    const scatter = Array(4).fill(0);
    reel.forEach((_symbol, stop) => {
      let scatters = 0;
      for (let row=0;row<3;row++){
        const symbol = reel[(stop+row)%reel.length];
        symbols[row][symbol] += 1;
        if (symbol===0) scatters++;
      }
      scatter[scatters] += 1;
    });
    return {
      reel,
      total,
      probabilities: symbols.map(row=>row.map(n=>n/total)),
      scatter: scatter.map(n=>n/total),
    };
  });
  cache.set('uniform',models);
  return models;
}

/** Uniform stop draw — identical for every profile (authentic reels). */
export function randomProfileGrid(_profileId='SIZZLING_STANDARD_V1', random=bound=>randomInt(bound)) {
  return reelModel().map(({reel,total})=>{
    const stop = random(total);
    return [reel[stop],reel[(stop+1)%reel.length],reel[(stop+2)%reel.length]];
  });
}

/** Analytic RTP of the uniform reels + original paytable, before any factor. */
export function baseRtp() {
  const models=reelModel();
  let lineReturn=0;
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
  return (lineReturn+scatterReturn)/totalBet*100;
}

export function theoreticalRtp(profileId='SIZZLING_STANDARD_V1') {
  const simulated = simulationRtp(profileId);
  if (simulated !== null) return simulated;
  return Number((baseRtp()*normalize(profileId).factor).toFixed(6));
}

/** Fixed payout multiplier for a profile (1 = pays exactly the paytable). */
export function profileFactor(profileId='SIZZLING_STANDARD_V1') {
  const simulated = simulationRtp(profileId);
  if (simulated !== null) return simulated/baseRtp();
  return normalize(profileId).factor;
}

export function publicRtpProfiles(){
  return [...RTP_PROFILES.map(p=>({id:p.id,label:p.label,theoreticalRtp:theoreticalRtp(p.id),certified:false})), ...Array.from({length:101},(_,n)=>({id:'SCHOOL_RTP_'+n,label:'Simulim '+n+'%',theoreticalRtp:n,certified:false}))];
}
