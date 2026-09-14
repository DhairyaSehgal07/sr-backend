import { z } from 'zod';
import mongoose from 'mongoose';

const nikasiBagSizeSchema = z.object({
  size: z.string().trim().min(1, 'Size is required'),
  variety: z
    .string()
    .trim()
    .min(1, 'Variety is required')
    .max(100, 'Variety must not exceed 100 characters'),
  quantityIssued: z.coerce
    .number()
    .int()
    .min(0, 'Quantity issued must be non-negative'),
  costPerBag: z.coerce.number().min(0, 'Cost per bag must be non-negative'),
});

export const createNikasiGatePassSchema = z.object({
  dispatchLedgerId: z
    .string()
    .trim()
    .min(1, 'Dispatch ledger ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid dispatch ledger ID format'
    ),

  gatePassNo: z.coerce
    .number()
    .int('Gate pass number must be an integer')
    .positive('Gate pass number must be a positive number'),

  manualGatePassNumber: z.coerce
    .number()
    .int('Manual gate pass number must be an integer')
    .positive('Manual gate pass number must be a positive number')
    .optional(),

  isBooked: z.boolean().optional(),

  billNumber: z.coerce
    .number()
    .int('Bill number must be an integer')
    .positive('Bill number must be a positive number')
    .optional(),

  bitliNumber: z.coerce
    .number()
    .int('Bitli number must be an integer')
    .positive('Bitli number must be a positive number')
    .optional(),

  billBookId: z
    .string()
    .trim()
    .min(1, 'Bill book ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid bill book ID format'
    ),

  billBook: z
    .string()
    .trim()
    .min(1, 'Bill book must be non-empty if provided')
    .optional(),

  biltiBook: z
    .string()
    .trim()
    .min(1, 'Bilti book must be non-empty if provided')
    .optional(),

  category: z.string().trim().min(1, 'Category is required'),

  date: z.coerce.date(),

  from: z.string().trim().min(1, 'From location is required'),

  to: z.string().trim().optional(),

  truckNumber: z
    .string()
    .trim()
    .max(50, 'Truck number must not exceed 50 characters')
    .optional(),

  bagSize: z
    .array(nikasiBagSizeSchema)
    .min(1, 'At least one bag size is required'),

  remarks: z
    .string()
    .trim()
    .max(500, 'Remarks must not exceed 500 characters')
    .optional(),

  netWeight: z.coerce.number().optional(),

  averageWeightPerBag: z.coerce.number().optional(),

  idempotencyKey: z
    .string()
    .trim()
    .min(1, 'Idempotency key must be non-empty if provided')
    .max(128)
    .optional(),
});

export type CreateNikasiGatePassInput = z.infer<
  typeof createNikasiGatePassSchema
>;

export const searchNikasiGatePassSchema = z.object({
  body: z.object({
    number: z.coerce
      .number()
      .int('Number must be an integer')
      .positive('Number must be a positive number'),
  }),
});

export type SearchNikasiGatePassInput = z.infer<
  typeof searchNikasiGatePassSchema
>['body'];

/** Query schema for nikasi gate pass report (date range only, no pagination) */
export const getNikasiGatePassReportSchema = z.object({
  querystring: z.object({
    dateFrom: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        'dateFrom must be an ISO date, e.g. 2026-03-01'
      )
      .optional(),
    dateTo: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        'dateTo must be an ISO date, e.g. 2026-03-07'
      )
      .optional(),
  }),
});

export type GetNikasiGatePassReportQuery = z.infer<
  typeof getNikasiGatePassReportSchema
>['querystring'];

export interface NikasiReportBagSize {
  size: string;
  variety: string;
  quantityIssued: number;
  costPerBag?: number;
}

export interface NikasiReportDispatchLedger {
  _id: string;
  name: string;
  address: string;
  mobileNumber?: string;
}

export interface NikasiReportCreatedBy {
  _id: string;
  name: string;
}

/** Flat row shape for GET /nikasi-gate-pass/report */
export interface NikasiReport {
  _id: string;
  dispatchLedgerId: NikasiReportDispatchLedger;
  createdBy?: NikasiReportCreatedBy;
  gatePassNo: number;
  manualGatePassNumber?: number;
  isBooked?: boolean;
  billNumber?: number;
  bitliNumber?: number;
  billBookId?: string;
  billBook?: string;
  biltiBook?: string;
  category: string;
  date: string;
  from: string;
  to?: string;
  truckNumber?: string;
  bagSize: NikasiReportBagSize[];
  totalBags: number;
  remarks?: string;
  netWeight?: number;
  averageWeightPerBag?: number;
}
