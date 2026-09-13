import { FastifyInstance } from 'fastify';
import {
  createDispatchLedgerHandler,
  getDispatchLedgerByIdHandler,
  getDispatchLedgersByColdStorageHandler,
  updateDispatchLedgerHandler,
} from './dispatch-ledger.controller.js';
import {
  createDispatchLedgerSchema,
  getDispatchLedgerByIdSchema,
  getDispatchLedgerListSchema,
  updateDispatchLedgerSchema,
} from './dispatch-ledger.schema.js';
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

const dispatchLedgerSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    coldStorageId: { type: 'string' },
    name: { type: 'string' },
    address: { type: 'string' },
    mobileNumber: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function dispatchLedgerRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        ...createDispatchLedgerSchema,
        description:
          "Create a dispatch ledger for the authenticated store admin's cold storage",
        tags: ['Dispatch Ledger'],
        summary: 'Create dispatch ledger',
        response: {
          201: {
            description: 'Dispatch ledger created successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: dispatchLedgerSchema,
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
    createDispatchLedgerHandler as never
  );

  fastify.get(
    '/',
    {
      schema: {
        ...getDispatchLedgerListSchema,
        description:
          "Get dispatch ledgers for the authenticated store admin's cold storage",
        tags: ['Dispatch Ledger'],
        summary: 'Get dispatch ledgers for my cold storage',
        response: {
          200: {
            description: 'List of dispatch ledgers',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: dispatchLedgerSchema,
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
    getDispatchLedgersByColdStorageHandler as never
  );

  fastify.get(
    '/:id',
    {
      schema: {
        ...getDispatchLedgerByIdSchema,
        description:
          "Get one dispatch ledger from the authenticated store admin's cold storage",
        tags: ['Dispatch Ledger'],
        summary: 'Get dispatch ledger by ID',
        response: {
          200: {
            description: 'Dispatch ledger details',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: dispatchLedgerSchema,
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
    getDispatchLedgerByIdHandler as never
  );

  fastify.put(
    '/:id',
    {
      schema: {
        ...updateDispatchLedgerSchema,
        description:
          "Update a dispatch ledger in the authenticated store admin's cold storage",
        tags: ['Dispatch Ledger'],
        summary: 'Update dispatch ledger',
        response: {
          200: {
            description: 'Dispatch ledger updated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: dispatchLedgerSchema,
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
    updateDispatchLedgerHandler as never
  );
}
