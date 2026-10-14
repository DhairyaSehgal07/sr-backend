import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  createColdStoreStock,
  deleteColdStoreStock,
  getColdStoreStockById,
  getColdStoreStocksByColdStorage,
  updateColdStoreStock,
} from './cold-store-stock.service.js';
import {
  createColdStoreStockSchema,
  deleteColdStoreStockSchema,
  getColdStoreStockByIdSchema,
  getColdStoreStockListSchema,
  updateColdStoreStockSchema,
} from './cold-store-stock.schema.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';
import type { AuthenticatedRequest } from '../../../../utils/auth.js';

function getColdStorageIdFromRequest(request: FastifyRequest): string | null {
  const req = request as AuthenticatedRequest;
  const coldStorageId =
    typeof req.user.coldStorageId === 'object' &&
    req.user.coldStorageId !== null &&
    '_id' in req.user.coldStorageId
      ? req.user.coldStorageId._id
      : (req.user.coldStorageId as string);

  return coldStorageId || null;
}

function sendMissingColdStorage(reply: FastifyReply) {
  return reply.code(401).send({
    success: false,
    error: {
      code: 'MISSING_COLD_STORAGE',
      message: 'Cold storage not found in token',
    },
  });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues.map((issue) => issue.message).join(', '),
      },
    });
  }

  if (
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof ValidationError ||
    error instanceof AppError
  ) {
    return reply.code(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  return reply.code(500).send({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
          : 'An unexpected error occurred',
    },
  });
}

export async function createColdStoreStockHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const body = createColdStoreStockSchema.parse({ body: request.body }).body;
    const stock = await createColdStoreStock(coldStorageId, body, request.log);

    return reply.code(201).send({
      success: true,
      data: stock,
      message: 'Cold store stock created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createColdStoreStockHandler'
    );
    return sendError(reply, error);
  }
}

export async function getColdStoreStocksHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const query = getColdStoreStockListSchema.parse({
      querystring: request.query,
    }).querystring;
    const stocks = await getColdStoreStocksByColdStorage(
      coldStorageId,
      query,
      request.log
    );

    return reply.send({
      success: true,
      data: stocks,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getColdStoreStocksHandler'
    );
    return sendError(reply, error);
  }
}

export async function getColdStoreStockByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const params = getColdStoreStockByIdSchema.parse({
      params: request.params,
    }).params;
    const stock = await getColdStoreStockById(
      params.id,
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: stock,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getColdStoreStockByIdHandler'
    );
    return sendError(reply, error);
  }
}

export async function updateColdStoreStockHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const { params, body } = updateColdStoreStockSchema.parse({
      params: request.params,
      body: request.body,
    });
    const stock = await updateColdStoreStock(
      params.id,
      coldStorageId,
      body,
      request.log
    );

    return reply.send({
      success: true,
      data: stock,
      message: 'Cold store stock updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateColdStoreStockHandler'
    );
    return sendError(reply, error);
  }
}

export async function deleteColdStoreStockHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const params = deleteColdStoreStockSchema.parse({
      params: request.params,
    }).params;
    await deleteColdStoreStock(params.id, coldStorageId, request.log);

    return reply.send({
      success: true,
      message: 'Cold store stock deleted successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in deleteColdStoreStockHandler'
    );
    return sendError(reply, error);
  }
}
