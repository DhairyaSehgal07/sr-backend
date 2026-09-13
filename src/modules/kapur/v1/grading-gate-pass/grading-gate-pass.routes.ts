import { FastifyInstance } from 'fastify';
import {
  createGradingGatePassHandler,
  getGradingGatePassesByColdStorageHandler,
  getGradingGatePassReportHandler,
  getGradingGatePassByIdHandler,
  searchGradingGatePassHandler,
  linkIncomingGatePassHandler,
  delinkIncomingGatePassHandler,
  updateGradingGatePassHandler,
  getGradingGatePassAuditsByColdStorageHandler,
} from './grading-gate-pass.controller.js';
import {
  createGradingGatePassSchema,
  getGradingGatePassesByStoreSchema,
  getGradingGatePassReportSchema,
  getGradingGatePassByIdSchema,
  searchGradingGatePassSchema,
  linkDelinkIncomingGatePassSchema,
  updateGradingGatePassSchema,
  getGradingGatePassAuditsByColdStorageSchema,
} from './grading-gate-pass.schema.js';
import { BagType } from './grading-gate-pass.model.js';
import { authenticate } from '../../../../utils/auth.js';

const bagTypeEnumValues = Object.values(BagType);

const gradingOrderDetailBodySchema = {
  type: 'object',
  required: ['size', 'bagType', 'quantity', 'weightPerBagKg'],
  properties: {
    size: { type: 'string', description: 'Bag size label' },
    bagType: {
      type: 'string',
      enum: bagTypeEnumValues,
      description: 'Bag type (JUTE or LENO)',
    },
    quantity: {
      type: 'number',
      description: 'Number of bags for this size',
    },
    weightPerBagKg: {
      type: 'number',
      description: 'Weight per bag in kg',
    },
  },
} as const;

/**
 * Register grading gate pass routes
 * @param fastify - Fastify instance
 */
export async function gradingGatePassRoutes(fastify: FastifyInstance) {
  // Create grading gate pass endpoint
  fastify.post(
    '/',
    {
      schema: {
        ...createGradingGatePassSchema,
        description:
          'Create a new grading gate pass. Accepts zero or more incoming gate pass IDs in `incomingGatePassIds` (array or null). Each order detail has a single `quantity` (bags per size). Referenced incoming gate passes must have status NOT_GRADED; they are updated to GRADED after creation. Returns 409 if any incoming gate pass is already graded.',
        tags: ['Grading Gate Pass'],
        summary: 'Create grading gate pass',
        body: {
          type: 'object',
          required: [
            'farmerStorageLinkId',
            'gatePassNo',
            'date',
            'variety',
            'orderDetails',
          ],
          properties: {
            farmerStorageLinkId: {
              type: 'string',
              description: 'Farmer storage link ID',
            },
            incomingGatePassIds: {
              anyOf: [
                {
                  type: 'array',
                  items: { type: 'string' },
                },
                { type: 'null' },
              ],
              description:
                'Incoming gate pass IDs to grade. Omit, pass null, or pass an empty array when no incoming gate pass is linked yet.',
            },
            gatePassNo: {
              type: 'number',
              description: 'Grading gate pass number',
            },
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
            orderDetails: {
              type: 'array',
              items: gradingOrderDetailBodySchema,
              minItems: 1,
              description: 'Graded bag breakdown by size',
            },
            remarks: { type: 'string', description: 'Optional remarks' },
          },
        },
        response: {
          201: {
            description: 'Grading gate pass created successfully',
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
            description:
              'One or more incoming gate passes or store admin not found',
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
            description:
              'Conflict - duplicate gatePassNo (GATE_PASS_NUMBER_EXISTS), or incoming pass already graded (INCOMING_GATE_PASS_ALREADY_GRADED)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    enum: [
                      'GATE_PASS_NUMBER_EXISTS',
                      'INCOMING_GATE_PASS_ALREADY_GRADED',
                      'DUPLICATE_KEY_ERROR',
                    ],
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
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    createGradingGatePassHandler as never
  );

  // Search grading gate passes by gate pass number or manual gate pass number
  fastify.post(
    '/search',
    {
      schema: {
        ...searchGradingGatePassSchema,
        description:
          "Search grading gate passes for the authenticated store admin's cold storage. Matches documents where the provided number equals either gatePassNo or manualGatePassNumber.",
        tags: ['Grading Gate Pass'],
        summary: 'Search grading gate passes by number',
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
            description: 'Matching grading gate passes (may be empty)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  gradingGatePasses: {
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
    searchGradingGatePassHandler as never
  );

  const linkDelinkBodySchema = {
    type: 'object',
    required: ['incomingGatePassId'],
    properties: {
      incomingGatePassId: {
        type: 'string',
        description: 'Incoming gate pass ID to link or delink',
      },
    },
  } as const;

  const linkDelinkParamsSchema = {
    type: 'object',
    required: ['gradingGatePassId'],
    properties: {
      gradingGatePassId: {
        type: 'string',
        description: 'Grading gate pass ID',
      },
    },
  } as const;

  const linkDelinkSuccessResponse = {
    200: {
      description: 'Grading gate pass updated successfully',
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
      description: 'Grading or incoming gate pass not found, or not linked',
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
      description: 'Conflict - already linked or already graded',
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
  };

  // Link an incoming gate pass to a grading gate pass (marks incoming as GRADED)
  fastify.post(
    '/:gradingGatePassId/incoming-gate-pass/link',
    {
      schema: {
        ...linkDelinkIncomingGatePassSchema,
        description:
          'Link an incoming gate pass to a grading gate pass. Adds the incoming gate pass ID to `incomingGatePassIds` and sets its status to GRADED. Incoming pass must be NOT_GRADED, belong to the same farmer storage link, and not be linked to another grading pass. Creates an audit record with previousState and modifiedState for `incomingGatePassIds`.',
        tags: ['Grading Gate Pass'],
        summary: 'Link incoming gate pass to grading gate pass',
        params: linkDelinkParamsSchema,
        body: linkDelinkBodySchema,
        response: linkDelinkSuccessResponse,
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    linkIncomingGatePassHandler as never
  );

  // Delink an incoming gate pass from a grading gate pass (marks incoming as NOT_GRADED)
  fastify.post(
    '/:gradingGatePassId/incoming-gate-pass/delink',
    {
      schema: {
        ...linkDelinkIncomingGatePassSchema,
        description:
          'Delink an incoming gate pass from a grading gate pass. Removes the ID from `incomingGatePassIds` and sets its status to NOT_GRADED. The array may become empty. Creates an audit record with previousState and modifiedState for `incomingGatePassIds`.',
        tags: ['Grading Gate Pass'],
        summary: 'Delink incoming gate pass from grading gate pass',
        params: linkDelinkParamsSchema,
        body: linkDelinkBodySchema,
        response: linkDelinkSuccessResponse,
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    delinkIncomingGatePassHandler as never
  );

  // Get all grading gate passes for the current logged-in store (cold storage), with pagination
  fastify.get(
    '/',
    {
      schema: {
        ...getGradingGatePassesByStoreSchema,
        description:
          "Get grading gate passes for the current logged-in store (authenticated store admin's cold storage). Supports pagination (limit default 10, page) and sortOrder (asc | desc) by gate pass number (default desc). Each item's `incomingGatePassIds` is populated with _id, gatePassNo, manualGatePassNumber, bagsReceived, truckNumber, date, grossWeightKg, and tareWeightKg.",
        tags: ['Grading Gate Pass'],
        summary: 'Get all gate passes for current store',
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Items per page (default 10, max 100)',
            },
            page: { type: 'number', description: 'Page number (default 1)' },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort by gate pass number (default desc)',
            },
          },
        },
        response: {
          200: {
            description: 'Paginated list of grading gate passes',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  gradingGatePasses: {
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
    getGradingGatePassesByColdStorageHandler as never
  );

  // Get all grading gate passes for report (no pagination, optional date range)
  fastify.get(
    '/report',
    {
      schema: {
        ...getGradingGatePassReportSchema,
        description:
          "Get grading gate passes for the authenticated store admin's cold storage without pagination, excluding createdAt, updatedAt, and __v. Populates farmerStorageLinkId and incomingGatePassIds. Includes incoming net weight, grading net weight, wastage, and wastage percentage. Optional inclusive date range via dateFrom and dateTo (ISO dates). Sorted by gate pass number descending.",
        tags: ['Grading Gate Pass'],
        summary: 'Get grading gate pass report',
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
              'Grading gate pass report rows for the cold storage (no pagination)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  gradingGatePasses: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        farmerStorageLinkId: {
                          type: 'object',
                          properties: {
                            _id: { type: 'string' },
                            accountNumber: { type: 'number' },
                            farmerId: {
                              type: 'object',
                              properties: {
                                _id: { type: 'string' },
                                name: { type: 'string' },
                                address: { type: 'string' },
                              },
                            },
                          },
                        },
                        incomingGatePassIds: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              _id: { type: 'string' },
                              manualGatePassNumber: { type: 'number' },
                              bagsReceived: { type: 'number' },
                              stage: { type: 'string' },
                              category: { type: 'string' },
                              netWeightKg: {
                                type: 'string',
                                description:
                                  'Incoming net weight: gross - tare - (bagsReceived × jute bag weight)',
                              },
                            },
                          },
                          description: 'Associated incoming gate passes',
                        },
                        createdBy: {
                          type: 'object',
                          properties: {
                            _id: { type: 'string' },
                            name: { type: 'string' },
                          },
                        },
                        gatePassNo: { type: 'number' },
                        manualGatePassNumber: { type: 'number' },
                        date: {
                          type: 'string',
                          format: 'date-time',
                          description: 'Gate pass date',
                        },
                        variety: { type: 'string' },
                        orderDetails: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              size: { type: 'string' },
                              bagType: { type: 'string' },
                              quantity: { type: 'number' },
                              weightPerBagKg: { type: 'number' },
                            },
                          },
                        },
                        totalBags: {
                          type: 'number',
                          description:
                            'Total bags: sum of quantity across all order detail bag sizes',
                        },
                        incomingNetWeightKg: {
                          type: 'string',
                          description:
                            'Sum of incoming net weights for associated incoming gate passes',
                        },
                        netWeightKg: {
                          type: 'string',
                          description:
                            'Grading net weight: sum of quantity × (weightPerBagKg - bag weight)',
                        },
                        wastageKg: {
                          type: 'string',
                          description:
                            'incomingNetWeightKg - netWeightKg; can be negative',
                        },
                        wastagePercentage: {
                          type: 'string',
                          description:
                            '(wastageKg / incomingNetWeightKg) × 100; can be negative',
                        },
                        remarks: { type: 'string' },
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
          max: 200,
          timeWindow: '1 minute',
        },
      },
    },
    getGradingGatePassReportHandler as never
  );

  // Get grading gate pass audit records for authenticated user's cold storage
  fastify.get(
    '/edits',
    {
      schema: {
        ...getGradingGatePassAuditsByColdStorageSchema,
        description:
          "Get audit records for all grading gate pass edits in the authenticated store admin's cold storage. Supports pagination (limit default 10, page). Results are sorted by newest first. Each audit entry contains previousState and modifiedState with only the fields that changed.",
        tags: ['Grading Gate Pass'],
        summary:
          'Get grading gate pass edit audit trail for current cold storage',
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
              'Paginated audit records for grading gate pass edits in current cold storage',
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
    getGradingGatePassAuditsByColdStorageHandler as never
  );

  // Get a single grading gate pass by ID
  fastify.get(
    '/:gradingGatePassId',
    {
      schema: {
        ...getGradingGatePassByIdSchema,
        description:
          "Get a grading gate pass by ID for the authenticated store admin's cold storage. `incomingGatePassIds` includes _id, gatePassNo, manualGatePassNumber, bagsReceived, truckNumber, date, grossWeightKg, and tareWeightKg.",
        tags: ['Grading Gate Pass'],
        summary: 'Get grading gate pass by ID',
        params: {
          type: 'object',
          required: ['gradingGatePassId'],
          properties: {
            gradingGatePassId: {
              type: 'string',
              description: 'Grading gate pass ID',
            },
          },
        },
        response: {
          200: {
            description: 'Grading gate pass details',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object', additionalProperties: true },
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
            description: 'Grading gate pass not found',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    example: 'GRADING_GATE_PASS_NOT_FOUND',
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
          400: {
            description: 'Bad request - invalid ID',
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
    getGradingGatePassByIdHandler as never
  );

  // Update grading gate pass (partial update; allowed fields only)
  fastify.put(
    '/:gradingGatePassId',
    {
      schema: {
        ...updateGradingGatePassSchema,
        description:
          'Update a grading gate pass. Allowed fields: variety, date, manualGatePassNumber, orderDetails, remarks. gatePassNo, farmerStorageLinkId, and incomingGatePassIds cannot be changed via this endpoint. Pass null for manualGatePassNumber to clear it. Creates an audit record with previousState and modifiedState containing only the fields that changed.',
        tags: ['Grading Gate Pass'],
        summary: 'Update grading gate pass',
        params: {
          type: 'object',
          required: ['gradingGatePassId'],
          properties: {
            gradingGatePassId: {
              type: 'string',
              description: 'Grading gate pass ID',
            },
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
            variety: { type: 'string' },
            orderDetails: {
              type: 'array',
              items: gradingOrderDetailBodySchema,
              minItems: 1,
            },
            remarks: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Grading gate pass updated successfully',
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
            description: 'Grading gate pass not found',
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
    updateGradingGatePassHandler as never
  );
}
