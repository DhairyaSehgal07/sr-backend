import { FastifyReply, FastifyRequest } from 'fastify';
import {
  getFarmerStorageLinksByColdStorage,
  getGatePassesForFarmerStorageLink,
  quickRegisterFarmer,
  updateFarmerStorageLink,
} from './farmer-storage-link.service.js';
import {
  QuickRegisterFarmerInput,
  UpdateFarmerStorageLinkInput,
  UpdateFarmerStorageLinkParams,
} from './farmer-storage-link.schema.js';
import {
  AppError,
  NotFoundError,
  ConflictError,
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

/**
 * Handler for retrieving farmer-storage-links for the authenticated user's cold storage
 */
export async function getFarmerStorageLinksByColdStorageHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'MISSING_COLD_STORAGE',
          message: 'Cold storage not found in token',
        },
      });
    }

    const links = await getFarmerStorageLinksByColdStorage(
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: links,
    });
  } catch (error) {
    request.log.error(
      { error },
      'Error in getFarmerStorageLinksByColdStorageHandler'
    );

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
 * Handler for retrieving all incoming, grading, and storage gate passes for a farmer-storage-link
 */
export async function getGatePassesHandler(
  request: FastifyRequest<{ Params: { farmerStorageLinkId: string } }>,
  reply: FastifyReply
) {
  try {
    const coldStorageId = getColdStorageIdFromRequest(request);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'MISSING_COLD_STORAGE',
          message: 'Cold storage not found in token',
        },
      });
    }

    const { farmerStorageLinkId } = request.params;

    const result = await getGatePassesForFarmerStorageLink(
      farmerStorageLinkId,
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: result,
    });
  } catch (error) {
    request.log.error({ error }, 'Error in getGatePassesHandler');

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
}

/**
 * Handler for quick registering a farmer
 */
export async function quickRegisterFarmerHandler(
  request: FastifyRequest<{ Body: QuickRegisterFarmerInput }>,
  reply: FastifyReply
) {
  try {
    const result = await quickRegisterFarmer(request.body, request.log);

    return reply.code(201).send({
      success: true,
      data: result,
      message: 'Farmer registered successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in quickRegisterFarmerHandler'
    );

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
}

/**
 * Handler for updating a farmer-storage-link
 */
export async function updateFarmerStorageLinkHandler(
  request: FastifyRequest<{
    Params: UpdateFarmerStorageLinkParams;
    Body: UpdateFarmerStorageLinkInput;
  }>,
  reply: FastifyReply
) {
  try {
    const result = await updateFarmerStorageLink(
      request.params.id,
      request.body,
      request.log
    );

    return reply.send({
      success: true,
      data: result,
      message: 'Farmer-storage-link updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateFarmerStorageLinkHandler'
    );

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
}
