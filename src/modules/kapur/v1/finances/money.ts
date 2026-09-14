/** Convert rupees to integer paise. Avoids storing IEEE floats in finance docs. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function billedPaiseFromBagLines(
  lines: Array<{ costPerBag: number; quantityIssued: number }>
): number {
  return lines.reduce(
    (sum, line) => sum + rupeesToPaise(line.costPerBag) * line.quantityIssued,
    0
  );
}

export type FinanceSaleStatus = 'open' | 'partial' | 'settled';

export function saleStatusFromAmounts(
  amountPaise: number,
  recoveredPaise: number
): FinanceSaleStatus {
  if (recoveredPaise <= 0) {
    return 'open';
  }
  if (recoveredPaise >= amountPaise) {
    return 'settled';
  }
  return 'partial';
}
