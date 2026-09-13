import { z } from 'zod';
import mongoose from 'mongoose';
import { BagType } from './storage-gate-pass.model.js';

const bagSizeSchema = z.object({
  size: z.string().trim().min(1, 'Size is required'),
  bagType: z.nativeEnum(BagType),
  currentQuantity: z.coerce
    .number()
    .int()
    .min(0, 'Current quantity must be non-negative'),
  initialQuantity: z.coerce
    .number()
    .int()
    .min(0, 'Initial quantity must be non-negative'),
  chamber: z.string().trim().min(1, 'Chamber is required'),
  floor: z.string().trim().min(1, 'Floor is required'),
  row: z.string().trim().min(1, 'Row is required'),
});

export const createStorageGatePassSchema = z.object({
  farmerStorageLinkId: z
    .string()
    .trim()
    .min(1, 'Farmer storage link ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid farmer storage link ID format'
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

  date: z.coerce.date(),

  variety: z
    .string()
    .trim()
    .min(1, 'Variety is required')
    .max(100, 'Variety must not exceed 100 characters'),

  storageCategory: z.string().trim().min(1, 'Storage category is required'),

  generation: z
    .string()
    .trim()
    .min(1, 'Generation must be non-empty if provided')
    .max(100, 'Generation must not exceed 100 characters')
    .optional(),

  stage: z
    .string()
    .trim()
    .max(200, 'Stage must not exceed 200 characters')
    .optional(),

  bagSizes: z.array(bagSizeSchema).min(1, 'At least one bag size is required'),

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

export type CreateStorageGatePassInput = z.infer<
  typeof createStorageGatePassSchema
>;

/** Query schema for storage gate pass report (date range only, no pagination) */
export const getStorageGatePassReportSchema = z.object({
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

export type GetStorageGatePassReportQuery = z.infer<
  typeof getStorageGatePassReportSchema
>['querystring'];

export interface StorageReportBagSize {
  size: string;
  currentQuantity: number;
  initialQuantity: number;
  bagType: string;
  chamber: string;
  floor: string;
  row: string;
}

export interface StorageReportFarmerStorageLink {
  _id: string;
  accountNumber?: number;
  farmerId?: {
    _id: string;
    accountNumber?: number;
    name: string;
    address: string;
  };
}

export interface StorageReportCreatedBy {
  _id: string;
  name: string;
}

/** Flat row shape for GET /storage-gate-pass/report */
export interface StorageReport {
  _id: string;
  farmerStorageLinkId: StorageReportFarmerStorageLink;
  createdBy?: StorageReportCreatedBy;
  gatePassNo: number;
  manualGatePassNumber?: number;
  date: string;
  variety: string;
  storageCategory: string;
  generation?: string;
  stage?: string;
  bagSizes: StorageReportBagSize[];
  totalBags: number;
  remarks?: string;
}

export const updateStorageGatePassSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, 'ID is required')
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        'Invalid ID format'
      ),
  }),
  body: z
    .object({
      manualGatePassNumber: z
        .union([
          z.coerce
            .number()
            .int('Manual gate pass number must be an integer')
            .positive('Manual gate pass number must be a positive number'),
          z.null(),
        ])
        .optional(),
      date: z.coerce.date().optional(),
      farmerStorageLinkId: z
        .string()
        .trim()
        .min(1, 'Farmer storage link ID is required')
        .refine(
          (val) => mongoose.Types.ObjectId.isValid(val),
          'Invalid farmer storage link ID format'
        )
        .optional(),
      variety: z
        .string()
        .trim()
        .min(1, 'Variety is required')
        .max(100, 'Variety must not exceed 100 characters')
        .optional(),
      storageCategory: z
        .string()
        .trim()
        .min(1, 'Storage category is required')
        .optional(),
      generation: z
        .string()
        .trim()
        .min(1, 'Generation must be non-empty if provided')
        .max(100, 'Generation must not exceed 100 characters')
        .optional(),
      stage: z
        .string()
        .trim()
        .max(200, 'Stage must not exceed 200 characters')
        .optional(),
      bagSizes: z
        .array(bagSizeSchema)
        .min(1, 'At least one bag size is required')
        .optional(),
      remarks: z
        .string()
        .trim()
        .max(500, 'Remarks must not exceed 500 characters')
        .optional(),
    })
    .refine(
      (data) => Object.values(data).some((value) => value !== undefined),
      {
        message: 'At least one field must be provided for update',
      }
    ),
});

export type UpdateStorageGatePassInput = z.infer<
  typeof updateStorageGatePassSchema
>['body'];

export type UpdateStorageGatePassParams = z.infer<
  typeof updateStorageGatePassSchema
>['params'];

export const getStorageGatePassesByFarmerStorageLinkSchema = z.object({
  params: z.object({
    farmerStorageLinkId: z
      .string()
      .trim()
      .min(1, 'Farmer storage link ID is required')
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        'Invalid farmer storage link ID format'
      ),
  }),
  querystring: z.object({
    sortOrder: z
      .enum(['asc', 'desc'], {
        message: 'sortOrder must be "asc" or "desc"',
      })
      .optional()
      .default('desc'),
  }),
});

export type GetStorageGatePassesByFarmerStorageLinkParams = z.infer<
  typeof getStorageGatePassesByFarmerStorageLinkSchema
>['params'];

export type GetStorageGatePassesByFarmerStorageLinkQuery = z.infer<
  typeof getStorageGatePassesByFarmerStorageLinkSchema
>['querystring'];

export const getStorageGatePassAuditsByColdStorageSchema = z.object({
  querystring: z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(5000, 'Limit must not exceed 5000')
      .optional()
      .default(10),
    page: z.coerce
      .number()
      .int()
      .min(1, 'Page must be at least 1')
      .optional()
      .default(1),
  }),
});

export type GetStorageGatePassAuditsByColdStorageQuery = z.infer<
  typeof getStorageGatePassAuditsByColdStorageSchema
>['querystring'];
