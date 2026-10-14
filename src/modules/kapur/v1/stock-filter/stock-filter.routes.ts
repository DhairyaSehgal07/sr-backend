import { FastifyInstance } from 'fastify';
import {
  createStockFilterHandler,
  deleteStockFilterHandler,
  getStockFilterByIdHandler,
  getStockFiltersHandler,
  updateStockFilterHandler,
} from './stock-filter.controller.js';
import { authenticate } from '../../../../utils/auth.js';

const errorResponseSchema = {
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
};

const stockFilterSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    coldStorageId: { type: 'string' },
    name: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string' },
  },
};

const nameBody = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Stock filter name' },
  },
};

export async function stockFilterRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        description:
          "Create a stock filter for the authenticated store admin's cold storage",
        tags: ['Stock Filter'],
        summary: 'Create stock filter',
        body: nameBody,
        response: {
          201: {
            description: 'Stock filter created successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: stockFilterSchema,
              message: { type: 'string' },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
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
    createStockFilterHandler
  );

  fastify.get(
    '/',
    {
      schema: {
        description:
          "List stock filters for the authenticated store admin's cold storage",
        tags: ['Stock Filter'],
        summary: 'List stock filters',
        response: {
          200: {
            description: 'List of stock filters',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: stockFilterSchema,
              },
            },
          },
          401: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 200,
          timeWindow: '1 minute',
        },
      },
    },
    getStockFiltersHandler
  );

  fastify.get(
    '/:id',
    {
      schema: {
        description:
          "Get one stock filter from the authenticated store admin's cold storage",
        tags: ['Stock Filter'],
        summary: 'Get stock filter by ID',
        params: idParams,
        response: {
          200: {
            description: 'Stock filter details',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: stockFilterSchema,
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 200,
          timeWindow: '1 minute',
        },
      },
    },
    getStockFilterByIdHandler
  );

  fastify.put(
    '/:id',
    {
      schema: {
        description:
          "Rename one stock filter in the authenticated store admin's cold storage",
        tags: ['Stock Filter'],
        summary: 'Update stock filter',
        params: idParams,
        body: nameBody,
        response: {
          200: {
            description: 'Stock filter updated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: stockFilterSchema,
              message: { type: 'string' },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
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
    updateStockFilterHandler
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        description:
          "Delete one stock filter from the authenticated store admin's cold storage",
        tags: ['Stock Filter'],
        summary: 'Delete stock filter',
        params: idParams,
        response: {
          200: {
            description: 'Stock filter deleted successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
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
    deleteStockFilterHandler
  );
}
