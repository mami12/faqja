export type CasinoGameId = 'sizzling' | 'bookofra' | 'lucky-clover-x3' | 'vikings-fun' | 'fruit-queen' | 'seven-hot';

export type CasinoControls = {
  mode: 'original' | 'custom';
  rtp: number;
  hitFrequency: number;
};

export type CasinoGameSettings = {
  gameId: CasinoGameId;
  title: string;
  profile: string | null;
  theoreticalRtp: number | null;
  profiles: {id: string; label: string; theoreticalRtp: number}[];
  configurationError: string | null;
  configurationWarning: string | null;
  controls: CasinoControls;
  mathVersion: string | null;
  effectiveRtp: number;
  effectiveHitFrequency: number | null;
  customLimits?: {minWinMultiplier: number; maxWinMultiplier: number};
  maxPayoutMultiplier?: number;
};

export type CasinoSettingsData = {
  enabled: boolean;
  games: CasinoGameSettings[];
  warning: string | null;
  stakeLimits: {min: number; max: number; currency: string};
};

export const casinoPercent = (value: number | null | undefined) => value == null ? 'Nuk është e publikuar' : `${Number(value.toFixed(3))}%`;
export const casinoStakeLimits = (limits: CasinoSettingsData['stakeLimits']) => `${limits.min.toFixed(2)}–${limits.max.toLocaleString('en-US')} lekë`;

/** The acknowledgement expires whenever the disclosed economic terms change. */
export const casinoTermsKey = (game: CasinoGameSettings, limits: CasinoSettingsData['stakeLimits']) =>
  JSON.stringify([game.gameId, game.mathVersion, game.controls.mode, game.effectiveRtp, game.effectiveHitFrequency, limits.min, limits.max, limits.currency]);
