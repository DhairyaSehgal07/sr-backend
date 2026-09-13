export const JUTE_BAG_WEIGHT = 0.7;
export const LENO_BAG_WEIGHT = 0.06;

export const STORAGE_CATEGORIES = [
  'OWNED',
  'PURCHASED',
  'CONTRACT FARMING',
  'RENTAL',
  'FAZALPUR',
] as const;

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];
