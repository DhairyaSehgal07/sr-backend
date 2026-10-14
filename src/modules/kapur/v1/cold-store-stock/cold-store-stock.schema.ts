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

const varietySchema = z
  .string()
  .trim()
  .min(1, 'Variety is required')
  .max(100, 'Variety must not exceed 100 characters');

const sizeNameSchema = z
  .string()
  .trim()
  .min(1, 'Size name is required')
  .max(100, 'Size name must not exceed 100 characters');

const currentQuantitySchema = z.coerce
  .number()
  .int('Current quantity must be an integer');

const initialQuantitySchema = z.coerce
  .number()
  .int('Initial quantity must be an integer');

const stockFilterSchema = z
  .string()
  .trim()
  .min(1, 'Stock filter must be non-empty if provided')
  .max(100, 'Stock filter must not exceed 100 characters')
  .optional();

export const createColdStoreStockSchema = z.object({
  body: z.object({
    variety: varietySchema,
    size: z.object({
      name: sizeNameSchema,
      currentQuantity: currentQuantitySchema,
      initialQuantity: initialQuantitySchema,
    }),
    stockFilter: stockFilterSchema,
  }),
});

export const getColdStoreStockListSchema = z.object({
  querystring: z.object({
    variety: z.string().trim().max(100).optional(),
    stockFilter: z.string().trim().max(100).optional(),
  }),
});

export const getColdStoreStockByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const updateColdStoreStockSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z
    .object({
      variety: varietySchema.optional(),
      stockFilter: stockFilterSchema,
      size: z
        .object({
          name: sizeNameSchema.optional(),
          currentQuantity: currentQuantitySchema.optional(),
          initialQuantity: initialQuantitySchema.optional(),
        })
        .optional(),
    })
    .refine(
      (body) =>
        body.variety !== undefined ||
        body.stockFilter !== undefined ||
        body.size?.name !== undefined ||
        body.size?.currentQuantity !== undefined ||
        body.size?.initialQuantity !== undefined,
      { message: 'At least one field is required for update' }
    ),
});

export const deleteColdStoreStockSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export type CreateColdStoreStockInput = z.infer<
  typeof createColdStoreStockSchema
>['body'];
export type GetColdStoreStockListQuery = z.infer<
  typeof getColdStoreStockListSchema
>['querystring'];
export type GetColdStoreStockByIdParams = z.infer<
  typeof getColdStoreStockByIdSchema
>['params'];
export type UpdateColdStoreStockParams = z.infer<
  typeof updateColdStoreStockSchema
>['params'];
export type UpdateColdStoreStockInput = z.infer<
  typeof updateColdStoreStockSchema
>['body'];
export type DeleteColdStoreStockParams = z.infer<
  typeof deleteColdStoreStockSchema
>['params'];
