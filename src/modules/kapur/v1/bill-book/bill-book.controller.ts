import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createBillBook,
  getBillBookById,
  getBillBooksByColdStorage,
  updateBillBook,
} from './bill-book.service.js';
import {
  CreateBillBookInput,
  GetBillBookByIdParams,
  GetBillBookListQuery,
  UpdateBillBookInput,
  UpdateBillBookParams,
} from './bill-book.schema.js';
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

export async function createBillBookHandler(
  request: FastifyRequest<{ Body: CreateBillBookInput }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const billBook = await createBillBook(
      coldStorageId,
      request.body,
      request.log,
      storeAdminId
    );

    return reply.code(201).send({
      success: true,
      data: billBook,
      message: 'Bill book created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createBillBookHandler'
    );
    return sendError(reply, error);
  }
}

export async function getBillBooksByColdStorageHandler(
  request: FastifyRequest<{ Querystring: GetBillBookListQuery }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const billBooks = await getBillBooksByColdStorage(
      coldStorageId,
      request.query,
      request.log
    );

    return reply.send({
      success: true,
      data: billBooks,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getBillBooksByColdStorageHandler'
    );
    return sendError(reply, error);
  }
}

export async function getBillBookByIdHandler(
  request: FastifyRequest<{ Params: GetBillBookByIdParams }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const billBook = await getBillBookById(
      request.params.id,
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: billBook,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getBillBookByIdHandler'
    );
    return sendError(reply, error);
  }
}

export async function updateBillBookHandler(
  request: FastifyRequest<{
    Params: UpdateBillBookParams;
    Body: UpdateBillBookInput;
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return sendMissingColdStorage(reply);
    }

    const billBook = await updateBillBook(
      request.params.id,
      coldStorageId,
      request.body,
      request.log
    );

    return reply.send({
      success: true,
      data: billBook,
      message: 'Bill book updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateBillBookHandler'
    );
    return sendError(reply, error);
  }
}
