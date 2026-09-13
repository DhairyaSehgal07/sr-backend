import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createStoreAdmin,
  getStoreAdminById,
  updateStoreAdmin,
  deleteStoreAdmin,
  checkMobileNumber,
  getDaybook,
  loginStoreAdmin,
  logoutStoreAdmin,
  getNextVoucherNumber,
} from './store-admin.service.js';
import {
  CreateStoreAdminInput,
  GetStoreAdminByIdParams,
  UpdateStoreAdminInput,
  UpdateStoreAdminParams,
  DeleteStoreAdminParams,
  CheckMobileNumberQuery,
  LoginStoreAdminInput,
  GetVoucherNumberQuery,
  GetDaybookQuery,
} from './store-admin.schema.js';
import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
} from '../../../../utils/errors.js';
import type { AuthenticatedRequest } from '../../../../utils/auth.js';

/**
 * Handler for creating a new store admin
 */
export async function createStoreAdminHandler(
  request: FastifyRequest<{ Body: CreateStoreAdminInput }>,
  reply: FastifyReply
) {
  try {
    const storeAdmin = await createStoreAdmin(request.body, request.log);

    return reply.code(201).send({
      success: true,
      data: storeAdmin,
      message: 'Store admin created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createStoreAdminHandler'
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

    // Fallback for unexpected errors
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
 * Handler for retrieving a store admin by ID
 */
export async function getStoreAdminByIdHandler(
  request: FastifyRequest<{ Params: GetStoreAdminByIdParams }>,
  reply: FastifyReply
) {
  try {
    const storeAdmin = await getStoreAdminById(request.params.id, request.log);

    return reply.send({
      success: true,
      data: storeAdmin,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getStoreAdminByIdHandler'
    );

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

    // Fallback for unexpected errors
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
 * Handler for retrieving the storage + outgoing daybook ledger for the authenticated cold storage.
 */
export async function getDaybookHandler(
  request: FastifyRequest<{ Querystring: GetDaybookQuery }>,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user.coldStorageId === 'object' &&
      req.user.coldStorageId !== null &&
      '_id' in req.user.coldStorageId
        ? req.user.coldStorageId._id
        : (req.user.coldStorageId as string);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'MISSING_COLD_STORAGE',
          message: 'Cold storage not found in token',
        },
      });
    }

    const { type, sortBy, limit, page } = request.query;

    const result = await getDaybook(
      coldStorageId,
      { type, sortBy, limit, page },
      request.log
    );

    return reply.send({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    request.log.error({ error }, 'Error in getDaybookHandler');

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

    // Fallback for unexpected errors
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
 * Handler for updating a store admin
 */
export async function updateStoreAdminHandler(
  request: FastifyRequest<{
    Params: UpdateStoreAdminParams;
    Body: UpdateStoreAdminInput;
  }>,
  reply: FastifyReply
) {
  try {
    const storeAdmin = await updateStoreAdmin(
      request.params.id,
      request.body,
      request.log
    );

    return reply.send({
      success: true,
      data: storeAdmin,
      message: 'Store admin updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateStoreAdminHandler'
    );

    if (error instanceof NotFoundError) {
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

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // Fallback for unexpected errors
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
 * Handler for deleting a store admin
 */
export async function deleteStoreAdminHandler(
  request: FastifyRequest<{ Params: DeleteStoreAdminParams }>,
  reply: FastifyReply
) {
  try {
    const storeAdmin = await deleteStoreAdmin(request.params.id, request.log);

    return reply.send({
      success: true,
      data: storeAdmin,
      message: 'Store admin deleted successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in deleteStoreAdminHandler'
    );

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

    // Fallback for unexpected errors
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
 * Handler for checking if mobile number is available
 */
export async function checkMobileNumberHandler(
  request: FastifyRequest<{ Querystring: CheckMobileNumberQuery }>,
  reply: FastifyReply
) {
  try {
    await checkMobileNumber(request.query.mobileNumber, request.log);

    return reply.send({
      success: true,
      data: { available: true },
      message: 'Mobile number is available',
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in checkMobileNumberHandler'
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

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // Fallback for unexpected errors
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
 * Standard error payload sent to client for all login error responses.
 * Ensures client always receives a consistent JSON shape (avoids "Network Error" from malformed responses).
 */
function sendLoginError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string
) {
  return reply.code(statusCode).send({
    success: false,
    error: { code, message },
  });
}

/**
 * Handler for store admin login.
 * Ensures every path returns proper JSON so the client never sees "Network Error" from missing/malformed responses.
 */
export async function loginStoreAdminHandler(
  request: FastifyRequest<{ Body: LoginStoreAdminInput }>,
  reply: FastifyReply
) {
  try {
    // Validate body early so we always return JSON (client often sees "Network Error" when body is missing/wrong)
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return sendLoginError(
        reply,
        400,
        'BAD_REQUEST',
        'Request body is required and must be a JSON object with mobileNumber and password'
      );
    }
    const { mobileNumber, password } = body as Record<string, unknown>;
    if (typeof mobileNumber !== 'string' || !mobileNumber.trim()) {
      return sendLoginError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Mobile number is required and must be a non-empty string'
      );
    }
    if (typeof password !== 'string' || !password) {
      return sendLoginError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Password is required'
      );
    }

    const result = await loginStoreAdmin(
      { mobileNumber: mobileNumber.trim(), password },
      request.log
    );

    const { storeAdmin } = result;
    const payload = {
      id: storeAdmin._id,
      mobileNumber: storeAdmin.mobileNumber,
      role: storeAdmin.role,
      coldStorageId: storeAdmin.coldStorageId._id,
    };

    // Generate JWT token (1 week validity)
    const token = request.server.jwt.sign(payload, {
      expiresIn: process.env.JWT_TOKEN_EXPIRY || '7d',
    });

    return reply.send({
      success: true,
      data: {
        ...storeAdmin,
        token,
      },
      message: 'Login successful',
    });
  } catch (error) {
    request.log.error(
      { err: error, body: request.body },
      'Error in loginStoreAdminHandler'
    );

    // Known app errors – always return consistent JSON
    if (error instanceof UnauthorizedError) {
      return sendLoginError(reply, error.statusCode, error.code, error.message);
    }

    if (error instanceof AppError) {
      return sendLoginError(reply, error.statusCode, error.code, error.message);
    }

    // ValidationError extends AppError but handle explicitly for clarity
    if (error instanceof ValidationError) {
      return sendLoginError(reply, 400, error.code, error.message);
    }

    // Non-Error throws (e.g. string or object) – still send valid JSON
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'An unexpected error occurred';
    const safeMessage =
      process.env.NODE_ENV === 'development'
        ? message
        : 'An unexpected error occurred';

    return sendLoginError(reply, 500, 'INTERNAL_SERVER_ERROR', safeMessage);
  }
}

/**
 * Handler for store admin logout
 */
export async function logoutStoreAdminHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await logoutStoreAdmin(request.log);

    return reply.send({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    request.log.error({ error }, 'Error in logoutStoreAdminHandler');

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // Fallback for unexpected errors
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
 * Handler for getting the next voucher number for a given voucher type.
 * Uses cold storage ID from the authenticated user.
 */
export async function getNextVoucherNumberHandler(
  request: FastifyRequest<{ Querystring: GetVoucherNumberQuery }>,
  reply: FastifyReply
) {
  try {
    const authenticatedRequest = request as AuthenticatedRequest;
    const user = authenticatedRequest.user;

    const coldStorageId =
      typeof user.coldStorageId === 'string'
        ? user.coldStorageId
        : user.coldStorageId?._id;

    if (!coldStorageId) {
      throw new UnauthorizedError(
        'Cold storage context is required for voucher number',
        'MISSING_COLD_STORAGE'
      );
    }

    const nextVoucherNumber = await getNextVoucherNumber(
      coldStorageId,
      request.query.type,
      request.log
    );

    return reply.code(200).send({
      success: true,
      data: {
        type: request.query.type,
        nextVoucherNumber,
      },
      message: `Next voucher number for ${request.query.type}`,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getNextVoucherNumberHandler'
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
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : 'An unexpected error occurred'
            : 'An unexpected error occurred',
      },
    });
  }
}
