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

export const createFinanceRecoverySchema = z.object({
  body: z.object({
    date: z.coerce.date(),
    dispatchLedgerId: objectIdSchema,
    billBookId: objectIdSchema,
    amountPaise: z.coerce
      .number()
      .int('Amount must be an integer number of paise')
      .positive('Amount must be greater than zero'),
    remark: z
      .string()
      .trim()
      .max(500, 'Remark must not exceed 500 characters')
      .optional(),
  }),
});

export const getFinanceListQuerySchema = z.object({
  querystring: z.object({
    billBookId: objectIdSchema.optional(),
  }),
});

export type CreateFinanceRecoveryInput = z.infer<
  typeof createFinanceRecoverySchema
>['body'];
export type GetFinanceListQuery = z.infer<
  typeof getFinanceListQuerySchema
>['querystring'];
