import { FastifyReply, FastifyRequest } from 'fastify';
import {
  getPreferencesByColdStorageId,
  updatePreferences,
} from './preferences.service.js';
import {
  GetPreferencesParams,
  UpdatePreferencesInput,
  UpdatePreferencesParams,
} from './preferences.schema.js';
import {
  AppError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';

export async function getPreferencesHandler(
  request: FastifyRequest<{ Params: GetPreferencesParams }>,
  reply: FastifyReply
) {
  try {
    const preferences = await getPreferencesByColdStorageId(
      request.params.id,
      request.log
    );
    return reply.send({
      success: true,
      data: preferences,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      'Error in getPreferencesHandler'
    );

    if (error instanceof NotFoundError || error instanceof ValidationError) {
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

export async function updatePreferencesHandler(
  request: FastifyRequest<{
    Params: UpdatePreferencesParams;
    Body: UpdatePreferencesInput;
  }>,
  reply: FastifyReply
) {
  try {
    const preferences = await updatePreferences(
      request.params.id,
      request.body,
      request.log
    );
    return reply.send({
      success: true,
      data: preferences,
      message: 'Preferences updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updatePreferencesHandler'
    );

    if (error instanceof NotFoundError || error instanceof ValidationError) {
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
