import { z } from 'zod';
import mongoose from 'mongoose';

const outgoingAllocationSchema = z.object({
  size: z.string().trim().min(1, 'Size is required'),
  quantityToAllocate: z.coerce
    .number()
    .int()
    .min(0, 'Quantity to allocate must be non-negative'),
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

const outgoingStorageGatePassAllocationSchema = z.object({
  storageGatePassId: z
    .string()
    .trim()
    .min(1, 'Storage gate pass ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid storage gate pass ID format'
    ),
  allocations: z
    .array(outgoingAllocationSchema)
    .min(1, 'At least one allocation is required'),
});

export const createOutgoingGatePassSchema = z.object({
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

  from: z.string().trim().min(1, 'From is required').max(200),
  to: z.string().trim().min(1, 'To is required').max(200),

  truckNumber: z
    .string()
    .trim()
    .max(50, 'Truck number must not exceed 50 characters')
    .optional(),

  billNumber: z.coerce
    .number()
    .int('Bill number must be an integer')
    .positive('Bill number must be a positive number')
    .optional(),

  biltiNumber: z.coerce
    .number()
    .int('Bilti number must be an integer')
    .positive('Bilti number must be a positive number')
    .optional(),

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

  category: z
    .string()
    .trim()
    .min(1, 'Category must be non-empty if provided')
    .max(100, 'Category must not exceed 100 characters')
    .optional(),

  storageGatePasses: z
    .array(outgoingStorageGatePassAllocationSchema)
    .min(1, 'At least one storage gate pass with allocations is required'),

  remarks: z
    .string()
    .trim()
    .max(500, 'Remarks must not exceed 500 characters')
    .optional(),

  replacesOutgoingGatePassId: z
    .string()
    .trim()
    .min(1, 'Replaces outgoing gate pass ID must be non-empty if provided')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid replaces outgoing gate pass ID format'
    )
    .optional(),

  idempotencyKey: z
    .string()
    .trim()
    .min(1, 'Idempotency key must be non-empty if provided')
    .max(128)
    .optional(),
});

export type CreateOutgoingGatePassInput = z.infer<
  typeof createOutgoingGatePassSchema
>;

export const cancelOutgoingGatePassParamsSchema = z.object({
  params: z.object({
    outgoingGatePassId: z
      .string()
      .trim()
      .min(1, 'Outgoing gate pass ID is required')
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        'Invalid outgoing gate pass ID format'
      ),
  }),
});

export const cancelOutgoingGatePassBodySchema = z.object({
  cancellationRemarks: z
    .string()
    .trim()
    .min(1, 'Cancellation remarks are required')
    .max(500, 'Cancellation remarks must not exceed 500 characters'),
});

export type CancelOutgoingGatePassParams = z.infer<
  typeof cancelOutgoingGatePassParamsSchema
>['params'];

export type CancelOutgoingGatePassInput = z.infer<
  typeof cancelOutgoingGatePassBodySchema
>;

export const updateOutgoingGatePassParamsSchema = z.object({
  outgoingGatePassId: z
    .string()
    .trim()
    .min(1, 'Outgoing gate pass ID is required')
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      'Invalid outgoing gate pass ID format'
    ),
});

export const updateOutgoingGatePassBodySchema = z
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
    from: z.string().trim().min(1, 'From is required').max(200).optional(),
    to: z.string().trim().min(1, 'To is required').max(200).optional(),
    truckNumber: z
      .string()
      .trim()
      .max(50, 'Truck number must not exceed 50 characters')
      .optional(),
    remarks: z
      .string()
      .trim()
      .max(500, 'Remarks must not exceed 500 characters')
      .optional(),
    billNumber: z
      .union([
        z.coerce
          .number()
          .int('Bill number must be an integer')
          .positive('Bill number must be a positive number'),
        z.null(),
      ])
      .optional(),
    biltiNumber: z
      .union([
        z.coerce
          .number()
          .int('Bilti number must be an integer')
          .positive('Bilti number must be a positive number'),
        z.null(),
      ])
      .optional(),
    billBook: z
      .union([
        z.string().trim().min(1, 'Bill book must be non-empty'),
        z.null(),
      ])
      .optional(),
    biltiBook: z
      .union([
        z.string().trim().min(1, 'Bilti book must be non-empty'),
        z.null(),
      ])
      .optional(),
    category: z
      .union([
        z
          .string()
          .trim()
          .min(1, 'Category must be non-empty')
          .max(100, 'Category must not exceed 100 characters'),
        z.null(),
      ])
      .optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one field must be provided for update',
  });

export type UpdateOutgoingGatePassParams = z.infer<
  typeof updateOutgoingGatePassParamsSchema
>;

export type UpdateOutgoingGatePassInput = z.infer<
  typeof updateOutgoingGatePassBodySchema
>;
