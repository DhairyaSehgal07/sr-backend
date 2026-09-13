import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createNikasiGatePass,
  getNikasiGatePassReport,
  getPaginatedNikasiGatePassesByColdStorage,
  searchNikasiGatePassesByNumber,
} from './nikasi-gate-pass.service.js';
import {
  createNikasiGatePassSchema,
  CreateNikasiGatePassInput,
  GetNikasiGatePassReportQuery,
  SearchNikasiGatePassInput,
} from './nikasi-gate-pass.schema.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
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

function sendNikasiGatePassError(reply: FastifyReply, error: unknown) {
  if (
    error instanceof UnauthorizedError ||
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
            : 'Unknown error'
          : 'Internal server error',
    },
  });
}

/**
 * Handler for creating a nikasi gate pass.
 */
export async function createNikasiGatePassHandler(
  request: FastifyRequest<{ Body: CreateNikasiGatePassInput }>,
  reply: FastifyReply
) {
  try {
    request.log.info(
      {
        bagSizeCount: request.body.bagSize?.length ?? 0,
        gatePassNo: request.body.gatePassNo,
        date: request.body.date,
        isBooked: request.body.isBooked ?? false,
      },
      'Create nikasi gate pass request'
    );

    const body = createNikasiGatePassSchema.parse(request.body);
    const coldStorageId = getColdStorageIdFromRequest(request);
    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const result = await createNikasiGatePass(
      coldStorageId,
      body,
      request.log,
      storeAdminId
    );

    return reply.code(201).send({
      status: 'Success',
      message: 'Nikasi gate pass created successfully.',
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createNikasiGatePassHandler'
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

/**
 * Handler for searching nikasi gate passes by gate pass, bill, or bilti numbers.
 */
export async function searchNikasiGatePassHandler(
  request: FastifyRequest<{ Body: SearchNikasiGatePassInput }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const result = await searchNikasiGatePassesByNumber(
      coldStorageId,
      request.body.number,
      request.log
    );

    return reply.send({
      success: true,
      data: {
        nikasiGatePasses: result.nikasiGatePasses,
      },
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in searchNikasiGatePassHandler'
    );
    return sendNikasiGatePassError(reply, error);
  }
}

/**
 * Handler for retrieving all nikasi gate passes for report export (no pagination).
 * Supports optional dateFrom and dateTo filters (inclusive date range).
 */
export async function getNikasiGatePassReportHandler(
  request: FastifyRequest<{
    Querystring: GetNikasiGatePassReportQuery;
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const { dateFrom, dateTo } = request.query;

    const result = await getNikasiGatePassReport(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data: {
        nikasiGatePasses: result.nikasiGatePasses,
      },
    });
  } catch (error) {
    request.log.error({ error }, 'Error in getNikasiGatePassReportHandler');
    return sendNikasiGatePassError(reply, error);
  }
}

/**
 * Handler for retrieving nikasi gate passes for the authenticated user's cold storage.
 */
export async function getNikasiGatePassesByColdStorageHandler(
  request: FastifyRequest<{
    Querystring: {
      limit?: number;
      page?: number;
      sortOrder?: 'asc' | 'desc';
      dateFrom?: string;
      dateTo?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const query = request.query;
    const limit = query.limit ?? 10;
    const page = query.page ?? 1;
    const sortOrder = query.sortOrder ?? 'desc';
    const dateFrom = query.dateFrom;
    const dateTo = query.dateTo;

    const result = await getPaginatedNikasiGatePassesByColdStorage(
      coldStorageId,
      { limit, page, sortOrder, dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data: {
        nikasiGatePasses: result.nikasiGatePasses,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    request.log.error(
      { error },
      'Error in getNikasiGatePassesByColdStorageHandler'
    );
    return sendNikasiGatePassError(reply, error);
  }
}
