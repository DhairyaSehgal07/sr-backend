import { FastifyInstance } from 'fastify';
import {
  createFinanceRecoveryHandler,
  getFinanceOutstandingHandler,
  getFinanceRecoveriesHandler,
  getFinanceSalesHandler,
  getFinanceSummaryHandler,
} from './finances.controller.js';
import {
  createFinanceRecoverySchema,
  getFinanceListQuerySchema,
} from './finances.schema.js';
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

const billBookQuerystring = {
  type: 'object',
  properties: {
    billBookId: { type: 'string', description: 'Optional bill book filter' },
  },
};

const financeSaleSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    _id: { type: 'string' },
    coldStorageId: { type: 'string' },
    dispatchId: { type: 'string' },
    date: { type: 'string', format: 'date-time' },
    gatePassNo: { type: 'number' },
    billBookId: { type: 'string' },
    billBookName: { type: 'string' },
    billNumber: { type: 'number' },
    dispatchLedgerId: { type: 'string' },
    dispatchLedgerName: { type: 'string' },
    bags: { type: 'number' },
    netWeight: { type: 'number' },
    amountPaise: { type: 'number' },
    recoveredPaise: { type: 'number' },
    outstandingPaise: { type: 'number' },
    status: { type: 'string', enum: ['open', 'partial', 'settled'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const financeRecoverySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    _id: { type: 'string' },
    coldStorageId: { type: 'string' },
    date: { type: 'string', format: 'date-time' },
    dispatchLedgerId: { type: 'string' },
    dispatchLedgerName: { type: 'string' },
    billBookId: { type: 'string' },
    billBookName: { type: 'string' },
    amountPaise: { type: 'number' },
    remark: { type: 'string' },
    allocations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          saleId: { type: 'string' },
          amountPaise: { type: 'number' },
        },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function financesRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/summary',
    {
      schema: {
        ...getFinanceListQuerySchema,
        description:
          'Aggregate billed, recovered, and outstanding amounts for the cold storage',
        tags: ['Finances'],
        summary: 'Finance summary cards',
        querystring: billBookQuerystring,
        response: {
          200: {
            description: 'Finance summary',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  billedPaise: { type: 'number' },
                  recoveredPaise: { type: 'number' },
                  outstandingPaise: { type: 'number' },
                  saleCount: { type: 'number' },
                  recoveryCount: { type: 'number' },
                },
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
    getFinanceSummaryHandler as never
  );

  fastify.get(
    '/sales',
    {
      schema: {
        ...getFinanceListQuerySchema,
        description: 'List finance sales sorted by date descending',
        tags: ['Finances'],
        summary: 'Finance sales tab',
        querystring: billBookQuerystring,
        response: {
          200: {
            description: 'Finance sales',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: financeSaleSchema,
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
    getFinanceSalesHandler as never
  );

  fastify.get(
    '/outstanding',
    {
      schema: {
        ...getFinanceListQuerySchema,
        description:
          'Outstanding grouped by dispatch ledger (party) and bill book',
        tags: ['Finances'],
        summary: 'Outstanding by party',
        querystring: billBookQuerystring,
        response: {
          200: {
            description: 'Outstanding by party and bill book',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    dispatchLedgerId: { type: 'string' },
                    billBookId: { type: 'string' },
                    dispatchLedgerName: { type: 'string' },
                    billBookName: { type: 'string' },
                    billedPaise: { type: 'number' },
                    recoveredPaise: { type: 'number' },
                    outstandingPaise: { type: 'number' },
                  },
                },
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
    getFinanceOutstandingHandler as never
  );

  fastify.get(
    '/recoveries',
    {
      schema: {
        ...getFinanceListQuerySchema,
        description: 'Recovery register sorted by date descending',
        tags: ['Finances'],
        summary: 'Recovery register',
        querystring: billBookQuerystring,
        response: {
          200: {
            description: 'Finance recoveries',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: financeRecoverySchema,
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
    getFinanceRecoveriesHandler as never
  );

  fastify.post(
    '/recoveries',
    {
      schema: {
        ...createFinanceRecoverySchema,
        description:
          'Record a recovery against a party and bill book; FIFO-allocated onto sales',
        tags: ['Finances'],
        summary: 'Create finance recovery',
        body: {
          type: 'object',
          required: ['date', 'dispatchLedgerId', 'billBookId', 'amountPaise'],
          properties: {
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Recovery date',
            },
            dispatchLedgerId: {
              type: 'string',
              description: 'Dispatch ledger (party) ID',
            },
            billBookId: {
              type: 'string',
              description: 'Bill book ID',
            },
            amountPaise: {
              type: 'number',
              description: 'Amount in integer paise',
            },
            remark: {
              type: 'string',
              description: 'Optional remark',
            },
          },
        },
        response: {
          201: {
            description: 'Recovery recorded',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: financeRecoverySchema,
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
    createFinanceRecoveryHandler as never
  );
}
