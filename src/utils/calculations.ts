import { JUTE_BAG_WEIGHT, LENO_BAG_WEIGHT } from '../config/constants.js';

export type BagWeightType = 'JUTE' | 'LENO';

export interface IncomingNetWeightInput {
  bagsReceived?: number | null;
  grossWeightKg?: number | null;
  tareWeightKg?: number | null;
}

export interface GradingNetWeightOrderDetailInput {
  bagType: BagWeightType;
  quantity: number;
  weightPerBagKg: number;
}

export function formatNumberMaxTwoDecimals(value: number): string {
  return parseFloat(Number(value).toFixed(2)).toString();
}

export function getBagWeightKg(bagType: BagWeightType): number {
  return bagType === 'LENO' ? LENO_BAG_WEIGHT : JUTE_BAG_WEIGHT;
}

export function calculateIncomingNetWeightKg({
  bagsReceived,
  grossWeightKg,
  tareWeightKg,
}: IncomingNetWeightInput): number | null {
  if (grossWeightKg == null || tareWeightKg == null) {
    return null;
  }

  return grossWeightKg - tareWeightKg - (bagsReceived ?? 0) * JUTE_BAG_WEIGHT;
}

export function calculateGradingNetWeightKg(
  orderDetails: GradingNetWeightOrderDetailInput[]
): number {
  return orderDetails.reduce((total, detail) => {
    const bagWeightKg = getBagWeightKg(detail.bagType);
    return total + detail.quantity * (detail.weightPerBagKg - bagWeightKg);
  }, 0);
}

export function calculateWastageKg(
  incomingNetWeightKg: number,
  gradingNetWeightKg: number
): number {
  return incomingNetWeightKg - gradingNetWeightKg;
}

export function calculateWastagePercentage(
  wastageKg: number,
  incomingNetWeightKg: number
): number | null {
  if (incomingNetWeightKg === 0) {
    return null;
  }

  return (wastageKg / incomingNetWeightKg) * 100;
}
