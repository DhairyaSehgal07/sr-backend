import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';
import { DispatchLedger } from './dispatch-ledger.model.js';
import {
  CreateDispatchLedgerInput,
  GetDispatchLedgerListQuery,
  UpdateDispatchLedgerInput,
} from './dispatch-ledger.schema.js';

function validateObjectId(id: string, message: string, code: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(message, code);
  }
}

function isDuplicateKeyError(error: unknown): error is Error & {
  code: number;
  keyPattern?: Record<string, unknown>;
} {
  return error instanceof Error && 'code' in error && error.code === 11000;
}

export async function createDispatchLedger(
  coldStorageId: string,
  payload: CreateDispatchLedgerInput,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const existing = await DispatchLedger.findOne({
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
      name: payload.name,
      address: payload.address,
    }).lean();

    if (existing) {
      throw new ConflictError(
        'Dispatch ledger already exists for this cold storage',
        'DISPATCH_LEDGER_EXISTS'
      );
    }

    const dispatchLedger = await DispatchLedger.create({
      ...payload,
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    });

    logger?.info(
      { dispatchLedgerId: dispatchLedger._id, coldStorageId },
      'Dispatch ledger created successfully'
    );

    return dispatchLedger.toObject();
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
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
    }

    logger?.error(
      { error, coldStorageId, payload },
      'Unexpected error creating dispatch ledger'
    );

    throw new AppError(
      'Failed to create dispatch ledger',
      500,
      'CREATE_DISPATCH_LEDGER_ERROR'
    );
  }
}

export async function getDispatchLedgersByColdStorage(
  coldStorageId: string,
  query: GetDispatchLedgerListQuery,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const filter: Record<string, unknown> = {
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    };

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { address: { $regex: query.search, $options: 'i' } },
        { mobileNumber: { $regex: query.search, $options: 'i' } },
      ];
    }

    const dispatchLedgers = await DispatchLedger.find(filter)
      .sort({ name: 1, createdAt: -1 })
      .lean();

    logger?.info(
      { coldStorageId, count: dispatchLedgers.length },
      'Retrieved dispatch ledgers by cold storage'
    );

    return dispatchLedgers;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId, query },
      'Error retrieving dispatch ledgers'
    );

    throw new AppError(
      'Failed to retrieve dispatch ledgers',
      500,
      'GET_DISPATCH_LEDGERS_ERROR'
    );
  }
}

export async function getDispatchLedgerById(
  id: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid dispatch ledger ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const dispatchLedger = await DispatchLedger.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    }).lean();

    if (!dispatchLedger) {
      throw new NotFoundError(
        'Dispatch ledger not found',
        'DISPATCH_LEDGER_NOT_FOUND'
      );
    }

    logger?.info(
      { dispatchLedgerId: id, coldStorageId },
      'Retrieved dispatch ledger'
    );

    return dispatchLedger;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, id, coldStorageId },
      'Error retrieving dispatch ledger by ID'
    );

    throw new AppError(
      'Failed to retrieve dispatch ledger',
      500,
      'GET_DISPATCH_LEDGER_ERROR'
    );
  }
}

export async function updateDispatchLedger(
  id: string,
  coldStorageId: string,
  payload: UpdateDispatchLedgerInput,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid dispatch ledger ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const dispatchLedger = await DispatchLedger.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    });

    if (!dispatchLedger) {
      throw new NotFoundError(
        'Dispatch ledger not found',
        'DISPATCH_LEDGER_NOT_FOUND'
      );
    }

    const nextName = payload.name ?? dispatchLedger.name;
    const nextAddress = payload.address ?? dispatchLedger.address;

    const existing = await DispatchLedger.findOne({
      _id: { $ne: dispatchLedger._id },
      coldStorageId: dispatchLedger.coldStorageId,
      name: nextName,
      address: nextAddress,
    }).lean();

    if (existing) {
      throw new ConflictError(
        'Dispatch ledger already exists for this cold storage',
        'DISPATCH_LEDGER_EXISTS'
      );
    }

    if (payload.name !== undefined) {
      dispatchLedger.name = payload.name;
    }
    if (payload.address !== undefined) {
      dispatchLedger.address = payload.address;
    }
    if (payload.mobileNumber !== undefined) {
      dispatchLedger.mobileNumber = payload.mobileNumber;
    }

    await dispatchLedger.save();

    logger?.info(
      { dispatchLedgerId: id, coldStorageId, updates: payload },
      'Dispatch ledger updated successfully'
    );

    return dispatchLedger.toObject();
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
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
    }

    logger?.error(
      { error, id, coldStorageId, payload },
      'Unexpected error updating dispatch ledger'
    );

    throw new AppError(
      'Failed to update dispatch ledger',
      500,
      'UPDATE_DISPATCH_LEDGER_ERROR'
    );
  }
}
