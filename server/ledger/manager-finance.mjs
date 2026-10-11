export function managerCommissionRate(selectionCount) {
  if (selectionCount <= 1) return 0.03;
  if (selectionCount === 2) return 0.05;
  return 0.07;
}

export function managerCommission(stake, selectionCount) {
  return Number((Number(stake) * managerCommissionRate(selectionCount)).toFixed(2));
}

export function managerCommissionPercent(selectionCount) {
  return Math.round(managerCommissionRate(selectionCount) * 100);
}
