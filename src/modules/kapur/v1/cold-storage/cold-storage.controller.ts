import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createColdStorage,
  getColdStorages,
  getColdStorageById,
} from './cold-storage.service.js';
import {
  CreateColdStorageInput,
  GetColdStoragesQuery,
  GetColdStorageByIdParams,
} from './cold-storage.schema.js';
import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../../utils/errors.js';

/**
 * Handler for creating a new cold storage
 */
export async function createColdStorageHandler(
  request: FastifyRequest<{ Body: CreateColdStorageInput }>,
  reply: FastifyReply
) {
  try {
    const coldStorage = await createColdStorage(request.body, request.log);

    return reply.code(201).send({
      success: true,
      data: coldStorage,
      message: 'Cold storage created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createColdStorageHandler'
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
 * Handler for retrieving a list of cold storages with pagination
 */
export async function getColdStoragesHandler(
  request: FastifyRequest<{ Querystring: GetColdStoragesQuery }>,
  reply: FastifyReply
) {
  try {
    const result = await getColdStorages(request.query, request.log);

    return reply.send({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      'Error in getColdStoragesHandler'
    );

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
 * Handler for retrieving a cold storage by ID
 */
export async function getColdStorageByIdHandler(
  request: FastifyRequest<{ Params: GetColdStorageByIdParams }>,
  reply: FastifyReply
) {
  try {
    const coldStorage = await getColdStorageById(
      request.params.id,
      request.log
    );

    return reply.send({
      success: true,
      data: coldStorage,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getColdStorageByIdHandler'
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
