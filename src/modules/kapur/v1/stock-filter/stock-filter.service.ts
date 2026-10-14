import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';
import { StockFilter } from './stock-filter.model.js';
import {
  CreateStockFilterInput,
  UpdateStockFilterInput,
} from './stock-filter.schema.js';

function validateObjectId(id: string, message: string, code: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(message, code);
  }
}

function isDuplicateKeyError(error: unknown): error is Error & {
  code: number;
} {
  return error instanceof Error && 'code' in error && error.code === 11000;
}

function coldStorageObjectId(coldStorageId: string) {
  return new mongoose.Types.ObjectId(coldStorageId);
}

export async function createStockFilter(
  coldStorageId: string,
  payload: CreateStockFilterInput,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const existing = await StockFilter.findOne({
      coldStorageId: coldStorageObjectId(coldStorageId),
      name: payload.name,
    }).lean();

    if (existing) {
      throw new ConflictError(
        'Stock filter already exists for this name',
        'STOCK_FILTER_EXISTS'
      );
    }

    const stockFilter = await StockFilter.create({
      coldStorageId: coldStorageObjectId(coldStorageId),
      name: payload.name,
    });

    logger?.info(
      { stockFilterId: stockFilter._id, coldStorageId, name: payload.name },
      'Stock filter created successfully'
    );

    return stockFilter.toObject();
  } catch (error) {
    if (error instanceof ConflictError || error instanceof ValidationError) {
      throw error;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(', '),
        'MONGOOSE_VALIDATION_ERROR'
      );
    }

    if (isDuplicateKeyError(error)) {
      throw new ConflictError(
        'Stock filter already exists for this name',
        'STOCK_FILTER_EXISTS'
      );
    }

    logger?.error(
      { error, coldStorageId, payload },
      'Unexpected error creating stock filter'
    );

    throw new AppError(
      'Failed to create stock filter',
      500,
      'CREATE_STOCK_FILTER_ERROR'
    );
  }
}

export async function getStockFiltersByColdStorage(
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const stockFilters = await StockFilter.find({
      coldStorageId: coldStorageObjectId(coldStorageId),
    })
      .sort({ name: 1 })
      .lean();

    logger?.info(
      { coldStorageId, count: stockFilters.length },
      'Retrieved stock filters by cold storage'
    );

    return stockFilters;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error({ error, coldStorageId }, 'Error retrieving stock filters');

    throw new AppError(
      'Failed to retrieve stock filters',
      500,
      'GET_STOCK_FILTER_ERROR'
    );
  }
}

export async function getStockFilterById(
  id: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid stock filter ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const stockFilter = await StockFilter.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: coldStorageObjectId(coldStorageId),
    }).lean();

    if (!stockFilter) {
      throw new NotFoundError(
        'Stock filter not found',
        'STOCK_FILTER_NOT_FOUND'
      );
    }

    logger?.info(
      { stockFilterId: id, coldStorageId },
      'Retrieved stock filter'
    );

    return stockFilter;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, id, coldStorageId },
      'Error retrieving stock filter'
    );

    throw new AppError(
      'Failed to retrieve stock filter',
      500,
      'GET_STOCK_FILTER_ERROR'
    );
  }
}

export async function updateStockFilter(
  id: string,
  coldStorageId: string,
  payload: UpdateStockFilterInput,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid stock filter ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const stockFilter = await StockFilter.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: coldStorageObjectId(coldStorageId),
    });

    if (!stockFilter) {
      throw new NotFoundError(
        'Stock filter not found',
        'STOCK_FILTER_NOT_FOUND'
      );
    }

    const existing = await StockFilter.findOne({
      _id: { $ne: stockFilter._id },
      coldStorageId: stockFilter.coldStorageId,
      name: payload.name,
    }).lean();

    if (existing) {
      throw new ConflictError(
        'Stock filter already exists for this name',
        'STOCK_FILTER_EXISTS'
      );
    }

    stockFilter.name = payload.name;
    await stockFilter.save();

    logger?.info(
      { stockFilterId: id, coldStorageId, name: payload.name },
      'Stock filter updated successfully'
    );

    return stockFilter.toObject();
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(', '),
        'MONGOOSE_VALIDATION_ERROR'
      );
    }

    if (isDuplicateKeyError(error)) {
      throw new ConflictError(
        'Stock filter already exists for this name',
        'STOCK_FILTER_EXISTS'
      );
    }

    logger?.error(
      { error, id, coldStorageId, payload },
      'Unexpected error updating stock filter'
    );

    throw new AppError(
      'Failed to update stock filter',
      500,
      'UPDATE_STOCK_FILTER_ERROR'
    );
  }
}

export async function deleteStockFilter(
  id: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid stock filter ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const stockFilter = await StockFilter.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: coldStorageObjectId(coldStorageId),
    }).lean();

    if (!stockFilter) {
      throw new NotFoundError(
        'Stock filter not found',
        'STOCK_FILTER_NOT_FOUND'
      );
    }

    logger?.info({ stockFilterId: id, coldStorageId }, 'Stock filter deleted');

    return stockFilter;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, id, coldStorageId },
      'Unexpected error deleting stock filter'
    );

    throw new AppError(
      'Failed to delete stock filter',
      500,
      'DELETE_STOCK_FILTER_ERROR'
    );
  }
}
