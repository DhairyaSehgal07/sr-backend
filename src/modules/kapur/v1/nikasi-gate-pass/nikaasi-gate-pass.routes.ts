import { FastifyInstance } from 'fastify';
import {
  createNikasiGatePassHandler,
  getNikasiGatePassReportHandler,
  getNikasiGatePassesByColdStorageHandler,
  searchNikasiGatePassHandler,
} from './nikasi-gate-pass.controller.js';
import {
  getNikasiGatePassReportSchema,
  searchNikasiGatePassSchema,
} from './nikasi-gate-pass.schema.js';
import { authenticate } from '../../../../utils/auth.js';

/** Shared OpenAPI properties for nikasi gate pass documents in list/search responses */
const nikasiGatePassItemProperties = {
  _id: { type: 'string', description: 'Nikasi gate pass ID' },
  dispatchLedgerId: {
    type: 'object',
    additionalProperties: true,
    description: 'Populated dispatch ledger',
  },
  createdBy: {
    type: 'object',
    additionalProperties: true,
    description: 'Populated store admin who created the pass',
  },
  gatePassNo: { type: 'number', description: 'Gate pass number' },
  manualGatePassNumber: {
    type: 'number',
    description: 'Manual gate pass number',
  },
  isBooked: { type: 'boolean', description: 'Whether this pass is booked' },
  billNumber: { type: 'number', description: 'Bill number' },
  bitliNumber: { type: 'number', description: 'Bitli number' },
  billBookId: { type: 'string', description: 'Bill book ID' },
  billBook: { type: 'string', description: 'Bill book name' },
  biltiBook: { type: 'string', description: 'Bilti book' },
  category: { type: 'string', description: 'Category' },
  date: { type: 'string', format: 'date-time', description: 'Gate pass date' },
  from: { type: 'string', description: 'Source location' },
  to: { type: 'string', description: 'Destination location' },
  truckNumber: { type: 'string', description: 'Truck number' },
  bagSize: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        size: { type: 'string' },
        variety: { type: 'string' },
        quantityIssued: { type: 'number' },
        costPerBag: { type: 'number' },
      },
    },
  },
  remarks: { type: 'string', description: 'Remarks' },
  netWeight: { type: 'number', description: 'Net weight' },
  averageWeightPerBag: {
    type: 'number',
    description: 'Average weight per bag',
  },
  idempotencyKey: { type: 'string', description: 'Idempotency key' },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
} as const;

export async function nikasiGatePassRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new nikasi gate pass',
        tags: ['Nikasi Gate Pass'],
        summary: 'Create nikasi gate pass',
        body: {
          type: 'object',
          required: [
            'dispatchLedgerId',
            'gatePassNo',
            'category',
            'date',
            'from',
            'bagSize',
            'billBookId',
          ],
          properties: {
            dispatchLedgerId: {
              type: 'string',
              description: 'Dispatch ledger ID',
            },
            gatePassNo: {
              type: 'number',
              description: 'Gate pass number',
            },
            manualGatePassNumber: {
              type: 'number',
              description: 'Optional manual gate pass number',
            },
            isBooked: {
              type: 'boolean',
              description: 'Whether this nikasi gate pass is booked',
            },
            billNumber: {
              type: 'number',
              description: 'Optional bill number',
            },
            bitliNumber: {
              type: 'number',
              description: 'Optional bitli number',
            },
            billBookId: {
              type: 'string',
              description: 'Bill book ID',
            },
            billBook: {
              type: 'string',
              description: 'Ignored if provided; name is copied from bill book',
            },
            biltiBook: {
              type: 'string',
              description: 'Optional bilti book',
            },
            category: {
              type: 'string',
              description: 'Category',
            },
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Gate pass date',
            },
            from: { type: 'string', description: 'Source location' },
            to: { type: 'string', description: 'Destination location' },
            truckNumber: { type: 'string', description: 'Truck number' },
            bagSize: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['size', 'variety', 'quantityIssued', 'costPerBag'],
                properties: {
                  size: { type: 'string' },
                  variety: { type: 'string' },
                  quantityIssued: {
                    type: 'number',
                    minimum: 0,
                  },
                  costPerBag: {
                    type: 'number',
                    minimum: 0,
                    description: 'Cost per bag in rupees',
                  },
                },
              },
            },
            remarks: { type: 'string', description: 'Remarks' },
            netWeight: { type: 'number', description: 'Net weight' },
            averageWeightPerBag: {
              type: 'number',
              description: 'Average weight per bag',
            },
            idempotencyKey: {
              type: 'string',
              description: 'Idempotency key',
            },
          },
        },
        response: {
          201: {
            description: 'Nikasi gate pass created successfully',
            type: 'object',
            properties: {
              status: { type: 'string' },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: nikasiGatePassItemProperties,
                additionalProperties: true,
              },
            },
          },
          400: {
            description:
              'Bad request (validation error, insufficient shed stock, or insufficient booked stock)',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
            },
          },
          404: {
            description: 'Dispatch ledger not found',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
            },
          },
          409: {
            description: 'Conflict - duplicate gate pass or idempotency key',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
            },
          },
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
    createNikasiGatePassHandler as never
  );

  fastify.post(
    '/search',
    {
      schema: {
        ...searchNikasiGatePassSchema,
        description:
          "Search nikasi gate passes for the authenticated store admin's cold storage. Matches documents where the provided number equals gatePassNo, manualGatePassNumber, billNumber, bitliNumber, billBook, or biltiBook.",
        tags: ['Nikasi Gate Pass'],
        summary: 'Search nikasi gate passes by number',
        body: {
          type: 'object',
          required: ['number'],
          properties: {
            number: {
              type: 'number',
              description:
                'Number to search. Matches gatePassNo, manualGatePassNumber, billNumber, bitliNumber, billBook, or biltiBook.',
            },
          },
        },
        response: {
          200: {
            description: 'Matching nikasi gate passes (may be empty)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  nikasiGatePasses: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: nikasiGatePassItemProperties,
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthorized or missing cold storage context',
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
          400: {
            description: 'Bad request',
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
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    searchNikasiGatePassHandler as never
  );

  // Get all nikasi gate passes for report (no pagination, optional date range)
  fastify.get(
    '/report',
    {
      schema: {
        ...getNikasiGatePassReportSchema,
        description:
          "Get nikasi gate pass report rows for the authenticated store admin's cold storage without pagination. Optional inclusive date range via dateFrom and dateTo (ISO dates). Sorted by gate pass number descending.",
        tags: ['Nikasi Gate Pass'],
        summary: 'Get nikasi gate pass report',
        querystring: {
          type: 'object',
          properties: {
            dateFrom: {
              type: 'string',
              format: 'date',
              description:
                'Filter by date range start (inclusive). ISO date string, e.g. 2026-03-01.',
            },
            dateTo: {
              type: 'string',
              format: 'date',
              description:
                'Filter by date range end (inclusive). ISO date string, e.g. 2026-03-07.',
            },
          },
        },
        response: {
          200: {
            description:
              'Nikasi gate pass report rows for the cold storage (no pagination)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  nikasiGatePasses: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthorized or missing cold storage context',
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
          400: {
            description: 'Bad request - invalid date format',
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
    getNikasiGatePassReportHandler as never
  );

  fastify.get(
    '/',
    {
      schema: {
        description:
          "Get nikasi gate passes for the authenticated store admin's cold storage. Supports pagination (limit, page), sortOrder (asc | desc) by gate pass number (default desc), and optional filters dateFrom/dateTo (inclusive).",
        tags: ['Nikasi Gate Pass'],
        summary: 'Get all nikasi gate passes for current cold storage',
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Items per page (default 10, max 5000)',
            },
            page: { type: 'number', description: 'Page number (default 1)' },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort by gate pass number (default desc)',
            },
            dateFrom: {
              type: 'string',
              format: 'date',
              description:
                'Filter by date range start (inclusive). ISO date string, e.g. 2026-03-01.',
            },
            dateTo: {
              type: 'string',
              format: 'date',
              description:
                'Filter by date range end (inclusive). ISO date string, e.g. 2026-03-07.',
            },
          },
        },
        response: {
          200: {
            description: 'Paginated list of nikasi gate passes',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  nikasiGatePasses: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: nikasiGatePassItemProperties,
                      additionalProperties: true,
                    },
                  },
                  pagination: {
                    type: 'object',
                    properties: {
                      page: { type: 'number' },
                      limit: { type: 'number' },
                      total: { type: 'number' },
                      totalPages: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthorized or missing cold storage context',
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
    getNikasiGatePassesByColdStorageHandler as never
  );
}
