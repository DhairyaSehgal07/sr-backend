import { z } from 'zod';
import mongoose from 'mongoose';

const temperatureReadingItemSchema = z.object({
  chamber: z
    .string()
    .trim()
    .min(1, 'Chamber is required')
    .max(100, 'Chamber must not exceed 100 characters'),
  value: z.number({
    message: 'Temperature value is required and must be a number',
  }),
});

export const createTemperatureBodySchema = z.object({
  body: z.object({
    date: z.coerce.date({
      message: 'Date is required and must be a valid date',
    }),
    temperatureReading: z
      .array(temperatureReadingItemSchema)
      .min(1, 'At least one temperature reading is required'),
  }),
});

export const updateTemperatureParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, 'Temperature record ID is required')
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        'Invalid temperature record ID format'
      ),
  }),
});

export const updateTemperatureBodySchema = z.object({
  body: z
    .object({
      date: z.coerce.date({ message: 'Date must be a valid date' }).optional(),
      temperatureReading: z
        .array(temperatureReadingItemSchema)
        .min(1, 'Temperature reading array must not be empty if provided')
        .optional(),
    })
    .refine(
      (data) =>
        data.date !== undefined || data.temperatureReading !== undefined,
      {
        message:
          'At least one field (date, temperatureReading) must be provided for update',
      }
    ),
});

export type CreateTemperatureInput = z.infer<
  typeof createTemperatureBodySchema
>['body'];

export type UpdateTemperatureParams = z.infer<
  typeof updateTemperatureParamsSchema
>['params'];

export type UpdateTemperatureInput = z.infer<
  typeof updateTemperatureBodySchema
>['body'];
