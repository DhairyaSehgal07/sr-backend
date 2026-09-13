import { FastifyInstance } from 'fastify';
import {
  createIncomingGatePassHandler,
  getIncomingGatePassesByColdStorageHandler,
  getIncomingGatePassReportHandler,
  getIncomingGatePassesByFarmerStorageLinkIdHandler,
  getIncomingGatePassAuditsByColdStorageHandler,
  searchIncomingGatePassHandler,
  updateIncomingGatePassHandler,
} from './incoming-gate-pass.controller.js';
import {
  createIncomingGatePassSchema,
  getIncomingGatePassesByFarmerStorageLinkSchema,
  getIncomingGatePassAuditsByColdStorageSchema,
  getIncomingGatePassReportSchema,
  searchIncomingGatePassSchema,
  updateIncomingGatePassSchema,
} from './incoming-gate-pass.schema.js';
import {
  GatePassStatus,
  IncomingGatePassCategory,
} from './incoming-gate-pass.model.js';
import { authenticate } from '../../../../utils/auth.js';

const categoryEnumValues = Object.values(IncomingGatePassCategory);
const statusEnumValues = Object.values(GatePassStatus);

/**
 * Register incoming gate pass routes
 * @param fastify - Fastify instance
 */
export async function incomingGatePassRoutes(fastify: FastifyInstance) {
  // Create incoming gate pass endpoint
  fastify.post(
    '/',
    {
      schema: {
        ...createIncomingGatePassSchema,
        description: 'Create a new incoming gate pass',
        tags: ['Incoming Gate Pass'],
        summary: 'Create incoming gate pass',
        body: {
          type: 'object',
          required: [
            'farmerStorageLinkId',
            'gatePassNo',
            'date',
            'variety',
            'category',
            'truckNumber',
            'bagsReceived',
          ],
          properties: {
            farmerStorageLinkId: { type: 'string' },
            gatePassNo: { type: 'number' },
            manualGatePassNumber: { type: 'number' },
            date: { type: 'string', format: 'date-time' },
            variety: { type: 'string' },
            category: {
              type: 'string',
              enum: categoryEnumValues,
              description: 'Category of the gate pass',
            },
            truckNumber: { type: 'string' },
            bagsReceived: { type: 'number' },
            weightSlip: {
              type: 'object',
              properties: {
                slipNumber: { type: 'string' },
                grossWeightKg: { type: 'number' },
                tareWeightKg: { type: 'number' },
              },
            },
            status: {
              type: 'string',
              enum: statusEnumValues,
            },
            stage: { type: 'string' },
            remarks: { type: 'string' },
          },
        },
        response: {
          201: {
            description: 'Incoming gate pass created successfully',
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
            description: 'Farmer storage link or store admin not found',
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
            description: 'Conflict - gate pass number already exists',
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
    createIncomingGatePassHandler as never
  );

  // Search incoming gate passes by gate pass number or manual gate pass number
  fastify.post(
    '/search',
    {
      schema: {
        ...searchIncomingGatePassSchema,
        description:
          "Search incoming gate passes for the authenticated store admin's cold storage. Matches documents where the provided number equals either gatePassNo or manualGatePassNumber.",
        tags: ['Incoming Gate Pass'],
        summary: 'Search incoming gate passes by number',
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
            description: 'Matching incoming gate passes (may be empty)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  incomingGatePasses: {
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
    searchIncomingGatePassHandler as never
  );

  // Get incoming gate passes for a specific farmer storage link (all results, no pagination)
  fastify.get(
    '/farmer-storage-link/:farmerStorageLinkId',
    {
      schema: {
        ...getIncomingGatePassesByFarmerStorageLinkSchema,
        description:
          "Get all incoming gate passes for a specific farmer storage link (all statuses: GRADED and NOT_GRADED). The link must belong to the authenticated store admin's cold storage. Returns all results (no pagination). Optional filter: sortOrder (asc | desc, default desc).",
        tags: ['Incoming Gate Pass'],
        summary: 'Get incoming gate passes by farmer storage link',
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
              'List of all incoming gate passes for the farmer storage link (graded and ungraded)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  incomingGatePasses: {
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
    getIncomingGatePassesByFarmerStorageLinkIdHandler as never
  );

  // Get all incoming gate passes for authenticated user's cold storage (with pagination)
  fastify.get(
    '/',
    {
      schema: {
        description:
          "Get incoming gate passes for the authenticated store admin's cold storage. Supports pagination (limit default 10, page), sortOrder (asc | desc) by gate pass number (default desc), search by gatePassNo, filter by grading (status=graded|ungraded), and date range (dateFrom, dateTo). If gatePassNo is provided and no match exists, returns 404. Use status=graded for vouchers with status GRADED, status=ungraded for NOT_GRADED. Use dateFrom and dateTo (ISO dates, e.g. 2026-03-01, 2026-03-07) for inclusive date range.",
        tags: ['Incoming Gate Pass'],
        summary: 'Get incoming gate passes for my cold storage',
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
                'Search by gate pass number. Returns the single matching gate pass or 404 if not found.',
            },
            status: {
              type: 'string',
              enum: ['graded', 'ungraded'],
              description:
                'Filter by grading: graded = status GRADED, ungraded = status NOT_GRADED.',
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
              'Paginated list of incoming gate passes (or single match when gatePassNo is provided)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  incomingGatePasses: {
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
              'Incoming gate pass not found (when gatePassNo is provided and no match exists)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    example: 'INCOMING_GATE_PASS_NOT_FOUND',
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
    getIncomingGatePassesByColdStorageHandler as never
  );

  // Get all incoming gate passes for report (no pagination, optional date range)
  fastify.get(
    '/report',
    {
      schema: {
        ...getIncomingGatePassReportSchema,
        description:
          "Get incoming gate pass report rows for the authenticated store admin's cold storage without pagination. Each row includes farmer name/address, gate pass details, weight slip fields, bardana (bags × jute bag weight from constants), and net weight (gross − tare − bardana). Optional inclusive date range via dateFrom and dateTo (ISO dates). Sorted by gate pass number descending.",
        tags: ['Incoming Gate Pass'],
        summary: 'Get incoming gate pass report',
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
              'Incoming gate pass report rows for the cold storage (no pagination)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  incomingGatePasses: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: {
                          type: 'string',
                          description: 'Farmer name',
                        },
                        address: {
                          type: 'string',
                          description: 'Farmer address',
                        },
                        manualGatePassNumber: { type: 'string' },
                        gatePassNo: { type: 'string' },
                        date: {
                          type: 'string',
                          description: 'Gate pass date (YYYY-MM-DD)',
                        },
                        variety: { type: 'string' },
                        stage: { type: 'string' },
                        truckNumber: { type: 'string' },
                        bags: {
                          type: 'string',
                          description: 'Bags received',
                        },
                        slipNumber: { type: 'string' },
                        grossWeightKg: { type: 'string' },
                        tareWeightKg: { type: 'string' },
                        bardanaWeightKg: {
                          type: 'string',
                          description:
                            'bags × jute bag weight (from constants)',
                        },
                        netWeightKg: {
                          type: 'string',
                          description: 'gross − tare − bardanaWeightKg',
                        },
                        remarks: { type: 'string' },
                        status: { type: 'string' },
                        createdBy: {
                          type: 'string',
                          description: 'Store admin name who created the pass',
                        },
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
    getIncomingGatePassReportHandler as never
  );

  // Get incoming gate pass audit records for authenticated user's cold storage
  fastify.get(
    '/edits',
    {
      schema: {
        ...getIncomingGatePassAuditsByColdStorageSchema,
        description:
          "Get audit records for all incoming gate pass edits in the authenticated store admin's cold storage. Supports pagination (limit default 10, page). Results are sorted by newest first. Each audit entry contains previousState and modifiedState with only the fields that changed.",
        tags: ['Incoming Gate Pass'],
        summary:
          'Get incoming gate pass edit audit trail for current cold storage',
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
              'Paginated audit records for incoming gate pass edits in current cold storage',
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
    getIncomingGatePassAuditsByColdStorageHandler as never
  );

  // Update incoming gate pass (partial update; allowed fields only)
  fastify.put(
    '/:id',
    {
      schema: {
        ...updateIncomingGatePassSchema,
        description:
          'Update an incoming gate pass. Allowed fields: manualGatePassNumber, truckNumber, date, farmerStorageLinkId, variety, category, stage, bagsReceived, weightSlip (slipNumber, grossWeightKg, tareWeightKg), remarks. gatePassNo and status cannot be changed. Creates an audit record with previousState and modifiedState containing only the fields that changed.',
        tags: ['Incoming Gate Pass'],
        summary: 'Update incoming gate pass',
        body: {
          type: 'object',
          properties: {
            manualGatePassNumber: {
              type: ['number', 'null'],
              description:
                'Manual gate pass number. Pass null to clear the value.',
            },
            truckNumber: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
            farmerStorageLinkId: { type: 'string' },
            variety: { type: 'string' },
            category: {
              type: 'string',
              enum: categoryEnumValues,
            },
            stage: { type: 'string' },
            bagsReceived: { type: 'number' },
            weightSlip: {
              type: 'object',
              properties: {
                slipNumber: { type: 'string' },
                grossWeightKg: { type: 'number' },
                tareWeightKg: { type: 'number' },
              },
            },
            remarks: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Incoming gate pass updated successfully',
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
            description: 'Incoming gate pass or farmer storage link not found',
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
    updateIncomingGatePassHandler as never
  );
}
