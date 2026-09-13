import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z
  .string()
  .trim()
  .min(1, 'ID is required')
  .refine(
    (value) => mongoose.Types.ObjectId.isValid(value),
    'Invalid ID format'
  );

export const createDispatchLedgerSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(120, 'Name must not exceed 120 characters'),
    address: z
      .string()
      .trim()
      .min(1, 'Address is required')
      .max(500, 'Address must not exceed 500 characters'),
    mobileNumber: z
      .string()
      .trim()
      .regex(
        /^[6-9]\d{9}$/,
        'Mobile number must be a valid 10-digit Indian mobile number starting with 6-9'
      )
      .optional(),
  }),
});

export const getDispatchLedgerByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const getDispatchLedgerListSchema = z.object({
  querystring: z.object({
    search: z.string().trim().optional(),
  }),
});

export const updateDispatchLedgerSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Name is required')
        .max(120, 'Name must not exceed 120 characters')
        .optional(),
      address: z
        .string()
        .trim()
        .min(1, 'Address is required')
        .max(500, 'Address must not exceed 500 characters')
        .optional(),
      mobileNumber: z
        .string()
        .trim()
        .regex(
          /^[6-9]\d{9}$/,
          'Mobile number must be a valid 10-digit Indian mobile number starting with 6-9'
        )
        .optional(),
    })
    .refine(
      (body) =>
        body.name !== undefined ||
        body.address !== undefined ||
        body.mobileNumber !== undefined,
      { message: 'At least one field is required for update' }
    ),
});

export const deleteDispatchLedgerSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const getDispatchLedgerNikasiGatePassesSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export type CreateDispatchLedgerInput = z.infer<
  typeof createDispatchLedgerSchema
>['body'];
export type GetDispatchLedgerByIdParams = z.infer<
  typeof getDispatchLedgerByIdSchema
>['params'];
export type GetDispatchLedgerListQuery = z.infer<
  typeof getDispatchLedgerListSchema
>['querystring'];
export type UpdateDispatchLedgerParams = z.infer<
  typeof updateDispatchLedgerSchema
>['params'];
export type UpdateDispatchLedgerInput = z.infer<
  typeof updateDispatchLedgerSchema
>['body'];
export type DeleteDispatchLedgerParams = z.infer<
  typeof deleteDispatchLedgerSchema
>['params'];
export type GetDispatchLedgerNikasiGatePassesParams = z.infer<
  typeof getDispatchLedgerNikasiGatePassesSchema
>['params'];
