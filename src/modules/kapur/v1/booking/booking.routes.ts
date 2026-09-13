import { FastifyInstance } from 'fastify';
import {
  createBookingHandler,
  getBookingAuditsByColdStorageHandler,
  getBookingStorageSummaryHandler,
  getBookingSummaryHandler,
  getBookingsByColdStorageHandler,
  searchBookingHandler,
  updateBookingHandler,
} from './booking.controller.js';
import {
  getBookingAuditsByColdStorageSchema,
  updateBookingSchema,
} from './booking.schema.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register booking routes
 * @param fastify - Fastify instance
 */
export async function bookingRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new booking gate pass',
        tags: ['Booking'],
        summary: 'Create booking',
        body: {
          type: 'object',
          required: ['dispatchLedgerId', 'gatePassNo', 'date', 'bagSizes'],
          properties: {
            dispatchLedgerId: {
              type: 'string',
              description: 'Dispatch ledger ID',
            },
            gatePassNo: { type: 'number', description: 'Gate pass number' },
            manualGatePassNumber: {
              type: 'number',
              description: 'Optional manual gate pass number',
            },
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Booking date',
            },
            bagSizes: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'size',
                  'variety',
                  'currentQuantity',
                  'initialQuantity',
                ],
                properties: {
                  size: { type: 'string', description: 'Bag size' },
                  variety: { type: 'string', description: 'Variety' },
                  currentQuantity: {
                    type: 'number',
                    description: 'Current quantity',
                  },
                  initialQuantity: {
                    type: 'number',
                    description: 'Initial quantity',
                  },
                },
              },
              description: 'Bag sizes',
            },
            remarks: { type: 'string', description: 'Remarks' },
            idempotencyKey: { type: 'string', description: 'Idempotency key' },
          },
          additionalProperties: true,
        },
        response: {
          201: {
            description: 'Booking created successfully',
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
    createBookingHandler as never
  );

  fastify.post(
    '/search',
    {
      schema: {
        description:
          "Search bookings for the authenticated store admin's cold storage. Matches documents where the provided number equals either gatePassNo or manualGatePassNumber.",
        tags: ['Booking'],
        summary: 'Search bookings by number',
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
            description: 'Matching bookings (may be empty)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  bookings: {
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
    searchBookingHandler as never
  );

  fastify.get(
    '/edits',
    {
      schema: {
        ...getBookingAuditsByColdStorageSchema,
        description:
          "Get audit records for all booking edits in the authenticated store admin's cold storage. Supports pagination (limit default 10, page). Results are sorted by newest first. Each audit entry contains previousState and modifiedState with only the fields that changed.",
        tags: ['Booking'],
        summary: 'Get booking edit audit trail for current cold storage',
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
              'Paginated audit records for booking edits in current cold storage',
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
    getBookingAuditsByColdStorageHandler as never
  );

  fastify.get(
    '/',
    {
      schema: {
        description:
          "Get bookings for the authenticated store admin's cold storage. Supports pagination (limit, page), sortOrder (asc | desc) by gate pass number (default desc), and optional filters dateFrom/dateTo (inclusive).",
        tags: ['Booking'],
        summary: 'Get all bookings for current cold storage',
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
            description: 'Paginated list of bookings',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  bookings: {
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
    getBookingsByColdStorageHandler as never
  );

  fastify.get(
    '/booking-summary',
    {
      schema: {
        description:
          'Get per-variety booking summary with per-size breakdown: initial quantity, current quantity, and quantity removed. Optional dateFrom/dateTo filter by booking date.',
        tags: ['Booking'],
        summary: 'Get booking summary by variety',
        querystring: {
          type: 'object',
          properties: {
            dateFrom: {
              type: 'string',
              description: 'Start date (inclusive), YYYY-MM-DD',
            },
            dateTo: {
              type: 'string',
              description: 'End date (inclusive), YYYY-MM-DD',
            },
          },
        },
        response: {
          200: {
            description:
              'Array of { variety, initialQuantity, currentQuantity, quantityRemoved, sizes } with per-size breakdown',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    variety: { type: 'string' },
                    initialQuantity: { type: 'number' },
                    currentQuantity: { type: 'number' },
                    quantityRemoved: { type: 'number' },
                    sizes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          size: { type: 'string' },
                          initialQuantity: { type: 'number' },
                          currentQuantity: { type: 'number' },
                          quantityRemoved: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation error (e.g. invalid dateFrom/dateTo)',
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
    getBookingSummaryHandler as never
  );

  fastify.get(
    '/booking-storage-summary',
    {
      schema: {
        description:
          'Get per-variety storage summary with per-size and per bag-type (JUTE/LENO) breakdown: initial quantity, current quantity, and quantity removed. Excludes storage gate passes with storageCategory RENTAL. Optional dateFrom/dateTo filter by gate pass date.',
        tags: ['Booking'],
        summary: 'Get storage summary by variety (excluding RENTAL)',
        querystring: {
          type: 'object',
          properties: {
            dateFrom: {
              type: 'string',
              description: 'Start date (inclusive), YYYY-MM-DD',
            },
            dateTo: {
              type: 'string',
              description: 'End date (inclusive), YYYY-MM-DD',
            },
          },
        },
        response: {
          200: {
            description:
              'Array of { variety, initialQuantity, currentQuantity, quantityRemoved, sizes } with per-size and per bag-type (JUTE/LENO) breakdown',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    variety: { type: 'string' },
                    initialQuantity: { type: 'number' },
                    currentQuantity: { type: 'number' },
                    quantityRemoved: { type: 'number' },
                    sizes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          size: { type: 'string' },
                          initialQuantity: { type: 'number' },
                          currentQuantity: { type: 'number' },
                          quantityRemoved: { type: 'number' },
                          byBagType: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                bagType: { type: 'string' },
                                initialQuantity: { type: 'number' },
                                currentQuantity: { type: 'number' },
                                quantityRemoved: { type: 'number' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation error (e.g. invalid dateFrom/dateTo)',
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
    getBookingStorageSummaryHandler as never
  );

  fastify.put(
    '/:id',
    {
      schema: {
        ...updateBookingSchema,
        description:
          'Update a booking. Allowed fields: manualGatePassNumber, date, dispatchLedgerId, bagSizes (size, variety, currentQuantity, initialQuantity), remarks. gatePassNo cannot be changed. Creates an audit record with previousState and modifiedState containing only the fields that changed.',
        tags: ['Booking'],
        summary: 'Update booking',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Booking ID' },
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
            dispatchLedgerId: { type: 'string' },
            bagSizes: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'size',
                  'variety',
                  'currentQuantity',
                  'initialQuantity',
                ],
                properties: {
                  size: { type: 'string' },
                  variety: { type: 'string' },
                  currentQuantity: { type: 'number' },
                  initialQuantity: { type: 'number' },
                },
              },
            },
            remarks: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Booking updated successfully',
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
            description: 'Booking or dispatch ledger not found',
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
    updateBookingHandler as never
  );
}
