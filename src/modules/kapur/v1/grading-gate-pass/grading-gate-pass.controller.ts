import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createGradingGatePass,
  getGradingGatePassesByColdStorage,
  getGradingGatePassReport,
  getGradingGatePassById,
  searchGradingGatePassesByNumber,
  linkIncomingGatePassToGradingGatePass,
  delinkIncomingGatePassFromGradingGatePass,
  updateGradingGatePass,
  getGradingGatePassAuditsByColdStorage,
} from './grading-gate-pass.service.js';
import {
  CreateGradingGatePassInput,
  SearchGradingGatePassInput,
  LinkDelinkIncomingGatePassParams,
  LinkDelinkIncomingGatePassBody,
  GetGradingGatePassByIdParams,
  GetGradingGatePassReportQuery,
  UpdateGradingGatePassParams,
  UpdateGradingGatePassInput,
  GetGradingGatePassAuditsByColdStorageQuery,
} from './grading-gate-pass.schema.js';
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

  return coldStorageId as string;
}

function sendGradingGatePassError(
  reply: FastifyReply,
  error: unknown
): FastifyReply {
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

  if (error instanceof NotFoundError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }

  if (error instanceof ConflictError) {
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

/**
 * Handler for creating a new grading gate pass
 */
export async function createGradingGatePassHandler(
  request: FastifyRequest<{ Body: CreateGradingGatePassInput }>,
  reply: FastifyReply
) {
  try {
    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const gradingGatePass = await createGradingGatePass(
      request.body,
      request.log,
      storeAdminId
    );

    return reply.code(201).send({
      success: true,
      data: gradingGatePass,
      message: 'Grading gate pass created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createGradingGatePassHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for searching grading gate passes by gate pass number or manual gate pass number.
 */
export async function searchGradingGatePassHandler(
  request: FastifyRequest<{ Body: SearchGradingGatePassInput }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const result = await searchGradingGatePassesByNumber(
      coldStorageId,
      request.body.number,
      request.log
    );

    return reply.send({
      success: true,
      data: {
        gradingGatePasses: result.gradingGatePasses,
      },
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in searchGradingGatePassHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for retrieving grading gate passes for the authenticated user's cold storage.
 * Supports pagination (limit, page) and sortOrder (asc | desc).
 */
export async function getGradingGatePassesByColdStorageHandler(
  request: FastifyRequest<{
    Querystring: {
      limit?: number;
      page?: number;
      sortOrder?: 'asc' | 'desc';
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

    const result = await getGradingGatePassesByColdStorage(
      coldStorageId,
      { limit, page, sortOrder },
      request.log
    );

    return reply.send({
      success: true,
      data: {
        gradingGatePasses: result.gradingGatePasses,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    request.log.error(
      { error },
      'Error in getGradingGatePassesByColdStorageHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for retrieving all grading gate passes for report export (no pagination).
 * Supports optional dateFrom and dateTo filters (inclusive date range).
 */
export async function getGradingGatePassReportHandler(
  request: FastifyRequest<{
    Querystring: GetGradingGatePassReportQuery;
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const { dateFrom, dateTo } = request.query;

    const result = await getGradingGatePassReport(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data: {
        gradingGatePasses: result.gradingGatePasses,
      },
    });
  } catch (error) {
    request.log.error({ error }, 'Error in getGradingGatePassReportHandler');
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for retrieving a single grading gate pass by ID.
 */
export async function getGradingGatePassByIdHandler(
  request: FastifyRequest<{ Params: GetGradingGatePassByIdParams }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const gradingGatePass = await getGradingGatePassById(
      request.params.gradingGatePassId,
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: gradingGatePass,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getGradingGatePassByIdHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for updating a grading gate pass (allowed fields only).
 */
export async function updateGradingGatePassHandler(
  request: FastifyRequest<{
    Params: UpdateGradingGatePassParams;
    Body: UpdateGradingGatePassInput;
  }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId = getColdStorageIdFromRequest(request);
    const editedById = req.user?.id;

    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.toString() ||
      request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];

    const gradingGatePass = await updateGradingGatePass(
      request.params.gradingGatePassId,
      coldStorageId,
      request.body,
      request.log,
      editedById,
      { ipAddress, userAgent }
    );

    return reply.send({
      success: true,
      data: gradingGatePass,
      message: 'Grading gate pass updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateGradingGatePassHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for retrieving grading gate pass audit records for current cold storage.
 */
export async function getGradingGatePassAuditsByColdStorageHandler(
  request: FastifyRequest<{
    Querystring: GetGradingGatePassAuditsByColdStorageQuery;
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const limit = request.query.limit ?? 10;
    const page = request.query.page ?? 1;

    const result = await getGradingGatePassAuditsByColdStorage(
      coldStorageId,
      { limit, page },
      request.log
    );

    return reply.send({
      success: true,
      data: {
        audits: result.audits,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getGradingGatePassAuditsByColdStorageHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for linking an incoming gate pass to a grading gate pass.
 */
export async function linkIncomingGatePassHandler(
  request: FastifyRequest<{
    Params: LinkDelinkIncomingGatePassParams;
    Body: LinkDelinkIncomingGatePassBody;
  }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId = getColdStorageIdFromRequest(request);
    const editedById = req.user?.id;

    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.toString() ||
      request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];

    const gradingGatePass = await linkIncomingGatePassToGradingGatePass(
      request.params.gradingGatePassId,
      request.body.incomingGatePassId,
      coldStorageId,
      request.log,
      editedById,
      { ipAddress, userAgent }
    );

    return reply.send({
      success: true,
      data: gradingGatePass,
      message: 'Incoming gate pass linked successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in linkIncomingGatePassHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}

/**
 * Handler for delinking an incoming gate pass from a grading gate pass.
 */
export async function delinkIncomingGatePassHandler(
  request: FastifyRequest<{
    Params: LinkDelinkIncomingGatePassParams;
    Body: LinkDelinkIncomingGatePassBody;
  }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId = getColdStorageIdFromRequest(request);
    const editedById = req.user?.id;

    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.toString() ||
      request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];

    const gradingGatePass = await delinkIncomingGatePassFromGradingGatePass(
      request.params.gradingGatePassId,
      request.body.incomingGatePassId,
      coldStorageId,
      request.log,
      editedById,
      { ipAddress, userAgent }
    );

    return reply.send({
      success: true,
      data: gradingGatePass,
      message: 'Incoming gate pass delinked successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in delinkIncomingGatePassHandler'
    );
    return sendGradingGatePassError(reply, error);
  }
}
