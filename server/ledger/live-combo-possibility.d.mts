export type ComboLeg = { market: '1X2' | 'DC' | 'BTTS' | 'TOTAL'; outcome: string; line?: string };
export function minimumTotalForResult(home: number, away: number, result: string): number | null;
export function isPossibleResultUnder(home: number, away: number, result: string, line: number | string): boolean;
export function isPossibleLiveCombo(legs: ComboLeg[], match: {
  status?: string; service?: string; live?: boolean;
  homeScore?: number; awayScore?: number; home_score?: number; away_score?: number;
  scoreAt?: string | null; score_at?: string | null;
}): boolean;
