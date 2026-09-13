import { FastifyInstance } from 'fastify';
import {
  getVarietyDistributionHandler,
  getDailyMonthlyTrendHandler,
} from './analytics.controller.js';
import { authenticate } from '../../../../utils/auth.js';

/**
 * Register analytics routes for incoming gate pass and related charts.
 * Excludes incoming-gate-pass-report (handled elsewhere).
 */
export async function incomingAnalyticsRoutes(fastify: FastifyInstance) {
  // Variety distribution from incoming gate passes (Recharts-ready: chartData with name, value)
  fastify.get(
    '/variety-distribution',
    {
      preHandler: [authenticate],
      schema: {
        description:
          "Variety distribution (total bags per variety) from incoming gate passes for the authenticated store admin's cold storage. Response chartData is shaped for Recharts (e.g. PieChart: name = variety, value = bags).",
        tags: ['Analytics', 'Incoming'],
        summary: 'Variety distribution chart data',
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
            description: 'Variety distribution with chartData for Recharts',
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
                        name: {
                          type: 'string',
                          description: 'Variety name (slice label)',
                        },
                        value: {
                          type: 'number',
                          description: 'Total bags received',
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
    getVarietyDistributionHandler as never
  );

  // Daily & monthly trend (incoming gate pass) – Recharts-ready for LineChart/AreaChart
  fastify.get(
    '/daily-monthly-trend',
    {
      preHandler: [authenticate],
      schema: {
        description:
          "Daily and monthly trend (bags received per day and per month) from incoming gate passes for the authenticated store admin's cold storage. Returns both daily and monthly chartData for Recharts (e.g. LineChart, AreaChart).",
        tags: ['Analytics', 'Incoming'],
        summary: 'Daily & monthly trend chart data',
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
            description: 'Daily and monthly trend with chartData for Recharts',
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
                            date: {
                              type: 'string',
                              description: 'Date YYYY-MM-DD (x-axis)',
                            },
                            bags: {
                              type: 'number',
                              description: 'Total bags that day',
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
                              description: 'Total bags that month',
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
    getDailyMonthlyTrendHandler as never
  );
}
