import { FastifyInstance } from 'fastify';
import {
  getStorageGatePassReportHandler,
  getStorageSummaryHandler,
  getStorageDailyMonthlyTrendHandler,
} from './analytics.controller.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register analytics routes for storage gate pass
 */
export async function storageAnalyticsRoutes(fastify: FastifyInstance) {
  // Get storage summary by variety (initial, current, quantity removed) for authenticated store admin's cold storage
  fastify.get(
    '/storage-summary',
    {
      schema: {
        description:
          'Get per-variety summary with per-size and per bag-type (JUTE/LENO) breakdown: initial quantity, current quantity, and quantity removed. Optional dateFrom/dateTo filter by gate pass date.',
        tags: ['Analytics', 'Storage'],
        summary: 'Get storage summary by variety',
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
    getStorageSummaryHandler as never
  );

  // Get storage gate pass report for authenticated store admin's cold storage
  fastify.get(
    '/storage-gate-pass-report',
    {
      schema: {
        description:
          "Get all storage gate passes for the authenticated store admin's cold storage, optionally grouped by farmer or variety",
        tags: ['Analytics', 'Storage'],
        summary: 'Get storage gate pass report for my cold storage',
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
            variety: {
              type: 'string',
              description: 'Filter by variety (exact match)',
            },
            groupByFarmer: {
              type: 'boolean',
              description:
                'If true, response is grouped by farmer (array of { farmer, gatePasses })',
            },
            groupByVariety: {
              type: 'boolean',
              description:
                'If true, response is grouped by variety. If both groupByVariety and groupByFarmer are true, parent grouping is by variety, then each variety is further grouped by farmer (array of { variety, farmers: [{ farmer, gatePasses }] })',
            },
          },
        },
        response: {
          200: {
            description:
              'List of storage gate passes; or grouped by farmer/variety; or when both flags true, array of { variety, farmers: [{ farmer, gatePasses }] }',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
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
    getStorageGatePassReportHandler as never
  );

  // Daily & monthly trend (storage gate pass) – Recharts-ready for LineChart/AreaChart
  fastify.get(
    '/storage-daily-monthly-trend',
    {
      preHandler: [authenticate],
      schema: {
        description:
          'Daily and monthly trend (bags stored per day and per month) from storage gate passes, grouped by variety. Bags are computed using initialQuantity only (not currentQuantity). Returns both daily and monthly chartData for Recharts (e.g. LineChart, AreaChart), each series keyed by variety.',
        tags: ['Analytics', 'Storage'],
        summary: 'Daily & monthly trend chart data (storage, by variety)',
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
              'Daily and monthly trend grouped by variety, with chartData for Recharts (each item: variety + dataPoints)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  daily: {
                    type: 'object',
                    properties: {
                      chartData: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            variety: {
                              type: 'string',
                              description: 'Variety name (or Unspecified)',
                            },
                            dataPoints: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  date: {
                                    type: 'string',
                                    description: 'Date YYYY-MM-DD (x-axis)',
                                  },
                                  bags: {
                                    type: 'number',
                                    description:
                                      'Total bags stored that day (initialQuantity only)',
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  monthly: {
                    type: 'object',
                    properties: {
                      chartData: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            variety: {
                              type: 'string',
                              description: 'Variety name (or Unspecified)',
                            },
                            dataPoints: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  month: {
                                    type: 'string',
                                    description: 'Month YYYY-MM',
                                  },
                                  monthLabel: {
                                    type: 'string',
                                    description: 'Display label e.g. Jan 2024',
                                  },
                                  bags: {
                                    type: 'number',
                                    description:
                                      'Total bags stored that month (initialQuantity only)',
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
            },
          },
          400: {
            description: 'Validation error (e.g. invalid date)',
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
      config: {
        rateLimit: {
          max: 200,
          timeWindow: '1 minute',
        },
      },
    },
    getStorageDailyMonthlyTrendHandler as never
  );
}
