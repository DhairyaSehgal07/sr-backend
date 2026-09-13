import { FastifyInstance } from 'fastify';
import {
  createTransferStockHandler,
  getTransferStockGatePassesByColdStorageHandler,
  getTransferStockReportHandler,
} from './transfer-stock.controller.js';
import {
  getTransferStockGatePassesByColdStorageQuerySchema,
  getTransferStockReportSchema,
} from './transfer-stock.schema.js';
import { authenticate } from '../../../../utils/auth.js';
import { STORAGE_CATEGORIES } from '../../../../config/constants.js';

/**
 * Register transfer stock routes
 */
export async function transferStockRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    {
      schema: {
        ...getTransferStockGatePassesByColdStorageQuerySchema,
        description:
          "Get transfer stock gate passes for the authenticated store admin's cold storage. Supports pagination (limit default 10, page), sortOrder (asc | desc) by gate pass number (default desc), search by gatePassNo, and date range (dateFrom, dateTo). If gatePassNo is provided and no match exists, returns 404.",
        tags: ['Transfer Stock'],
        summary: 'Get transfer stock gate passes for my cold storage',
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
            gatePassNo: {
              type: 'number',
              description:
                'Search by transfer gate pass number. Returns matching records or 404 if not found.',
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
            description:
              'Paginated list of transfer stock gate passes (or single match when gatePassNo is provided)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  transferStockGatePasses: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
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
          404: {
            description:
              'Transfer stock gate pass not found (when gatePassNo is provided and no match exists)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    example: 'TRANSFER_STOCK_GATE_PASS_NOT_FOUND',
                  },
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
    getTransferStockGatePassesByColdStorageHandler as never
  );

  fastify.get(
    '/report',
    {
      schema: {
        ...getTransferStockReportSchema,
        description:
          "Get transfer stock gate pass report rows for the authenticated store admin's cold storage without pagination. Optional inclusive date range via dateFrom and dateTo (ISO dates). Returns flat string rows and column metadata for TanStack Table.",
        tags: ['Transfer Stock'],
        summary: 'Get transfer stock gate pass report',
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
              'Transfer stock report rows and TanStack Table column definitions',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  columns: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        accessorKey: { type: 'string' },
                        header: { type: 'string' },
                      },
                    },
                  },
                  transferStockGatePasses: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        gatePassNo: { type: 'string' },
                        date: { type: 'string' },
                        variety: { type: 'string' },
                        fromFarmerName: { type: 'string' },
                        fromAccountNumber: { type: 'string' },
                        fromFarmerAddress: { type: 'string' },
                        toFarmerName: { type: 'string' },
                        toAccountNumber: { type: 'string' },
                        toFarmerAddress: { type: 'string' },
                        truckNumber: { type: 'string' },
                        outgoingGatePassNo: { type: 'string' },
                        destinationStorageGatePassNo: { type: 'string' },
                        totalBags: { type: 'string' },
                        bagDetails: { type: 'string' },
                        remarks: { type: 'string' },
                        createdBy: { type: 'string' },
                      },
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
    getTransferStockReportHandler as never
  );

  fastify.post(
    '/',
    {
      schema: {
        description:
          'Transfer stock from one farmer storage link to another. Deducts source storage gate pass quantities, creates a destination storage gate pass, an outgoing gate pass on the source farmer, and a transfer stock record linking all three. Outgoing and destination storage gate pass numbers are auto-generated from the next voucher sequence.',
        tags: ['Transfer Stock'],
        summary: 'Create transfer stock gate pass',
        body: {
          type: 'object',
          required: [
            'fromFarmerStorageLinkId',
            'toFarmerStorageLinkId',
            'gatePassNo',
            'date',
            'variety',
            'category',
            'from',
            'to',
            'storageGatePasses',
          ],
          properties: {
            fromFarmerStorageLinkId: {
              type: 'string',
              description: 'Source farmer storage link ID',
            },
            toFarmerStorageLinkId: {
              type: 'string',
              description: 'Destination farmer storage link ID',
            },
            gatePassNo: {
              type: 'number',
              description:
                'Transfer voucher number (unique per source farmer link)',
            },
            manualGatePassNumber: {
              type: 'number',
              description:
                'Manual gate pass number for the destination storage gate pass (incoming side)',
            },
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Transfer date',
            },
            variety: { type: 'string', description: 'Variety' },
            category: {
              type: 'string',
              enum: [...STORAGE_CATEGORIES],
              description:
                'Storage category for the destination storage gate pass',
            },
            stage: { type: 'string', description: 'Optional stage' },
            from: {
              type: 'string',
              description: 'Origin label for the outgoing gate pass',
            },
            to: {
              type: 'string',
              description: 'Destination label for the outgoing gate pass',
            },
            truckNumber: {
              type: 'string',
              description: 'Truck number (optional)',
            },
            storageGatePasses: {
              type: 'array',
              description: 'Source storage gate passes with allocations',
              items: {
                type: 'object',
                required: ['storageGatePassId', 'allocations'],
                properties: {
                  storageGatePassId: {
                    type: 'string',
                    description: 'Source storage gate pass ID',
                  },
                  allocations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: [
                        'size',
                        'quantityToAllocate',
                        'weightInKg',
                        'chamber',
                        'floor',
                        'row',
                      ],
                      properties: {
                        size: { type: 'string' },
                        quantityToAllocate: { type: 'number' },
                        weightInKg: { type: 'number' },
                        chamber: { type: 'string' },
                        floor: { type: 'string' },
                        row: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            remarks: { type: 'string', description: 'Remarks' },
            idempotencyKey: {
              type: 'string',
              description: 'Idempotency key for safe retries',
            },
          },
          additionalProperties: true,
        },
        response: {
          201: {
            description: 'Transfer stock gate pass created successfully',
            type: 'object',
            properties: {
              status: { type: 'string' },
              message: { type: 'string' },
              data: { type: 'object', additionalProperties: true },
            },
          },
          400: {
            description: 'Bad request',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
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
          404: {
            description: 'Farmer storage link or storage gate pass not found',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
            },
          },
          409: {
            description:
              'Conflict - duplicate gate pass number or concurrent modification',
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
    createTransferStockHandler as never
  );
}
