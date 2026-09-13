import { FastifyInstance } from 'fastify';
import {
  createOutgoingGatePassHandler,
  cancelOutgoingGatePassHandler,
  updateOutgoingGatePassHandler,
  getOutgoingShedSummaryHandler,
} from './outgoing-gate-pass.controller.js';
import { cancelOutgoingGatePassParamsSchema } from './outgoing-gate-pass.schema.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register outgoing gate pass routes
 * @param fastify - Fastify instance
 */
export async function outgoingGatePassRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        description:
          'Create a new outgoing gate pass from storage gate pass allocations',
        tags: ['Outgoing Gate Pass'],
        summary: 'Create outgoing gate pass',
        body: {
          type: 'object',
          required: [
            'farmerStorageLinkId',
            'gatePassNo',
            'date',
            'variety',
            'from',
            'to',
            'storageGatePasses',
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
            from: { type: 'string', description: 'Origin' },
            to: { type: 'string', description: 'Destination' },
            truckNumber: {
              type: 'string',
              description: 'Truck number (optional)',
            },
            billNumber: { type: 'number', description: 'Bill number' },
            biltiNumber: { type: 'number', description: 'Bilti number' },
            billBook: { type: 'string', description: 'Bill book' },
            biltiBook: { type: 'string', description: 'Bilti book' },
            category: { type: 'string', description: 'Category' },
            storageGatePasses: {
              type: 'array',
              description: 'Storage gate passes with allocations',
              items: {
                type: 'object',
                required: ['storageGatePassId', 'allocations'],
                properties: {
                  storageGatePassId: {
                    type: 'string',
                    description: 'Storage gate pass ID',
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
            replacesOutgoingGatePassId: {
              type: 'string',
              description:
                'Optional ID of a cancelled outgoing pass this pass replaces',
            },
            idempotencyKey: {
              type: 'string',
              description: 'Idempotency key for safe retries',
            },
          },
          additionalProperties: true,
        },
        response: {
          201: {
            description: 'Outgoing gate pass created successfully',
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
            description: 'Storage gate pass or farmer storage link not found',
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
    createOutgoingGatePassHandler as never
  );

  fastify.get(
    '/shed-summary',
    {
      schema: {
        description:
          'Get per-variety outgoing-to-shed summary with per-size bag quantities from ACTIVE outgoing gate passes with category "Outgoing to Shed". Optional dateFrom/dateTo filter by gate pass date.',
        tags: ['Outgoing Gate Pass'],
        summary: 'Get outgoing-to-shed summary by variety',
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
              'Array of { variety, quantity, sizes } with per-size bag quantity',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    variety: { type: 'string' },
                    quantity: { type: 'number' },
                    sizes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          size: { type: 'string' },
                          quantity: { type: 'number' },
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
    getOutgoingShedSummaryHandler as never
  );

  fastify.put(
    '/:outgoingGatePassId',
    {
      schema: {
        description:
          'Update an active outgoing gate pass. Allowed fields: date, manualGatePassNumber, from, to, remarks, truckNumber, billNumber, biltiNumber, billBook, biltiBook, category. gatePassNo, variety, allocations, and other stock-related fields cannot be changed via this endpoint. Pass null for manualGatePassNumber, billNumber, biltiNumber, billBook, biltiBook, or category to clear them. Creates an audit record with previousState and modifiedState containing only the fields that changed.',
        tags: ['Outgoing Gate Pass'],
        summary: 'Update outgoing gate pass',
        params: {
          type: 'object',
          required: ['outgoingGatePassId'],
          properties: {
            outgoingGatePassId: {
              type: 'string',
              description: 'Outgoing gate pass ID',
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
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Gate pass date',
            },
            from: { type: 'string', description: 'Origin' },
            to: { type: 'string', description: 'Destination' },
            truckNumber: {
              type: 'string',
              description: 'Truck number',
            },
            remarks: { type: 'string', description: 'Remarks' },
            billNumber: {
              type: ['number', 'null'],
              description: 'Bill number. Pass null to clear.',
            },
            biltiNumber: {
              type: ['number', 'null'],
              description: 'Bilti number. Pass null to clear.',
            },
            billBook: {
              type: ['string', 'null'],
              description: 'Bill book. Pass null to clear.',
            },
            biltiBook: {
              type: ['string', 'null'],
              description: 'Bilti book. Pass null to clear.',
            },
            category: {
              type: ['string', 'null'],
              description: 'Category. Pass null to clear.',
            },
          },
        },
        response: {
          200: {
            description: 'Outgoing gate pass updated successfully',
            type: 'object',
            properties: {
              status: { type: 'string' },
              message: { type: 'string' },
              data: { type: 'object', additionalProperties: true },
            },
          },
          400: {
            description:
              'Bad request (e.g. cancelled pass, no fields to update)',
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
            description: 'Outgoing gate pass not found',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
            },
          },
          409: {
            description: 'Concurrent modification',
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
    updateOutgoingGatePassHandler as never
  );

  fastify.post(
    '/:outgoingGatePassId/cancel',
    {
      schema: {
        ...cancelOutgoingGatePassParamsSchema,
        description:
          'Cancel an active outgoing gate pass. Restores bag quantities on linked storage gate passes using the stored snapshots, marks the pass as CANCELLED, and records an audit entry. Pass must belong to the authenticated store admin cold storage.',
        tags: ['Outgoing Gate Pass'],
        summary: 'Cancel outgoing gate pass',
        params: {
          type: 'object',
          required: ['outgoingGatePassId'],
          properties: {
            outgoingGatePassId: {
              type: 'string',
              description: 'Outgoing gate pass ID',
            },
          },
        },
        body: {
          type: 'object',
          required: ['cancellationRemarks'],
          properties: {
            cancellationRemarks: {
              type: 'string',
              description: 'Reason for cancellation (required)',
            },
          },
        },
        response: {
          200: {
            description: 'Outgoing gate pass cancelled successfully',
            type: 'object',
            properties: {
              status: { type: 'string' },
              message: { type: 'string' },
              data: { type: 'object', additionalProperties: true },
            },
          },
          400: {
            description:
              'Bad request (e.g. already cancelled, missing remarks)',
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
            description: 'Outgoing gate pass not found',
            type: 'object',
            properties: {
              status: { type: 'string' },
              statusCode: { type: 'number' },
              errorCode: { type: 'string' },
              message: { type: 'string' },
            },
          },
          409: {
            description: 'Concurrent modification during stock restore',
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
    cancelOutgoingGatePassHandler as never
  );
}
