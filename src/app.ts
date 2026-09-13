import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from 'dotenv';
import { AppError } from './utils/errors.js';
import { coldStorageRoutes } from './modules/kapur/v1/cold-storage/cold-storage.routes.js';
import { storeAdminRoutes } from './modules/kapur/v1/store-admin/store-admin.routes.js';
import { farmerStorageLinkRoutes } from './modules/kapur/v1/farmer-storage-link/farmer-storage-link.routes.js';
import { incomingGatePassRoutes } from './modules/kapur/v1/incoming-gate-pass/incoming-gate-pass.routes.js';
import { gradingGatePassRoutes } from './modules/kapur/v1/grading-gate-pass/grading-gate-pass.routes.js';
import { storageGatePassRoutes } from './modules/kapur/v1/storage-gate-pass/storage-gate-pass.routes.js';
import { nikasiGatePassRoutes } from './modules/kapur/v1/nikasi-gate-pass/nikaasi-gate-pass.routes.js';
import { analyticsRoutes } from './modules/kapur/v1/analytics/analytics.routes.js';
import { temperatureRoutes } from './modules/kapur/v1/temperature/temperature.routes.js';
import { dispatchLedgerRoutes } from './modules/kapur/v1/dispatch-ledger/dispatch-ledger.routes.js';
import { bookingRoutes } from './modules/kapur/v1/booking/booking.routes.js';
import { outgoingGatePassRoutes } from './modules/kapur/v1/outgoing-gate-pass/outgoing-gate-pass.routes.js';
import { transferStockRoutes } from './modules/kapur/v1/transfer-stock/transfer-stock.routes.js';
config();

export const buildApp = async (): Promise<FastifyInstance> => {
  const fastify: FastifyInstance = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z', // timestamp
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register security headers (helmet)
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true, // ✅ allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Register Cookie plugin
  await fastify.register(cookie);

  // Register JWT plugin with production-grade configuration
  await fastify.register(jwt, {
    secret: process.env.AUTH_SECRET || 'your-secret-key-change-in-production',
    sign: {
      expiresIn: process.env.JWT_TOKEN_EXPIRY || '7d', // 1 week token validity
    },
    cookie: {
      cookieName: 'accessToken',
      signed: false,
    },
  });

  // Register rate limiter plugin (global: false to apply only where configured)
  await fastify.register(rateLimit, {
    global: false,
  });

  // Register routes

  // Health check endpoint
  fastify.get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Bhatti-backend',
  }));

  // Register cold storage routes
  await fastify.register(coldStorageRoutes, {
    prefix: '/api/v1/cold-storage',
  });

  // Register store admin routes
  await fastify.register(storeAdminRoutes, {
    prefix: '/api/v1/store-admin',
  });

  // Register farmer storage link routes
  await fastify.register(farmerStorageLinkRoutes, {
    prefix: '/api/v1/farmer-storage-link',
  });

  // Register incoming gate pass routes
  await fastify.register(incomingGatePassRoutes, {
    prefix: '/api/v1/incoming-gate-pass',
  });

  // Register grading gate pass routes
  await fastify.register(gradingGatePassRoutes, {
    prefix: '/api/v1/grading-gate-pass',
  });

  // Register storage gate pass routes
  await fastify.register(storageGatePassRoutes, {
    prefix: '/api/v1/storage-gate-pass',
  });

  // Register nikasi gate pass routes
  await fastify.register(nikasiGatePassRoutes, {
    prefix: '/api/v1/nikasi-gate-pass',
  });

  // Register outgoing gate pass routes
  await fastify.register(outgoingGatePassRoutes, {
    prefix: '/api/v1/outgoing-gate-pass',
  });

  // Register transfer stock routes
  await fastify.register(transferStockRoutes, {
    prefix: '/api/v1/transfer-stock',
  });

  // Register analytics routes
  await fastify.register(analyticsRoutes, {
    prefix: '/api/v1/analytics',
  });

  // Register temperature routes
  await fastify.register(temperatureRoutes, {
    prefix: '/api/v1/temperature',
  });

  // Register dispatch ledger routes
  await fastify.register(dispatchLedgerRoutes, {
    prefix: '/api/v1/dispatch-ledger',
  });

  // Register booking routes
  await fastify.register(bookingRoutes, {
    prefix: '/api/v1/booking',
  });

  // Global error handler
  fastify.setErrorHandler((error: Error, _request, reply) => {
    // Handle our custom AppError (UnauthorizedError, NotFoundError, etc.) – ensure code and message are always sent
    if (error instanceof AppError) {
      fastify.log.error(
        { error, statusCode: error.statusCode, code: error.code },
        'Application error'
      );
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message ?? 'An error occurred',
        },
      });
    }

    // Handle other errors that have statusCode/code (e.g. from plugins) – use fallbacks so we never send empty error {}
    if (
      'statusCode' in error &&
      typeof (error as { statusCode?: number }).statusCode === 'number'
    ) {
      const err = error as {
        statusCode: number;
        code?: string;
        message?: string;
      };
      const statusCode = err.statusCode;
      const code = typeof err.code === 'string' ? err.code : 'ERROR';
      const message =
        typeof err.message === 'string' && err.message
          ? err.message
          : 'An error occurred';
      fastify.log.error({ error, statusCode, code }, 'Application error');
      return reply.code(statusCode).send({
        success: false,
        error: { code, message },
      });
    }

    // Handle JWT errors
    if (error.message?.includes('jwt') || error.message?.includes('token')) {
      fastify.log.warn({ error }, 'JWT authentication error');
      return reply.code(401).send({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication failed',
        },
      });
    }

    // Handle validation errors
    if (
      error.message?.includes('validation') ||
      error.message?.includes('schema')
    ) {
      fastify.log.warn({ error }, 'Validation error');
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      });
    }

    // Fallback for unexpected errors
    fastify.log.error({ error }, 'Unhandled error');
    return reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          process.env.NODE_ENV === 'development' && error.message
            ? error.message
            : 'An unexpected error occurred',
      },
    });
  });

  return fastify;
};
