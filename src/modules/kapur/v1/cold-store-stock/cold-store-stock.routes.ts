import { FastifyInstance } from 'fastify';
import {
  createColdStoreStockHandler,
  deleteColdStoreStockHandler,
  getColdStoreStockByIdHandler,
  getColdStoreStocksHandler,
  updateColdStoreStockHandler,
} from './cold-store-stock.controller.js';
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

const coldStoreStockSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    coldStorageId: { type: 'string' },
    variety: { type: 'string' },
    size: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        currentQuantity: { type: 'number' },
        initialQuantity: { type: 'number' },
      },
    },
    stockFilter: { type: 'string' },
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

export async function coldStoreStockRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        description:
          "Create current stock for one variety and size in the authenticated store admin's cold storage",
        tags: ['Cold Store Stock'],
        summary: 'Create cold store stock',
        body: {
          type: 'object',
          required: ['variety', 'size'],
          properties: {
            variety: { type: 'string', description: 'Variety name' },
            stockFilter: {
              type: 'string',
              description: 'Optional label used to group this stock row',
            },
            size: {
              type: 'object',
              required: ['name', 'currentQuantity', 'initialQuantity'],
              properties: {
                name: { type: 'string', description: 'Size name' },
                currentQuantity: {
                  type: 'integer',
                  description: 'Live bag balance; may be negative',
                },
                initialQuantity: {
                  type: 'integer',
                  description: 'Opening bag balance',
                },
              },
            },
          },
        },
        response: {
          201: {
            description: 'Cold store stock created successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: coldStoreStockSchema,
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
    createColdStoreStockHandler
  );

  fastify.get(
    '/',
    {
      schema: {
        description:
          "List current stock for the authenticated store admin's cold storage. Optional variety and stockFilter filters.",
        tags: ['Cold Store Stock'],
        summary: 'List cold store stock',
        querystring: {
          type: 'object',
          properties: {
            variety: { type: 'string' },
            stockFilter: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'List of cold store stock rows',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: coldStoreStockSchema,
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
    getColdStoreStocksHandler
  );

  fastify.get(
    '/:id',
    {
      schema: {
        description:
          "Get one stock row from the authenticated store admin's cold storage",
        tags: ['Cold Store Stock'],
        summary: 'Get cold store stock by ID',
        params: idParams,
        response: {
          200: {
            description: 'Cold store stock details',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: coldStoreStockSchema,
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
    getColdStoreStockByIdHandler
  );

  fastify.put(
    '/:id',
    {
      schema: {
        description:
          'Update current quantity, initial quantity, variety, size name, or stock filter for one stock row. A cold store still has only one row per variety and size.',
        tags: ['Cold Store Stock'],
        summary: 'Update cold store stock',
        params: idParams,
        body: {
          type: 'object',
          properties: {
            variety: { type: 'string' },
            stockFilter: { type: 'string' },
            size: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                currentQuantity: { type: 'integer' },
                initialQuantity: { type: 'integer' },
              },
            },
          },
        },
        response: {
          200: {
            description: 'Cold store stock updated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: coldStoreStockSchema,
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
    updateColdStoreStockHandler
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        description:
          "Delete one stock row from the authenticated store admin's cold storage",
        tags: ['Cold Store Stock'],
        summary: 'Delete cold store stock',
        params: idParams,
        response: {
          200: {
            description: 'Cold store stock deleted successfully',
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
    deleteColdStoreStockHandler
  );
}
