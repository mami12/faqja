import { frozenSelectionPrice } from './system-columns.mjs';

export const COMBO_PRICE_LIMIT = 1000;

/** Two real 4dp prices, exact multiplication and half-up rounding to 4dp. */
export function multipliedComboPrice(parts) {
  if (!Array.isArray(parts) || parts.length !== 2) return null;
  const prices = parts.map(p => Number(p.outcome?.odds ?? p.price));
  if (prices.some(p => !Number.isFinite(p) || p <= 1 || p > COMBO_PRICE_LIMIT)) return null;
  const units = prices.map(p => BigInt(frozenSelectionPrice(p).toFixed(4).replace('.','')));
  const product = Number((units[0] * units[1] + 5000n) / 10000n) / 10000;
  return product > 1 && product <= COMBO_PRICE_LIMIT ? product : null;
}
