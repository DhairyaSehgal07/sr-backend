import { z } from 'zod';
import mongoose from 'mongoose';

export const getPreferencesParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, 'Cold storage ID is required')
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        'Invalid cold storage ID format'
      ),
  }),
});

export const updatePreferencesBodySchema = z.object({
  body: z
    .object({
      bagSizes: z.array(z.union([z.number(), z.string()])).optional(),
      reportFormat: z.string().trim().optional(),
      custom: z.record(z.string(), z.unknown()).optional(),
    })
    .refine(
      (data) =>
        'bagSizes' in data || 'reportFormat' in data || 'custom' in data,
      {
        message:
          'At least one field (bagSizes, reportFormat, custom) must be provided',
      }
    ),
});

export const updatePreferencesParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, 'Cold storage ID is required')
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        'Invalid cold storage ID format'
      ),
  }),
});

export type GetPreferencesParams = z.infer<
  typeof getPreferencesParamsSchema
>['params'];

export type UpdatePreferencesInput = z.infer<
  typeof updatePreferencesBodySchema
>['body'];

export type UpdatePreferencesParams = z.infer<
  typeof updatePreferencesParamsSchema
>['params'];
