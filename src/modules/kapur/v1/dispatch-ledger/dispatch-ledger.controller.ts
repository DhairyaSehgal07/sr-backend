import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createDispatchLedger,
  getDispatchLedgerById,
  getDispatchLedgersByColdStorage,
  updateDispatchLedger,
} from './dispatch-ledger.service.js';
import {
  CreateDispatchLedgerInput,
  GetDispatchLedgerByIdParams,
  GetDispatchLedgerListQuery,
  UpdateDispatchLedgerInput,
  UpdateDispatchLedgerParams,
} from './dispatch-ledger.schema.js';
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

export async function createDispatchLedgerHandler(
  request: FastifyRequest<{ Body: CreateDispatchLedgerInput }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const dispatchLedger = await createDispatchLedger(
      coldStorageId,
      request.body,
      request.log
    );

    return reply.code(201).send({
      success: true,
      data: dispatchLedger,
      message: 'Dispatch ledger created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createDispatchLedgerHandler'
    );
    return sendError(reply, error);
  }
}

export async function getDispatchLedgersByColdStorageHandler(
  request: FastifyRequest<{ Querystring: GetDispatchLedgerListQuery }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const dispatchLedgers = await getDispatchLedgersByColdStorage(
      coldStorageId,
      request.query,
      request.log
    );

    return reply.send({
      success: true,
      data: dispatchLedgers,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getDispatchLedgersByColdStorageHandler'
    );
    return sendError(reply, error);
  }
}

export async function getDispatchLedgerByIdHandler(
  request: FastifyRequest<{ Params: GetDispatchLedgerByIdParams }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const dispatchLedger = await getDispatchLedgerById(
      request.params.id,
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: dispatchLedger,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getDispatchLedgerByIdHandler'
    );
    return sendError(reply, error);
  }
}

export async function updateDispatchLedgerHandler(
  request: FastifyRequest<{
    Params: UpdateDispatchLedgerParams;
    Body: UpdateDispatchLedgerInput;
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const dispatchLedger = await updateDispatchLedger(
      request.params.id,
      coldStorageId,
      request.body,
      request.log
    );

    return reply.send({
      success: true,
      data: dispatchLedger,
      message: 'Dispatch ledger updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateDispatchLedgerHandler'
    );
    return sendError(reply, error);
  }
}
