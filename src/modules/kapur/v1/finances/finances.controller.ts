import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createFinanceRecovery,
  getFinanceOutstanding,
  getFinanceRecoveries,
  getFinanceSales,
  getFinanceSummary,
} from './finances.service.js';
import type {
  CreateFinanceRecoveryInput,
  GetFinanceListQuery,
} from './finances.schema.js';
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

export async function createFinanceRecoveryHandler(
  request: FastifyRequest<{ Body: CreateFinanceRecoveryInput }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const recovery = await createFinanceRecovery(
      coldStorageId,
      request.body,
      request.log,
      storeAdminId
    );

    return reply.code(201).send({
      success: true,
      data: recovery,
      message: 'Recovery recorded successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createFinanceRecoveryHandler'
    );
    return sendError(reply, error);
  }
}

export async function getFinanceSummaryHandler(
  request: FastifyRequest<{ Querystring: GetFinanceListQuery }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const summary = await getFinanceSummary(
      coldStorageId,
      request.query,
      request.log
    );

    return reply.send({
      success: true,
      data: summary,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getFinanceSummaryHandler'
    );
    return sendError(reply, error);
  }
}

export async function getFinanceSalesHandler(
  request: FastifyRequest<{ Querystring: GetFinanceListQuery }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const sales = await getFinanceSales(
      coldStorageId,
      request.query,
      request.log
    );

    return reply.send({
      success: true,
      data: sales,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getFinanceSalesHandler'
    );
    return sendError(reply, error);
  }
}

export async function getFinanceOutstandingHandler(
  request: FastifyRequest<{ Querystring: GetFinanceListQuery }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const outstanding = await getFinanceOutstanding(
      coldStorageId,
      request.query,
      request.log
    );

    return reply.send({
      success: true,
      data: outstanding,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getFinanceOutstandingHandler'
    );
    return sendError(reply, error);
  }
}

export async function getFinanceRecoveriesHandler(
  request: FastifyRequest<{ Querystring: GetFinanceListQuery }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const recoveries = await getFinanceRecoveries(
      coldStorageId,
      request.query,
      request.log
    );

    return reply.send({
      success: true,
      data: recoveries,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getFinanceRecoveriesHandler'
    );
    return sendError(reply, error);
  }
}
