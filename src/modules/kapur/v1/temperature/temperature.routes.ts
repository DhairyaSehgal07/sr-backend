import { FastifyInstance } from 'fastify';
import {
  createTemperatureHandler,
  updateTemperatureHandler,
  getTemperaturesHandler,
} from './temperature.controller.js';
import {
  createTemperatureBodySchema,
  updateTemperatureParamsSchema,
  updateTemperatureBodySchema,
} from './temperature.schema.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register temperature routes
 * @param fastify - Fastify instance
 */
export async function temperatureRoutes(fastify: FastifyInstance) {
  // Get all temperature records for the authenticated cold storage
  fastify.get(
    '/',
    {
      schema: {
        description:
          'Get all temperature records for the authenticated cold storage',
        tags: ['Temperature'],
        summary: 'Get temperature records',
        response: {
          200: {
            description: 'Temperature records retrieved successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
              message: { type: 'string' },
            },
          },
          401: { description: 'Unauthorized' },
          404: { description: 'Cold storage not found' },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    getTemperaturesHandler as never
  );

  // Create temperature record
  fastify.post(
    '/',
    {
      schema: {
        ...createTemperatureBodySchema,
        description:
          'Create a new temperature record for the authenticated cold storage',
        tags: ['Temperature'],
        summary: 'Create temperature record',
        body: {
          type: 'object',
          required: ['date', 'temperatureReading'],
          properties: {
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Date of the reading',
            },
            temperatureReading: {
              type: 'array',
              description: 'Array of chamber temperature readings',
              items: {
                type: 'object',
                required: ['chamber', 'value'],
                properties: {
                  chamber: {
                    type: 'string',
                    description: 'Chamber identifier',
                  },
                  value: {
                    type: 'number',
                    description: 'Temperature value',
                  },
                },
              },
            },
          },
        },
        response: {
          201: {
            description: 'Temperature record created successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object', additionalProperties: true },
              message: { type: 'string' },
            },
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          404: { description: 'Cold storage not found' },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    createTemperatureHandler as never
  );

  // Update temperature record
  fastify.put(
    '/:id',
    {
      schema: {
        ...updateTemperatureParamsSchema,
        ...updateTemperatureBodySchema,
        description: 'Update an existing temperature record',
        tags: ['Temperature'],
        summary: 'Update temperature record',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Temperature record ID' },
          },
        },
        body: {
          type: 'object',
          minProperties: 1,
          properties: {
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Date of the reading',
            },
            temperatureReading: {
              type: 'array',
              description: 'Array of chamber temperature readings',
              items: {
                type: 'object',
                required: ['chamber', 'value'],
                properties: {
                  chamber: {
                    type: 'string',
                    description: 'Chamber identifier',
                  },
                  value: {
                    type: 'number',
                    description: 'Temperature value',
                  },
                },
              },
            },
          },
        },
        response: {
          200: {
            description: 'Temperature record updated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object', additionalProperties: true },
              message: { type: 'string' },
            },
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: {
            description: 'Forbidden - record belongs to another cold storage',
          },
          404: { description: 'Temperature record not found' },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    updateTemperatureHandler as never
  );
}
