import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createBooking,
  getBookingAuditsByColdStorage,
  getBookingSummary,
  getPaginatedBookingsByColdStorage,
  searchBookingsByNumber,
  updateBooking,
} from './booking.service.js';
import { getStorageSummary } from '../analytics/analytics.service.js';
import {
  createBookingSchema,
  CreateBookingInput,
  searchBookingSchema,
  SearchBookingInput,
  updateBookingSchema,
  UpdateBookingInput,
  UpdateBookingParams,
  GetBookingAuditsByColdStorageQuery,
} from './booking.schema.js';
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

export async function createBookingHandler(
  request: FastifyRequest<{ Body: CreateBookingInput }>,
  reply: FastifyReply
) {
  try {
    request.log.info(
      {
        bagSizesCount: request.body.bagSizes?.length ?? 0,
        date: request.body.date,
      },
      'Create booking request'
    );

    const body = createBookingSchema.parse(request.body);
    const coldStorageId = getColdStorageIdFromRequest(request);
    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const result = await createBooking(
      coldStorageId,
      body,
      request.log,
      storeAdminId
    );

    return reply.code(201).send({
      status: 'Success',
      message: 'Booking created successfully.',
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createBookingHandler'
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

export async function searchBookingHandler(
  request: FastifyRequest<{ Body: SearchBookingInput }>,
  reply: FastifyReply
) {
  try {
    const body = searchBookingSchema.parse(request.body);
    const coldStorageId = getColdStorageIdFromRequest(request);
    const result = await searchBookingsByNumber(
      coldStorageId,
      body.number,
      request.log
    );

    return reply.send({
      success: true,
      data: {
        bookings: result.bookings,
      },
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in searchBookingHandler'
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

    const statusCode = 500;
    return reply.code(statusCode).send({
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
}

/**
 * Handler for retrieving booking audit records for current cold storage.
 */
export async function getBookingAuditsByColdStorageHandler(
  request: FastifyRequest<{
    Querystring: GetBookingAuditsByColdStorageQuery;
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const limit = request.query.limit ?? 10;
    const page = request.query.page ?? 1;

    const result = await getBookingAuditsByColdStorage(
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
      'Error in getBookingAuditsByColdStorageHandler'
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

    const statusCode = 500;
    return reply.code(statusCode).send({
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
}

export async function getBookingsByColdStorageHandler(
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

    const result = await getPaginatedBookingsByColdStorage(
      coldStorageId,
      { limit, page, sortOrder, dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data: {
        bookings: result.bookings,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    request.log.error({ error }, 'Error in getBookingsByColdStorageHandler');

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

    const statusCode = 500;
    return reply.code(statusCode).send({
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
}

export async function getBookingSummaryHandler(
  request: FastifyRequest<{
    Querystring: { dateFrom?: string; dateTo?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const { dateFrom, dateTo } = request.query;
    const data = await getBookingSummary(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getBookingSummaryHandler'
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

export async function getBookingStorageSummaryHandler(
  request: FastifyRequest<{
    Querystring: { dateFrom?: string; dateTo?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);
    const { dateFrom, dateTo } = request.query;
    const data = await getStorageSummary(
      coldStorageId,
      {
        dateFrom,
        dateTo,
        excludeStorageCategories: ['RENTAL'],
      },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getBookingStorageSummaryHandler'
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

export async function updateBookingHandler(
  request: FastifyRequest<{
    Params: UpdateBookingParams;
    Body: UpdateBookingInput;
  }>,
  reply: FastifyReply
) {
  try {
    const parsed = updateBookingSchema.safeParse({
      params: request.params,
      body: request.body,
    });

    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => issue.message).join(', '),
        'VALIDATION_ERROR'
      );
    }

    const coldStorageId = getColdStorageIdFromRequest(request);
    const editedById = (request as AuthenticatedRequest).user?.id;
    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.toString() ||
      request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];

    const booking = await updateBooking(
      parsed.data.params.id,
      coldStorageId,
      parsed.data.body,
      request.log,
      editedById,
      {
        ipAddress,
        userAgent,
      }
    );

    return reply.send({
      success: true,
      data: booking,
      message: 'Booking updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateBookingHandler'
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

    if (error instanceof NotFoundError) {
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

    const statusCode = 500;
    return reply.code(statusCode).send({
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
}
