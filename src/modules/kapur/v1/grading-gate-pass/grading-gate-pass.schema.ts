import { z } from 'zod';
import mongoose from 'mongoose';
import { BagType } from './grading-gate-pass.model.js';

const orderDetailSchema = z.object({
  size: z.string().trim().min(1, 'Size is required'),
  bagType: z.nativeEnum(BagType),
  quantity: z.coerce.number().int().min(0, 'Quantity must be non-negative'),
  weightPerBagKg: z.coerce
    .number()
    .min(0, 'Weight per bag must be non-negative'),
});

export const createGradingGatePassSchema = z.object({
  body: z.object({
    farmerStorageLinkId: z
      .string()
      .trim()
      .min(1, 'Farmer storage link ID is required')
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        'Invalid farmer storage link ID format'
      ),

    incomingGatePassIds: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Incoming gate pass ID is required')
          .refine(
            (val) => mongoose.Types.ObjectId.isValid(val),
            'Invalid incoming gate pass ID format'
          )
      )
      .nullable()
      .optional()
      .transform((ids) => ids ?? []),

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

    orderDetails: z
      .array(orderDetailSchema)
      .min(1, 'At least one order detail is required'),

    remarks: z
      .string()
      .trim()
      .max(500, 'Remarks must not exceed 500 characters')
      .optional(),
  }),
});

export type CreateGradingGatePassInput = z.infer<
  typeof createGradingGatePassSchema
>['body'];

export const searchGradingGatePassSchema = z.object({
  body: z.object({
    number: z.coerce
      .number()
      .int('Number must be an integer')
      .positive('Number must be a positive number'),
  }),
});

export type SearchGradingGatePassInput = z.infer<
  typeof searchGradingGatePassSchema
>['body'];

/** Schema for GET / - no params/body; uses authenticated user's store (cold storage). Supports pagination. */
export const getGradingGatePassesByStoreSchema = z.object({
  querystring: z
    .object({
      limit: z.coerce
        .number()
        .int()
        .min(1, 'Limit must be at least 1')
        .max(100, 'Limit must not exceed 100')
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
    })
    .optional(),
});

export type GetGradingGatePassesByStoreQuery = z.infer<
  typeof getGradingGatePassesByStoreSchema
>['querystring'];

/** Query schema for grading gate pass report (date range only, no pagination) */
export const getGradingGatePassReportSchema = z.object({
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

export type GetGradingGatePassReportQuery = z.infer<
  typeof getGradingGatePassReportSchema
>['querystring'];

export interface GradingReportOrderDetail {
  size: string;
  bagType: string;
  quantity: number;
  weightPerBagKg: number;
}

export interface GradingReportFarmerStorageLink {
  _id: string;
  accountNumber?: number;
  farmerId?: {
    _id: string;
    name: string;
    address: string;
  };
}

export interface GradingReportIncomingGatePass {
  _id: string;
  manualGatePassNumber?: number;
  bagsReceived: number;
  stage: string;
  category: string;
  netWeightKg: string;
}

export interface GradingReportCreatedBy {
  _id: string;
  name: string;
}

/** Flat row shape for GET /grading-gate-pass/report */
export interface GradingReport {
  _id: string;
  farmerStorageLinkId: GradingReportFarmerStorageLink;
  incomingGatePassIds: GradingReportIncomingGatePass[];
  createdBy?: GradingReportCreatedBy;
  gatePassNo: number;
  manualGatePassNumber?: number;
  date: string;
  variety: string;
  orderDetails: GradingReportOrderDetail[];
  totalBags: number;
  incomingNetWeightKg: string;
  netWeightKg: string;
  wastageKg: string;
  wastagePercentage: string;
  remarks?: string;
}

const objectIdString = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      `Invalid ${label} format`
    );

export const linkDelinkIncomingGatePassSchema = z.object({
  params: z.object({
    gradingGatePassId: objectIdString('grading gate pass ID'),
  }),
  body: z.object({
    incomingGatePassId: objectIdString('incoming gate pass ID'),
  }),
});

export type LinkDelinkIncomingGatePassParams = z.infer<
  typeof linkDelinkIncomingGatePassSchema
>['params'];

export type LinkDelinkIncomingGatePassBody = z.infer<
  typeof linkDelinkIncomingGatePassSchema
>['body'];

export const getGradingGatePassByIdSchema = z.object({
  params: z.object({
    gradingGatePassId: objectIdString('grading gate pass ID'),
  }),
});

export type GetGradingGatePassByIdParams = z.infer<
  typeof getGradingGatePassByIdSchema
>['params'];

export const updateGradingGatePassSchema = z.object({
  params: z.object({
    gradingGatePassId: objectIdString('grading gate pass ID'),
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
      variety: z
        .string()
        .trim()
        .min(1, 'Variety is required')
        .max(100, 'Variety must not exceed 100 characters')
        .optional(),
      orderDetails: z
        .array(orderDetailSchema)
        .min(1, 'At least one order detail is required')
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

export type UpdateGradingGatePassInput = z.infer<
  typeof updateGradingGatePassSchema
>['body'];

export type UpdateGradingGatePassParams = z.infer<
  typeof updateGradingGatePassSchema
>['params'];

export const getGradingGatePassAuditsByColdStorageSchema = z.object({
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

export type GetGradingGatePassAuditsByColdStorageQuery = z.infer<
  typeof getGradingGatePassAuditsByColdStorageSchema
>['querystring'];
