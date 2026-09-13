import { FastifyReply, FastifyRequest } from 'fastify';
import {
  getAnalyticsMessage,
  getOverview,
  getVarietyDistribution,
  getDailyMonthlyTrend,
  getSizeDistributionFromGrading,
  getAreaWiseSizeDistributionFromGrading,
  getFarmersStockByArea,
  getGradingDailyMonthlyTrend,
  getStorageSummary,
  getStorageGatePassReport,
  getStorageDailyMonthlyTrend,
} from './analytics.service.js';
import { AuthenticatedRequest } from '../../../../utils/auth.js';
import {
  UnauthorizedError,
  ValidationError,
  AppError,
} from '../../../../utils/errors.js';

/**
 * Handler for GET /analytics – returns analytics placeholder message
 */
export async function getAnalyticsHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const message = getAnalyticsMessage();
  return reply.send({ message });
}

export interface OverviewQuerystring {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Handler for GET /analytics/overview – returns overview aggregates with optional date filters
 */
export async function getOverviewHandler(
  request: FastifyRequest<{ Querystring: OverviewQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    // Use only the logged-in user's cold storage from JWT – never from query/body
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getOverview(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getOverviewHandler'
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

export interface IncomingAnalyticsQuerystring {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Handler for GET /analytics/incoming/variety-distribution – variety distribution chart data from incoming gate passes
 */
export async function getVarietyDistributionHandler(
  request: FastifyRequest<{ Querystring: IncomingAnalyticsQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getVarietyDistribution(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getVarietyDistributionHandler'
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

/**
 * Handler for GET /analytics/incoming/daily-monthly-trend – daily and monthly trend chart data from incoming gate passes
 */
export async function getDailyMonthlyTrendHandler(
  request: FastifyRequest<{ Querystring: IncomingAnalyticsQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getDailyMonthlyTrend(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({
      success: true,
      data,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getDailyMonthlyTrendHandler'
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

export interface GradingAnalyticsQuerystring {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Handler for GET /analytics/size-distribution – size distribution from grading gate passes by variety
 */
export async function getSizeDistributionFromGradingHandler(
  request: FastifyRequest<{ Querystring: GradingAnalyticsQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getSizeDistributionFromGrading(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getSizeDistributionFromGradingHandler'
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

/**
 * Handler for GET /analytics/area-wise-size-distribution – area-wise size distribution from grading by variety
 */
export async function getAreaWiseSizeDistributionFromGradingHandler(
  request: FastifyRequest<{ Querystring: GradingAnalyticsQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getAreaWiseSizeDistributionFromGrading(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getAreaWiseSizeDistributionFromGradingHandler'
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

/**
 * Handler for GET /analytics/grading-daily-monthly-trend – daily and monthly trend chart data from grading gate passes, grouped by grader
 */
export async function getGradingDailyMonthlyTrendHandler(
  request: FastifyRequest<{ Querystring: GradingAnalyticsQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getGradingDailyMonthlyTrend(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getGradingDailyMonthlyTrendHandler'
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

export interface FarmersStockByAreaQuerystring {
  area: string;
}

/**
 * Handler for GET /analytics/farmers-stock-by-filters – farmers in area with varieties and sizes (stock)
 */
export async function getFarmersStockByAreaHandler(
  request: FastifyRequest<{ Querystring: FarmersStockByAreaQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { area } = request.query;
    const data = await getFarmersStockByArea(
      coldStorageId,
      area ?? '',
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getFarmersStockByAreaHandler'
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

/* =======================
   STORAGE ANALYTICS HANDLERS
======================= */

export interface StorageAnalyticsQuerystring {
  dateFrom?: string;
  dateTo?: string;
  variety?: string;
  groupByFarmer?: boolean;
  groupByVariety?: boolean;
}

/**
 * Handler for GET /analytics/storage-summary – per-variety storage summary with size and bag-type breakdown
 */
export async function getStorageSummaryHandler(
  request: FastifyRequest<{
    Querystring: Pick<StorageAnalyticsQuerystring, 'dateFrom' | 'dateTo'>;
  }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getStorageSummary(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getStorageSummaryHandler'
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

/**
 * Handler for GET /analytics/storage-gate-pass-report – storage gate passes, optionally grouped by farmer/variety
 */
export async function getStorageGatePassReportHandler(
  request: FastifyRequest<{ Querystring: StorageAnalyticsQuerystring }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo, variety, groupByFarmer, groupByVariety } =
      request.query;
    const data = await getStorageGatePassReport(
      coldStorageId,
      { dateFrom, dateTo, variety, groupByFarmer, groupByVariety },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getStorageGatePassReportHandler'
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

/**
 * Handler for GET /analytics/storage-daily-monthly-trend – daily/monthly trend (storage) by variety
 */
export async function getStorageDailyMonthlyTrendHandler(
  request: FastifyRequest<{
    Querystring: Pick<StorageAnalyticsQuerystring, 'dateFrom' | 'dateTo'>;
  }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string | undefined);

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage not found in token',
        'MISSING_COLD_STORAGE'
      );
    }

    const { dateFrom, dateTo } = request.query;
    const data = await getStorageDailyMonthlyTrend(
      coldStorageId,
      { dateFrom, dateTo },
      request.log
    );

    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getStorageDailyMonthlyTrendHandler'
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
