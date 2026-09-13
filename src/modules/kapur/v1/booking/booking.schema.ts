import { z } from 'zod';
import mongoose from 'mongoose';

const bagSizeSchema = z.object({
  size: z.string().trim().min(1, 'Size is required'),
  variety: z
    .string()
    .trim()
    .min(1, 'Variety is required')
    .max(100, 'Variety must not exceed 100 characters'),
  currentQuantity: z.coerce
    .number()
    .int()
    .min(0, 'Current quantity must be non-negative'),
  initialQuantity: z.coerce
    .number()
    .int()
    .min(0, 'Initial quantity must be non-negative'),
});

export const createBookingSchema = z.object({
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

  date: z.coerce.date(),

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

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
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
      dispatchLedgerId: z
        .string()
        .trim()
        .min(1, 'Dispatch ledger ID is required')
        .refine(
          (val) => mongoose.Types.ObjectId.isValid(val),
          'Invalid dispatch ledger ID format'
        )
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

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>['body'];

export type UpdateBookingParams = z.infer<typeof updateBookingSchema>['params'];

export const searchBookingSchema = z.object({
  number: z.coerce
    .number()
    .int('Number must be an integer')
    .positive('Number must be a positive number'),
});

export type SearchBookingInput = z.infer<typeof searchBookingSchema>;

export const getBookingAuditsByColdStorageSchema = z.object({
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

export type GetBookingAuditsByColdStorageQuery = z.infer<
  typeof getBookingAuditsByColdStorageSchema
>['querystring'];
