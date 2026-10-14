import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  createStockFilter,
  deleteStockFilter,
  getStockFilterById,
  getStockFiltersByColdStorage,
  updateStockFilter,
} from './stock-filter.service.js';
import {
  createStockFilterSchema,
  deleteStockFilterSchema,
  getStockFilterByIdSchema,
  updateStockFilterSchema,
} from './stock-filter.schema.js';
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

export async function createStockFilterHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const body = createStockFilterSchema.parse({ body: request.body }).body;
    const stockFilter = await createStockFilter(
      coldStorageId,
      body,
      request.log
    );

    return reply.code(201).send({
      success: true,
      data: stockFilter,
      message: 'Stock filter created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createStockFilterHandler'
    );
    return sendError(reply, error);
  }
}

export async function getStockFiltersHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const stockFilters = await getStockFiltersByColdStorage(
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: stockFilters,
    });
  } catch (error) {
    request.log.error({ error }, 'Error in getStockFiltersHandler');
    return sendError(reply, error);
  }
}

export async function getStockFilterByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const params = getStockFilterByIdSchema.parse({
      params: request.params,
    }).params;
    const stockFilter = await getStockFilterById(
      params.id,
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: stockFilter,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getStockFilterByIdHandler'
    );
    return sendError(reply, error);
  }
}

export async function updateStockFilterHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const { params, body } = updateStockFilterSchema.parse({
      params: request.params,
      body: request.body,
    });
    const stockFilter = await updateStockFilter(
      params.id,
      coldStorageId,
      body,
      request.log
    );

    return reply.send({
      success: true,
      data: stockFilter,
      message: 'Stock filter updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateStockFilterHandler'
    );
    return sendError(reply, error);
  }
}

export async function deleteStockFilterHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const params = deleteStockFilterSchema.parse({
      params: request.params,
    }).params;
    await deleteStockFilter(params.id, coldStorageId, request.log);

    return reply.send({
      success: true,
      message: 'Stock filter deleted successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in deleteStockFilterHandler'
    );
    return sendError(reply, error);
  }
}
