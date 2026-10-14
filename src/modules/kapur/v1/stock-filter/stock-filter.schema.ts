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

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must not exceed 100 characters');

export const createStockFilterSchema = z.object({
  body: z.object({
    name: nameSchema,
  }),
});

export const getStockFilterByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const updateStockFilterSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    name: nameSchema,
  }),
});

export const deleteStockFilterSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export type CreateStockFilterInput = z.infer<
  typeof createStockFilterSchema
>['body'];
export type GetStockFilterByIdParams = z.infer<
  typeof getStockFilterByIdSchema
>['params'];
export type UpdateStockFilterParams = z.infer<
  typeof updateStockFilterSchema
>['params'];
export type UpdateStockFilterInput = z.infer<
  typeof updateStockFilterSchema
>['body'];
export type DeleteStockFilterParams = z.infer<
  typeof deleteStockFilterSchema
>['params'];
