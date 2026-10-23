/** Show the four-decimal quote used for pricing, with at least two decimals. */
export function formatOdds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const [whole, fraction] = value.toFixed(4).split('.');
  if (fraction === undefined) return whole;
  return `${whole}.${fraction.replace(/0+$/, '').padEnd(2, '0')}`;
}
