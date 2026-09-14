import { FastifyInstance } from 'fastify';
import {
  createBillBookHandler,
  getBillBookByIdHandler,
  getBillBooksByColdStorageHandler,
  updateBillBookHandler,
} from './bill-book.controller.js';
import {
  createBillBookSchema,
  getBillBookByIdSchema,
  getBillBookListSchema,
  updateBillBookSchema,
} from './bill-book.schema.js';
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

const billBookSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    coldStorageId: { type: 'string' },
    name: { type: 'string' },
    isActive: { type: 'boolean' },
    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function billBookRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        ...createBillBookSchema,
        description:
          "Create a bill book for the authenticated store admin's cold storage",
        tags: ['Bill Book'],
        summary: 'Create bill book',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              description: 'Bill book name',
            },
          },
        },
        response: {
          201: {
            description: 'Bill book created successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: billBookSchema,
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
    createBillBookHandler as never
  );

  fastify.get(
    '/',
    {
      schema: {
        ...getBillBookListSchema,
        description:
          "Get bill books for the authenticated store admin's cold storage",
        tags: ['Bill Book'],
        summary: 'Get bill books for my cold storage',
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            isActive: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: {
          200: {
            description: 'List of bill books',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: billBookSchema,
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
    getBillBooksByColdStorageHandler as never
  );

  fastify.get(
    '/:id',
    {
      schema: {
        ...getBillBookByIdSchema,
        description:
          "Get one bill book from the authenticated store admin's cold storage",
        tags: ['Bill Book'],
        summary: 'Get bill book by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Bill book details',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: billBookSchema,
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
    getBillBookByIdHandler as never
  );

  fastify.put(
    '/:id',
    {
      schema: {
        ...updateBillBookSchema,
        description:
          "Update a bill book in the authenticated store admin's cold storage",
        tags: ['Bill Book'],
        summary: 'Update bill book',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            isActive: { type: 'boolean' },
          },
        },
        response: {
          200: {
            description: 'Bill book updated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: billBookSchema,
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
    updateBillBookHandler as never
  );
}
