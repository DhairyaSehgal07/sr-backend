import { FastifyInstance } from 'fastify';
import {
  updateFarmerStorageLinkHandler,
  getFarmerStorageLinksByColdStorageHandler,
  getGatePassesHandler,
  quickRegisterFarmerHandler,
} from './farmer-storage-link.controller.js';
import {
  quickRegisterFarmerSchema,
  updateFarmerStorageLinkSchema,
  getGatePassesParamsSchema,
} from './farmer-storage-link.schema.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register farmer storage link routes
 */
export async function farmerStorageLinkRoutes(fastify: FastifyInstance) {
  // Get farmer-storage-links for authenticated user's cold storage
  fastify.get(
    '/',
    {
      schema: {
        description:
          "Get all farmer-storage-links for the authenticated store admin's cold storage with farmer details populated (name, address, mobileNumber, imageUrl, aadharCardNumber, panCardNumber when set)",
        tags: ['Farmer Storage Link'],
        summary: 'Get farmer-storage-links for my cold storage',
        response: {
          200: {
            description: 'List of farmer-storage-links with populated farmer',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    farmerId: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        address: { type: 'string' },
                        mobileNumber: { type: 'string' },
                        imageUrl: { type: 'string' },
                        aadharCardNumber: { type: 'string' },
                        panCardNumber: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                    coldStorageId: { type: 'string' },
                    accountNumber: { type: 'number' },
                    isActive: { type: 'boolean' },
                    notes: { type: 'string' },
                  },
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
    getFarmerStorageLinksByColdStorageHandler as never
  );

  // Get all gate passes (incoming, grading, storage) for a farmer-storage-link
  fastify.get(
    '/:farmerStorageLinkId/gate-passes',
    {
      schema: {
        ...getGatePassesParamsSchema,
        description:
          "Get all incoming, grading, and storage gate passes for a specific farmer-storage-link. Link must belong to the authenticated store admin's cold storage. Returns all vouchers (no pagination) with bag totals scoped to that farmer.",
        tags: ['Farmer Storage Link'],
        summary: 'Get gate passes by farmer-storage-link',
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
        response: {
          200: {
            description:
              'All incoming, grading, and storage gate passes with aggregate bag totals',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  incoming: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                  },
                  grading: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                  },
                  storage: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                  },
                  totalIncomingBags: { type: 'number' },
                  totalGradingBags: { type: 'number' },
                  totalStorageBags: { type: 'number' },
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
              'Farmer storage link not found or not in your cold storage',
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
    getGatePassesHandler as never
  );

  // Quick register farmer
  fastify.post(
    '/quick-register-farmer',
    {
      schema: {
        ...quickRegisterFarmerSchema,
        description: 'Quick register a farmer and create farmer-storage-link',
        tags: ['Farmer Storage Link'],
        summary: 'Quick register farmer',
        response: {
          201: {
            description: 'Farmer registered successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  farmer: { type: 'object', additionalProperties: true },
                  farmerStorageLink: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
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
            description: 'Cold storage or store admin not found',
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
            description: 'Conflict - resource already exists',
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
    quickRegisterFarmerHandler as never
  );

  // Update farmer-storage-link
  fastify.put(
    '/:id',
    {
      schema: {
        ...updateFarmerStorageLinkSchema,
        description: 'Update a farmer-storage-link and associated farmer',
        tags: ['Farmer Storage Link'],
        summary: 'Update farmer-storage-link',
        response: {
          200: {
            description: 'Farmer-storage-link updated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  farmer: { type: 'object', additionalProperties: true },
                  farmerStorageLink: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
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
            description: 'Farmer-storage-link not found',
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
            description: 'Conflict - resource already exists',
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
    updateFarmerStorageLinkHandler as never
  );
}
