import { z } from 'zod';
import mongoose from 'mongoose';
import { STORAGE_CATEGORIES } from '../../../../config/constants.js';

const transferAllocationSchema = z.object({
  size: z.string().trim().min(1, 'Size is required'),
  quantityToAllocate: z.coerce
    .number()
    .int()
    .min(1, 'Quantity to allocate must be at least 1'),
  weightInKg: z.coerce
    .number()
    .min(0, 'Weight in kg must be non-negative')
    .refine(
      (val) => Math.abs(val * 100 - Math.round(val * 100)) < 1e-6,
      'Weight in kg must have at most 2 decimal places'
    )
    .transform((val) => Math.round(val * 100) / 100),
  chamber: z.string().trim().min(1, 'Chamber is required'),
  floor: z.string().trim().min(1, 'Floor is required'),
  row: z.string().trim().min(1, 'Row is required'),
});

const transferStorageGatePassAllocationSchema = z.object({
  storageGatePassId: z
    .string()
    .trim()
    .min(1, 'Storage gate pass ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid storage gate pass ID format'
    ),
  allocations: z
    .array(transferAllocationSchema)
    .min(1, 'At least one allocation is required'),
});

export const createTransferStockSchema = z.object({
  fromFarmerStorageLinkId: z
    .string()
    .trim()
    .min(1, 'From farmer storage link ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid from farmer storage link ID format'
    ),

  toFarmerStorageLinkId: z
    .string()
    .trim()
    .min(1, 'To farmer storage link ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid to farmer storage link ID format'
    ),

  gatePassNo: z.coerce
    .number()
    .int('Transfer gate pass number must be an integer')
    .positive('Transfer gate pass number must be a positive number'),

  manualGatePassNumber: z.coerce
    .number()
    .int('Manual gate pass number must be an integer')
    .positive('Manual gate pass number must be a positive number')
    .optional(),

  date: z.coerce.date(),

  variety: z
    .string()
    .trim()
    .min(1, 'Variety is required')
    .max(100, 'Variety must not exceed 100 characters'),

  category: z.enum(STORAGE_CATEGORIES, {
    message:
      'Storage category is required and must be one of the allowed options',
  }),

  stage: z
    .string()
    .trim()
    .max(200, 'Stage must not exceed 200 characters')
    .optional(),

  from: z.string().trim().min(1, 'From is required').max(200),
  to: z.string().trim().min(1, 'To is required').max(200),

  truckNumber: z
    .string()
    .trim()
    .max(50, 'Truck number must not exceed 50 characters')
    .optional(),

  storageGatePasses: z
    .array(transferStorageGatePassAllocationSchema)
    .min(1, 'At least one storage gate pass with allocations is required'),

  remarks: z
    .string()
    .trim()
    .max(500, 'Remarks must not exceed 500 characters')
    .optional(),

  idempotencyKey: z
    .string()
    .trim()
    .min(1, 'Idempotency key must be non-empty if provided')
    .max(128)
    .optional(),
});

export type CreateTransferStockInput = z.infer<
  typeof createTransferStockSchema
>;

/** Internal payload after controller assigns auto-generated gate pass numbers */
export type CreateTransferStockServiceInput = CreateTransferStockInput & {
  outgoingGatePassNo: number;
  destinationStorageGatePassNo: number;
};

export const getTransferStockGatePassesByColdStorageQuerySchema = z.object({
  querystring: z.object({
    limit: z.coerce.number().int().min(1).max(5000).optional(),
    page: z.coerce.number().int().min(1).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    gatePassNo: z.coerce.number().int().positive().optional(),
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

export type GetTransferStockGatePassesByColdStorageQuery = z.infer<
  typeof getTransferStockGatePassesByColdStorageQuerySchema
>['querystring'];

/** Query schema for transfer stock report (date range only, no pagination) */
export const getTransferStockReportSchema = z.object({
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

export type GetTransferStockReportQuery = z.infer<
  typeof getTransferStockReportSchema
>['querystring'];

/**
 * Flat row shape for GET /transfer-stock/report.
 * All display fields are strings so TanStack Table can bind columns directly via accessorKey.
 */
export interface TransferStockReport {
  _id: string;
  gatePassNo: string;
  date: string;
  variety: string;
  fromFarmerName: string;
  fromAccountNumber: string;
  fromFarmerAddress: string;
  toFarmerName: string;
  toAccountNumber: string;
  toFarmerAddress: string;
  truckNumber: string;
  outgoingGatePassNo: string;
  destinationStorageGatePassNo: string;
  totalBags: string;
  bagDetails: string;
  remarks: string;
  createdBy: string;
}

/** Column metadata for TanStack Table (accessorKey matches TransferStockReport fields) */
export const TRANSFER_STOCK_REPORT_COLUMNS = [
  { accessorKey: 'gatePassNo', header: 'Gate Pass No.' },
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'variety', header: 'Variety' },
  { accessorKey: 'fromFarmerName', header: 'From Farmer' },
  { accessorKey: 'fromAccountNumber', header: 'From A/c' },
  { accessorKey: 'fromFarmerAddress', header: 'From Address' },
  { accessorKey: 'toFarmerName', header: 'To Farmer' },
  { accessorKey: 'toAccountNumber', header: 'To A/c' },
  { accessorKey: 'toFarmerAddress', header: 'To Address' },
  { accessorKey: 'truckNumber', header: 'Truck No.' },
  { accessorKey: 'outgoingGatePassNo', header: 'Outgoing GP No.' },
  {
    accessorKey: 'destinationStorageGatePassNo',
    header: 'Dest. Storage GP No.',
  },
  { accessorKey: 'totalBags', header: 'Total Bags' },
  { accessorKey: 'bagDetails', header: 'Bag Details' },
  { accessorKey: 'remarks', header: 'Remarks' },
  { accessorKey: 'createdBy', header: 'Created By' },
] as const;
