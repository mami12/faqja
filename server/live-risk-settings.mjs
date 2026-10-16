/**
 * Shared, process-local LIVE risk snapshot. DB-backed persistence lives in
 * ledger/live-risk-store.mjs, keeping this policy usable in pure unit tests.
 * Each instance refreshes its snapshot; placement also reads the locked DB row.
 */
export const DEFAULT_LIVE_RISK_SETTINGS = Object.freeze({
  enabled: true,
  leaderRules: [
    { minute: 60, goals: 3, maxOdds: 1.60 },
    { minute: 65, goals: 2, maxOdds: 1.40 },
    { minute: 70, goals: 2, maxOdds: 1.60 },
    { minute: 85, goals: 1, maxOdds: 1.10 },
  ],
  lowOddsRules: [
    { minute: 60, maxOdds: 1.05 },
    { minute: 70, maxOdds: 1.10 },
    { minute: 80, maxOdds: 1.20 },
  ],
  limits: {
    maxLiveStake: 10000,
    maxLivePayout: 100000,
    maxMatchExposure: 500000,
  },
});

const clone = obj => JSON.parse(JSON.stringify(obj));
let currentSettings = clone(DEFAULT_LIVE_RISK_SETTINGS);
const listeners = new Set();

export function liveRiskSettings() { return currentSettings; }

export function subscribeLiveRiskSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reject malformed admin input. Amounts are LEK; null means that particular
 * monetary limit is OFF. Keep number and size caps to avoid impractical rules.
 */
export function validateLiveRiskSettings(value) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Konfigurim i pavlefshëm i riskut.');
  if (typeof value.enabled !== 'boolean') fail('Aktivizimi duhet të jetë Po ose Jo.');
  if (!Array.isArray(value.leaderRules) || !Array.isArray(value.lowOddsRules) ||
      value.leaderRules.length > 12 || value.lowOddsRules.length > 12) {
    fail('Maksimumi 12 rregulla për çdo kategori.');
  }
  const valueIn = (raw,min,max,label,integer=false) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min || raw > max ||
        (integer && !Number.isInteger(raw))) fail(`${label} duhet të jetë ${min}–${max}.`);
    return raw;
  };
  const leaderRules = value.leaderRules.map((r,i) => {
    if (!r || typeof r !== 'object') fail('Rregull i pavlefshëm.');
    return {
      minute: valueIn(r.minute,0,120,`Minuta e skuadrës ${i+1}`,true),
      goals: valueIn(r.goals,1,20,`Avantazhi ${i+1}`,true),
      maxOdds: valueIn(r.maxOdds,1.01,100,`Koeficienti ${i+1}`),
    };
  });
  const lowOddsRules = value.lowOddsRules.map((r,i) => {
    if (!r || typeof r !== 'object') fail('Rregull i pavlefshëm.');
    return {
      minute: valueIn(r.minute,0,120,`Minuta e kuotës ${i+1}`,true),
      maxOdds: valueIn(r.maxOdds,1.01,100,`Koeficienti i kuotës ${i+1}`),
    };
  });
  if (new Set(leaderRules.map(r => `${r.minute}:${r.goals}`)).size !== leaderRules.length ||
      new Set(lowOddsRules.map(r => r.minute)).size !== lowOddsRules.length) {
    fail('Nuk lejohen rregulla të përsëritura me të njëjtin kusht.');
  }
  if (!value.limits || typeof value.limits !== 'object') fail('Mungojnë kufijtë financiarë.');
  const caps = {};
  for (const field of ['maxLiveStake','maxLivePayout','maxMatchExposure']) {
    const raw = value.limits[field];
    caps[field] = raw === null ? null : valueIn(raw,100,1000000000,field);
  }
  if (caps.maxLivePayout !== null && caps.maxLiveStake !== null &&
      caps.maxLivePayout < caps.maxLiveStake) {
    fail('Pagesa maksimale nuk mund të jetë më e vogël se shuma maksimale.');
  }
  return { enabled:value.enabled, leaderRules, lowOddsRules, limits:caps };
}

export function setLiveRiskSettings(value) {
  currentSettings = validateLiveRiskSettings(value);
  for (const listener of listeners) {
    try { listener(currentSettings); } catch (e) { console.error('[live risk] listener:',e.message); }
  }
  return currentSettings;
}
