import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createTransferStockGatePass,
  getTransferStockGatePassesByColdStorage,
  getTransferStockGatePassReport,
} from './transfer-stock.service.js';
import { getNextVoucherNumber } from '../store-admin/store-admin.service.js';
import {
  createTransferStockSchema,
  CreateTransferStockInput,
  getTransferStockGatePassesByColdStorageQuerySchema,
  GetTransferStockGatePassesByColdStorageQuery,
  getTransferStockReportSchema,
  GetTransferStockReportQuery,
} from './transfer-stock.schema.js';
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

export async function getTransferStockGatePassesByColdStorageHandler(
  request: FastifyRequest<{
    Querystring: GetTransferStockGatePassesByColdStorageQuery;
  }>,
  reply: FastifyReply
) {
  try {
    const query = getTransferStockGatePassesByColdStorageQuerySchema.parse({
      querystring: request.query,
    }).querystring;
    const coldStorageId = getColdStorageIdFromRequest(request);
    const result = await getTransferStockGatePassesByColdStorage(
      coldStorageId,
      query,
      request.log
    );

    return reply.send({
      success: true,
      data: {
        transferStockGatePasses: result.transferStockGatePasses,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getTransferStockGatePassesByColdStorageHandler'
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

    if (error instanceof NotFoundError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (error instanceof AppError) {
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
          process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      },
    });
  }
}

export async function getTransferStockReportHandler(
  request: FastifyRequest<{
    Querystring: GetTransferStockReportQuery;
  }>,
  reply: FastifyReply
) {
  try {
    const { dateFrom, dateTo } = getTransferStockReportSchema.parse({
      querystring: request.query,
    }).querystring;
    const coldStorageId = getColdStorageIdFromRequest(request);
    const result = await getTransferStockGatePassReport(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data: {
        columns: result.columns,
        transferStockGatePasses: result.transferStockGatePasses,
      },
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getTransferStockReportHandler'
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

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (error instanceof AppError) {
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
          process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      },
    });
  }
}

export async function createTransferStockHandler(
  request: FastifyRequest<{ Body: CreateTransferStockInput }>,
  reply: FastifyReply
) {
  try {
    request.log.info(
      {
        fromFarmerStorageLinkId: request.body.fromFarmerStorageLinkId,
        toFarmerStorageLinkId: request.body.toFarmerStorageLinkId,
        storageGatePassCount: request.body.storageGatePasses?.length ?? 0,
        date: request.body.date,
      },
      'Create transfer stock gate pass request'
    );

    const body = createTransferStockSchema.parse(request.body);
    const coldStorageId = getColdStorageIdFromRequest(request);
    const storeAdminId = (request as AuthenticatedRequest).user?.id;

    const [outgoingGatePassNo, destinationStorageGatePassNo] =
      await Promise.all([
        getNextVoucherNumber(coldStorageId, 'outgoing-gate-pass', request.log),
        getNextVoucherNumber(coldStorageId, 'storage-gate-pass', request.log),
      ]);

    const result = await createTransferStockGatePass(
      coldStorageId,
      {
        ...body,
        outgoingGatePassNo,
        destinationStorageGatePassNo,
      },
      request.log,
      storeAdminId
    );

    return reply.code(201).send({
      status: 'Success',
      message: 'Transfer stock gate pass created successfully.',
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createTransferStockHandler'
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
