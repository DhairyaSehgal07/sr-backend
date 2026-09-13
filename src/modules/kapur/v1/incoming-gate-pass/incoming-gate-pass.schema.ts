import { z } from 'zod';
import mongoose from 'mongoose';
import {
  GatePassStatus,
  IncomingGatePassCategory,
} from './incoming-gate-pass.model.js';

const weightSlipSchema = z.object({
  slipNumber: z.string().trim().optional(),
  grossWeightKg: z.number().min(0).optional(),
  tareWeightKg: z.number().min(0).optional(),
});

export const createIncomingGatePassSchema = z.object({
  body: z.object({
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

    category: z.nativeEnum(IncomingGatePassCategory, {
      message: 'Category is required and must be one of the allowed options',
    }),

    truckNumber: z
      .string()
      .trim()
      .min(1, 'Truck number is required')
      .max(50, 'Truck number must not exceed 50 characters'),

    bagsReceived: z.coerce
      .number()
      .int()
      .min(0, 'Bags received must be non-negative'),

    weightSlip: weightSlipSchema.optional(),

    status: z.nativeEnum(GatePassStatus).default(GatePassStatus.NOT_GRADED),

    stage: z
      .string()
      .trim()
      .max(200, 'Stage must not exceed 200 characters')
      .optional(),

    remarks: z
      .string()
      .trim()
      .max(500, 'Remarks must not exceed 500 characters')
      .optional(),
  }),
});

export type CreateIncomingGatePassInput = z.infer<
  typeof createIncomingGatePassSchema
>['body'];

export const searchIncomingGatePassSchema = z.object({
  body: z.object({
    number: z.coerce
      .number()
      .int('Number must be an integer')
      .positive('Number must be a positive number'),
  }),
});

export type SearchIncomingGatePassInput = z.infer<
  typeof searchIncomingGatePassSchema
>['body'];

export const getIncomingGatePassesByFarmerStorageLinkSchema = z.object({
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

export type GetIncomingGatePassesByFarmerStorageLinkParams = z.infer<
  typeof getIncomingGatePassesByFarmerStorageLinkSchema
>['params'];

export type GetIncomingGatePassesByFarmerStorageLinkQuery = z.infer<
  typeof getIncomingGatePassesByFarmerStorageLinkSchema
>['querystring'];

/** Query schema for get incoming gate passes (pagination + sort + search by gate pass number) */
export const getIncomingGatePassesQuerySchema = z.object({
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
    sortOrder: z
      .enum(['asc', 'desc'], {
        message: 'sortOrder must be "asc" or "desc"',
      })
      .optional()
      .default('desc'),
    gatePassNo: z.coerce
      .number()
      .int()
      .positive('Gate pass number must be a positive integer')
      .optional(),
    status: z
      .enum(['graded', 'ungraded'], {
        message:
          'status must be "graded" or "ungraded" to filter by gate pass status',
      })
      .optional(),
  }),
});

export type GetIncomingGatePassesQuery = z.infer<
  typeof getIncomingGatePassesQuerySchema
>['querystring'];

/** Query schema for incoming gate pass report (date range only, no pagination) */
export const getIncomingGatePassReportSchema = z.object({
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

export type GetIncomingGatePassReportQuery = z.infer<
  typeof getIncomingGatePassReportSchema
>['querystring'];

/** Flat row shape for GET /incoming-gate-pass/report */
export interface IncomingReport {
  name: string;
  address: string;
  manualGatePassNumber: string;
  gatePassNo: string;
  date: string;
  variety: string;
  stage: string;
  truckNumber: string;
  bags: string;
  slipNumber: string;
  grossWeightKg: string;
  tareWeightKg: string;
  bardanaWeightKg: string;
  netWeightKg: string;
  remarks: string;
  status: string;
  createdBy: string;
}

export const updateIncomingGatePassSchema = z.object({
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
      truckNumber: z
        .string()
        .trim()
        .min(1, 'Truck number is required')
        .max(50, 'Truck number must not exceed 50 characters')
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
      category: z.nativeEnum(IncomingGatePassCategory).optional(),
      stage: z
        .string()
        .trim()
        .max(200, 'Stage must not exceed 200 characters')
        .optional(),
      bagsReceived: z.coerce
        .number()
        .int()
        .min(0, 'Bags received must be non-negative')
        .optional(),
      weightSlip: weightSlipSchema.optional(),
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

export type UpdateIncomingGatePassInput = z.infer<
  typeof updateIncomingGatePassSchema
>['body'];

export type UpdateIncomingGatePassParams = z.infer<
  typeof updateIncomingGatePassSchema
>['params'];

export const getIncomingGatePassAuditsByColdStorageSchema = z.object({
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

export type GetIncomingGatePassAuditsByColdStorageQuery = z.infer<
  typeof getIncomingGatePassAuditsByColdStorageSchema
>['querystring'];
