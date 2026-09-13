import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createTemperature,
  updateTemperature,
  getTemperaturesByColdStorage,
} from './temperature.service.js';
import {
  createTemperatureBodySchema,
  updateTemperatureParamsSchema,
  updateTemperatureBodySchema,
} from './temperature.schema.js';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../../../utils/errors.js';
import { AuthenticatedRequest } from '../../../../utils/auth.js';

function getColdStorageIdFromUser(req: AuthenticatedRequest): string {
  const coldStorageId = req.user?.coldStorageId;
  if (!coldStorageId) {
    throw new AppError(
      'Cold storage context is required',
      400,
      'COLD_STORAGE_REQUIRED'
    );
  }
  return typeof coldStorageId === 'object' &&
    coldStorageId !== null &&
    '_id' in coldStorageId
    ? coldStorageId._id
    : (coldStorageId as string);
}

export async function getTemperaturesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId = getColdStorageIdFromUser(req);

    const temperatures = await getTemperaturesByColdStorage(
      coldStorageId,
      request.log
    );

    return reply.send({
      success: true,
      data: temperatures,
      message: 'Temperature records retrieved successfully',
    });
  } catch (error) {
    request.log.error({ error }, 'Error in getTemperaturesHandler');

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

export async function createTemperatureHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const parsed = createTemperatureBodySchema.safeParse({
      body: request.body,
    });
    if (!parsed.success) {
      const first =
        parsed.error.flatten().fieldErrors?.body?.[0] ?? parsed.error.message;
      throw new ValidationError(
        typeof first === 'string' ? first : 'Validation failed',
        'VALIDATION_ERROR'
      );
    }
    const body = parsed.data.body;

    const req = request as AuthenticatedRequest;
    const coldStorageId = getColdStorageIdFromUser(req);

    const temperature = await createTemperature(
      coldStorageId,
      body,
      request.log
    );

    return reply.code(201).send({
      success: true,
      data: temperature,
      message: 'Temperature record created successfully',
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      'Error in createTemperatureHandler'
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

export async function updateTemperatureHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const paramsParsed = updateTemperatureParamsSchema.safeParse({
      params: request.params,
    });
    if (!paramsParsed.success) {
      const first =
        paramsParsed.error.flatten().fieldErrors?.params?.[0] ??
        paramsParsed.error.message;
      throw new ValidationError(
        typeof first === 'string' ? first : 'Invalid parameters',
        'VALIDATION_ERROR'
      );
    }

    const bodyParsed = updateTemperatureBodySchema.safeParse({
      body: request.body,
    });
    if (!bodyParsed.success) {
      const first =
        bodyParsed.error.flatten().fieldErrors?.body?.[0] ??
        bodyParsed.error.message;
      throw new ValidationError(
        typeof first === 'string' ? first : 'Validation failed',
        'VALIDATION_ERROR'
      );
    }
    const body = bodyParsed.data.body;

    const req = request as AuthenticatedRequest;
    const coldStorageId = getColdStorageIdFromUser(req);

    const temperature = await updateTemperature(
      paramsParsed.data.params.id,
      coldStorageId,
      body,
      request.log
    );

    return reply.send({
      success: true,
      data: temperature,
      message: 'Temperature record updated successfully',
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      'Error in updateTemperatureHandler'
    );

    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ForbiddenError
    ) {
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
