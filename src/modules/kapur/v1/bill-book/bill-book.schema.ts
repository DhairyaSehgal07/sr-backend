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

export const createBillBookSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(120, 'Name must not exceed 120 characters'),
  }),
});

export const getBillBookByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const getBillBookListSchema = z.object({
  querystring: z.object({
    search: z.string().trim().optional(),
    isActive: z.enum(['true', 'false']).optional(),
  }),
});

export const updateBillBookSchema = z.object({
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
      isActive: z.boolean().optional(),
    })
    .refine((body) => body.name !== undefined || body.isActive !== undefined, {
      message: 'At least one field is required for update',
    }),
});

export type CreateBillBookInput = z.infer<typeof createBillBookSchema>['body'];
export type GetBillBookByIdParams = z.infer<
  typeof getBillBookByIdSchema
>['params'];
export type GetBillBookListQuery = z.infer<
  typeof getBillBookListSchema
>['querystring'];
export type UpdateBillBookParams = z.infer<
  typeof updateBillBookSchema
>['params'];
export type UpdateBillBookInput = z.infer<typeof updateBillBookSchema>['body'];
