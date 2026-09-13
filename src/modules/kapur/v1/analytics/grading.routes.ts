import { FastifyInstance } from 'fastify';
import {
  getSizeDistributionFromGradingHandler,
  getAreaWiseSizeDistributionFromGradingHandler,
  getGradingDailyMonthlyTrendHandler,
  getFarmersStockByAreaHandler,
} from './analytics.controller.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register analytics routes for grading gate pass (chart data and farmers stock).
 * Excludes grading-gate-pass-report (handled elsewhere).
 */
export async function gradingAnalyticsRoutes(fastify: FastifyInstance) {
  // Size distribution from grading gate passes (Recharts-ready: chartData by variety, each with sizes[])
  fastify.get(
    '/size-distribution',
    {
      preHandler: [authenticate],
      schema: {
        description:
          'Size-wise distribution (total bags per size) from grading gate passes, segregated by variety. Response chartData: [{ variety, sizes: [{ name, value }] }] for Recharts.',
        tags: ['Analytics', 'Grading'],
        summary: 'Size distribution after grading chart data (by variety)',
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
              'Size distribution by variety with chartData for Recharts',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  chartData: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        variety: {
                          type: 'string',
                          description: 'Variety name',
                        },
                        sizes: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: {
                                type: 'string',
                                description: 'Size name',
                              },
                              value: {
                                type: 'number',
                                description: 'Total bags in this size',
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
    getSizeDistributionFromGradingHandler as never
  );

  // Area-wise size distribution from grading (Recharts-ready: chartData by variety, each with areas[].sizes[])
  fastify.get(
    '/area-wise-size-distribution',
    {
      preHandler: [authenticate],
      schema: {
        description:
          'Area-wise size distribution from grading gate passes, segregated by variety. Each variety has areas (farmer address) with size breakdown. Response chartData: [{ variety, areas: [{ area, sizes: [{ name, value }] }] }].',
        tags: ['Analytics', 'Grading'],
        summary:
          'Area-wise size distribution after grading chart data (by variety)',
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
              'Area-wise size distribution by variety with chartData for Recharts',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  chartData: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        variety: {
                          type: 'string',
                          description: 'Variety name',
                        },
                        areas: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              area: {
                                type: 'string',
                                description: 'Area (farmer address)',
                              },
                              sizes: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    name: {
                                      type: 'string',
                                      description: 'Size name',
                                    },
                                    value: {
                                      type: 'number',
                                      description: 'Bags in this size',
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
    getAreaWiseSizeDistributionFromGradingHandler as never
  );

  // Daily & monthly trend (grading gate pass) – Recharts-ready for LineChart/AreaChart
  fastify.get(
    '/grading-daily-monthly-trend',
    {
      preHandler: [authenticate],
      schema: {
        description:
          'Daily and monthly trend (bags graded per day and per month) from grading gate passes, grouped by grader. Returns both daily and monthly chartData for Recharts (e.g. LineChart, AreaChart), each series keyed by grader.',
        tags: ['Analytics', 'Grading'],
        summary: 'Daily & monthly trend chart data (grading, by grader)',
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
              'Daily and monthly trend grouped by grader, with chartData for Recharts (each item: grader + dataPoints)',
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
                            grader: {
                              type: 'string',
                              description: 'Grader name (or Unspecified)',
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
                                    description: 'Total bags graded that day',
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
                            grader: {
                              type: 'string',
                              description: 'Grader name (or Unspecified)',
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
                                    description: 'Total bags graded that month',
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
    getGradingDailyMonthlyTrendHandler as never
  );

  // Farmers and stock matching area, size and variety (for current cold storage)
  fastify.get(
    '/farmers-stock-by-filters',
    {
      preHandler: [authenticate],
      schema: {
        description:
          "For a given area, returns all farmers (address matches area) with their respective varieties and sizes and stock per (variety, size) for the authenticated store admin's cold storage. Area is matched against farmer address (case-insensitive substring).",
        tags: ['Analytics', 'Grading'],
        summary: 'Farmers by area with varieties and sizes',
        querystring: {
          type: 'object',
          required: ['area'],
          properties: {
            area: {
              type: 'string',
              description:
                'Area filter – matched against farmer address (case-insensitive substring)',
            },
          },
        },
        response: {
          200: {
            description:
              'List of farmers in the area with varieties and sizes (stock per size)',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  farmers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        farmer: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', description: 'Farmer ID' },
                            name: { type: 'string' },
                            address: { type: 'string' },
                            mobileNumber: { type: 'string' },
                            accountNumber: { type: 'number' },
                          },
                        },
                        varieties: {
                          type: 'array',
                          description:
                            'Per-variety breakdown with sizes and stock',
                          items: {
                            type: 'object',
                            properties: {
                              variety: { type: 'string' },
                              sizes: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    size: { type: 'string' },
                                    stock: { type: 'number' },
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
            description: 'Validation error (e.g. missing or invalid params)',
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
    getFarmersStockByAreaHandler as never
  );
}
