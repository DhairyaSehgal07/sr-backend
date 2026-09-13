import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createOutgoingGatePass,
  cancelOutgoingGatePass,
  updateOutgoingGatePass,
  getOutgoingShedSummary,
} from './outgoing-gate-pass.service.js';
import {
  createOutgoingGatePassSchema,
  CreateOutgoingGatePassInput,
  cancelOutgoingGatePassBodySchema,
  CancelOutgoingGatePassParams,
  CancelOutgoingGatePassInput,
  updateOutgoingGatePassBodySchema,
  UpdateOutgoingGatePassParams,
  UpdateOutgoingGatePassInput,
} from './outgoing-gate-pass.schema.js';
import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
} from '../../../../utils/errors.js';
import { AuthenticatedRequest } from '../../../../utils/auth.js';

function getColdStorageIdFromRequest(request: FastifyRequest): string {
  const req = request as AuthenticatedRequest;
  const coldStorageId =
    typeof req.user.coldStorageId === 'object' &&
    req.user.coldStorageId !== null &&
    '_id' in req.user.coldStorageId
      ? req.user.coldStorageId._id
      : (req.user.coldStorageId as string);

  if (!coldStorageId) {
    throw new UnauthorizedError(
      'Cold storage not found in token',
      'MISSING_COLD_STORAGE'
    );
  }

  return coldStorageId;
}

export async function createOutgoingGatePassHandler(
  request: FastifyRequest<{ Body: CreateOutgoingGatePassInput }>,
  reply: FastifyReply
) {
  try {
    request.log.info(
      {
        storageGatePassCount: request.body.storageGatePasses?.length ?? 0,
        date: request.body.date,
      },
      'Create outgoing gate pass request'
    );

    const body = createOutgoingGatePassSchema.parse(request.body);
    const coldStorageId = getColdStorageIdFromRequest(request);
    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const result = await createOutgoingGatePass(
      coldStorageId,
      body,
      request.log,
      storeAdminId
    );

    return reply.code(201).send({
      status: 'Success',
      message: 'Outgoing gate pass created successfully.',
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createOutgoingGatePassHandler'
    );

    if (error instanceof UnauthorizedError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (error instanceof ConflictError) {
      return reply.code(error.statusCode).send({
        status: 'error',
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        status: 'error',
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof NotFoundError) {
      return reply.code(error.statusCode).send({
        status: 'error',
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        status: 'error',
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    const statusCode = 500;
    return reply.code(statusCode).send({
      status: 'error',
      statusCode,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
          : 'An unexpected error occurred',
    });
  }
}

export async function updateOutgoingGatePassHandler(
  request: FastifyRequest<{
    Params: UpdateOutgoingGatePassParams;
    Body: UpdateOutgoingGatePassInput;
  }>,
  reply: FastifyReply
) {
  try {
    request.log.info(
      { outgoingGatePassId: request.params.outgoingGatePassId },
      'Update outgoing gate pass request'
    );

    const body = updateOutgoingGatePassBodySchema.parse(request.body);
    const coldStorageId = getColdStorageIdFromRequest(request);
    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.toString() ||
      request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];

    const result = await updateOutgoingGatePass(
      coldStorageId,
      request.params.outgoingGatePassId,
      body,
      request.log,
      storeAdminId,
      { ipAddress, userAgent }
    );

    return reply.send({
      status: 'Success',
      message: 'Outgoing gate pass updated successfully.',
      data: result,
    });
  } catch (error) {
    request.log.error(
      {
        error,
        outgoingGatePassId: request.params.outgoingGatePassId,
        body: request.body,
      },
      'Error in updateOutgoingGatePassHandler'
    );

    if (error instanceof UnauthorizedError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof AppError
    ) {
      return reply.code(error.statusCode).send({
        status: 'error',
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    const statusCode = 500;
    return reply.code(statusCode).send({
      status: 'error',
      statusCode,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
          : 'An unexpected error occurred',
    });
  }
}

export async function cancelOutgoingGatePassHandler(
  request: FastifyRequest<{
    Params: CancelOutgoingGatePassParams;
    Body: CancelOutgoingGatePassInput;
  }>,
  reply: FastifyReply
) {
  try {
    request.log.info(
      { outgoingGatePassId: request.params.outgoingGatePassId },
      'Cancel outgoing gate pass request'
    );

    const body = cancelOutgoingGatePassBodySchema.parse(request.body);
    const coldStorageId = getColdStorageIdFromRequest(request);
    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const result = await cancelOutgoingGatePass(
      coldStorageId,
      request.params.outgoingGatePassId,
      body,
      request.log,
      storeAdminId
    );

    return reply.send({
      status: 'Success',
      message: 'Outgoing gate pass cancelled successfully.',
      data: result,
    });
  } catch (error) {
    request.log.error(
      {
        error,
        outgoingGatePassId: request.params.outgoingGatePassId,
        body: request.body,
      },
      'Error in cancelOutgoingGatePassHandler'
    );

    if (error instanceof UnauthorizedError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof AppError
    ) {
      return reply.code(error.statusCode).send({
        status: 'error',
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    const statusCode = 500;
    return reply.code(statusCode).send({
      status: 'error',
      statusCode,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
          : 'An unexpected error occurred',
    });
  }
}

export async function getOutgoingShedSummaryHandler(
  request: FastifyRequest<{
    Querystring: { dateFrom?: string; dateTo?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const { dateFrom, dateTo } = request.query;
    const data = await getOutgoingShedSummary(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getOutgoingShedSummaryHandler'
    );

    if (error instanceof UnauthorizedError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    throw error;
  }
}
