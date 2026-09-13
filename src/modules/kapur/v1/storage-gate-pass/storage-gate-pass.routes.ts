import { FastifyInstance } from 'fastify';
import {
  createStorageGatePassHandler,
  getStorageGatePassAuditsByColdStorageHandler,
  getStorageGatePassReportHandler,
  getStorageGatePassesByFarmerStorageLinkIdHandler,
  getStorageGatePassesByColdStorageHandler,
  searchStorageGatePassHandler,
  updateStorageGatePassHandler,
} from './storage-gate-pass.controller.js';
import {
  getStorageGatePassAuditsByColdStorageSchema,
  getStorageGatePassReportSchema,
  getStorageGatePassesByFarmerStorageLinkSchema,
  updateStorageGatePassSchema,
} from './storage-gate-pass.schema.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register storage gate pass routes
 * @param fastify - Fastify instance
 */
export async function storageGatePassRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new storage gate pass',
        tags: ['Storage Gate Pass'],
        summary: 'Create storage gate pass',
        body: {
          type: 'object',
          required: [
            'farmerStorageLinkId',
            'gatePassNo',
            'date',
            'variety',
            'storageCategory',
            'bagSizes',
          ],
          properties: {
            farmerStorageLinkId: {
              type: 'string',
              description: 'Farmer storage link ID',
            },
            gatePassNo: { type: 'number', description: 'Gate pass number' },
            manualGatePassNumber: {
              type: 'number',
              description: 'Optional manual gate pass number',
            },
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Gate pass date',
            },
            variety: { type: 'string', description: 'Variety' },
            storageCategory: {
              type: 'string',
              description: 'Storage category',
            },
            generation: {
              type: 'string',
              description: 'Optional generation',
            },
            stage: {
              type: 'string',
              description: 'Optional stage',
            },
            bagSizes: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
              description: 'Bag sizes',
            },
            remarks: { type: 'string', description: 'Remarks' },
            idempotencyKey: { type: 'string', description: 'Idempotency key' },
          },
          additionalProperties: true,
        },
        response: {
          201: {
            description: 'Storage gate pass created successfully',
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
          404: {
            description: 'Farmer storage link not found',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
            },
          },
          409: {
            description: 'Conflict - gate pass number already exists',
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
    createStorageGatePassHandler as never
  );

  fastify.post(
    '/search',
    {
      schema: {
        description:
          "Search storage gate passes for the authenticated store admin's cold storage. Matches documents where the provided number equals either gatePassNo or manualGatePassNumber.",
        tags: ['Storage Gate Pass'],
        summary: 'Search storage gate passes by number',
        body: {
          type: 'object',
          required: ['number'],
          properties: {
            number: {
              type: 'number',
              description:
                'Gate pass number to search. Matches gatePassNo or manualGatePassNumber.',
            },
          },
        },
        response: {
          200: {
            description: 'Matching storage gate passes (may be empty)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  storageGatePasses: {
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
    searchStorageGatePassHandler as never
  );

  // Get all storage gate passes for report (no pagination, optional date range)
  fastify.get(
    '/report',
    {
      schema: {
        ...getStorageGatePassReportSchema,
        description:
          "Get storage gate pass report rows for the authenticated store admin's cold storage without pagination. Optional inclusive date range via dateFrom and dateTo (ISO dates). Sorted by gate pass number descending.",
        tags: ['Storage Gate Pass'],
        summary: 'Get storage gate pass report',
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
              'Storage gate pass report rows for the cold storage (no pagination)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  storageGatePasses: {
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
    getStorageGatePassReportHandler as never
  );

  fastify.get(
    '/farmer-storage-link/:farmerStorageLinkId',
    {
      schema: {
        ...getStorageGatePassesByFarmerStorageLinkSchema,
        description:
          "Get all storage gate passes for a specific farmer storage link. The link must belong to the authenticated store admin's cold storage. Returns all results (no pagination) with farmerStorageLinkId as an unpopulated ID (no createdBy or remarks). Optional filter: sortOrder (asc | desc, default desc).",
        tags: ['Storage Gate Pass'],
        summary: 'Get storage gate passes by farmer storage link',
        params: {
          type: 'object',
          required: ['farmerStorageLinkId'],
          properties: {
            farmerStorageLinkId: {
              type: 'string',
              description: 'Farmer storage link ID',
            },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort by gate pass number (default desc)',
            },
          },
        },
        response: {
          200: {
            description:
              'List of all storage gate passes for the farmer storage link',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  storageGatePasses: {
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
          404: {
            description:
              'Farmer storage link not found or does not belong to your cold storage',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    example: 'FARMER_STORAGE_LINK_NOT_FOUND',
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
          400: {
            description: 'Bad request - invalid farmer storage link ID',
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
    getStorageGatePassesByFarmerStorageLinkIdHandler as never
  );

  // Get storage gate pass audit records for authenticated user's cold storage
  fastify.get(
    '/edits',
    {
      schema: {
        ...getStorageGatePassAuditsByColdStorageSchema,
        description:
          "Get audit records for all storage gate pass edits in the authenticated store admin's cold storage. Supports pagination (limit default 10, page). Results are sorted by newest first. Each audit entry contains previousState and modifiedState with only the fields that changed.",
        tags: ['Storage Gate Pass'],
        summary:
          'Get storage gate pass edit audit trail for current cold storage',
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Items per page (default 10, max 5000)',
            },
            page: { type: 'number', description: 'Page number (default 1)' },
          },
        },
        response: {
          200: {
            description:
              'Paginated audit records for storage gate pass edits in current cold storage',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  audits: {
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
    getStorageGatePassAuditsByColdStorageHandler as never
  );

  fastify.get(
    '/',
    {
      schema: {
        description:
          "Get storage gate passes for the authenticated store admin's cold storage. Supports pagination (limit, page), sortOrder (asc | desc) by gate pass number (default desc), and optional filters dateFrom/dateTo (inclusive).",
        tags: ['Storage Gate Pass'],
        summary: 'Get all storage gate passes for current cold storage',
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
            description: 'Paginated list of storage gate passes',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  storageGatePasses: {
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
    getStorageGatePassesByColdStorageHandler as never
  );

  // Update storage gate pass (partial update; allowed fields only)
  fastify.put(
    '/:id',
    {
      schema: {
        ...updateStorageGatePassSchema,
        description:
          'Update a storage gate pass. Allowed fields: manualGatePassNumber, date, farmerStorageLinkId, variety, storageCategory, generation, stage, bagSizes (size, currentQuantity, initialQuantity, bagType, chamber, floor, row), remarks. gatePassNo cannot be changed. Creates an audit record with previousState and modifiedState containing only the fields that changed.',
        tags: ['Storage Gate Pass'],
        summary: 'Update storage gate pass',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Storage gate pass ID' },
          },
        },
        body: {
          type: 'object',
          properties: {
            manualGatePassNumber: {
              type: ['number', 'null'],
              description:
                'Manual gate pass number. Pass null to clear the value.',
            },
            date: { type: 'string', format: 'date-time' },
            farmerStorageLinkId: { type: 'string' },
            variety: { type: 'string' },
            storageCategory: { type: 'string' },
            generation: { type: 'string' },
            stage: { type: 'string' },
            bagSizes: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'size',
                  'currentQuantity',
                  'initialQuantity',
                  'bagType',
                  'chamber',
                  'floor',
                  'row',
                ],
                properties: {
                  size: { type: 'string' },
                  currentQuantity: { type: 'number' },
                  initialQuantity: { type: 'number' },
                  bagType: { type: 'string', enum: ['JUTE', 'LENO'] },
                  chamber: { type: 'string' },
                  floor: { type: 'string' },
                  row: { type: 'string' },
                },
              },
            },
            remarks: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Storage gate pass updated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object', additionalProperties: true },
              message: { type: 'string' },
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
          404: {
            description: 'Storage gate pass or farmer storage link not found',
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
          409: {
            description: 'Conflict - duplicate key',
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
    updateStorageGatePassHandler as never
  );
}
