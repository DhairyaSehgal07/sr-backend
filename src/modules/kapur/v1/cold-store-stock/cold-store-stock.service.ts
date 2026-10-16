import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';
import { ColdStoreStock } from './cold-store-stock.model.js';
import {
  CreateColdStoreStockInput,
  GetColdStoreStockListQuery,
  UpdateColdStoreStockInput,
} from './cold-store-stock.schema.js';

export interface DispatchStockLine {
  variety: string;
  size: string;
  quantityIssued: number;
}

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

function coldStorageObjectId(coldStorageId: string) {
  return new mongoose.Types.ObjectId(coldStorageId);
}

/** Named filters match exactly. An omitted filter matches only rows with no filter. */
function stockFilterQuery(stockFilter?: string | null) {
  if (stockFilter) {
    return { stockFilter };
  }
  return { stockFilter: null };
}

const STOCK_EXISTS_MESSAGE =
  'Stock already exists for this variety, size, and stock filter';

export async function createColdStoreStock(
  coldStorageId: string,
  payload: CreateColdStoreStockInput,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const existing = await ColdStoreStock.findOne({
      coldStorageId: coldStorageObjectId(coldStorageId),
      variety: payload.variety,
      'size.name': payload.size.name,
      ...stockFilterQuery(payload.stockFilter),
    }).lean();

    if (existing) {
      throw new ConflictError(STOCK_EXISTS_MESSAGE, 'COLD_STORE_STOCK_EXISTS');
    }

    const stock = await ColdStoreStock.create({
      coldStorageId: coldStorageObjectId(coldStorageId),
      variety: payload.variety,
      size: {
        name: payload.size.name,
        currentQuantity: payload.size.currentQuantity,
        initialQuantity: payload.size.initialQuantity,
      },
      ...(payload.stockFilter !== undefined && {
        stockFilter: payload.stockFilter,
      }),
    });

    logger?.info(
      { stockId: stock._id, coldStorageId, variety: payload.variety },
      'Cold store stock created successfully'
    );

    return stock.toObject();
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
      throw new ConflictError(STOCK_EXISTS_MESSAGE, 'COLD_STORE_STOCK_EXISTS');
    }

    logger?.error(
      { error, coldStorageId, payload },
      'Unexpected error creating cold store stock'
    );

    throw new AppError(
      'Failed to create cold store stock',
      500,
      'CREATE_COLD_STORE_STOCK_ERROR'
    );
  }
}

export async function getColdStoreStocksByColdStorage(
  coldStorageId: string,
  query: GetColdStoreStockListQuery,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const filter: Record<string, unknown> = {
      coldStorageId: coldStorageObjectId(coldStorageId),
    };

    if (query.variety) {
      filter.variety = query.variety;
    }

    if (query.stockFilter) {
      filter.stockFilter = query.stockFilter;
    }

    const stocks = await ColdStoreStock.find(filter)
      .sort({ variety: 1, 'size.name': 1 })
      .lean();

    logger?.info(
      { coldStorageId, count: stocks.length },
      'Retrieved cold store stock by cold storage'
    );

    return stocks;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId, query },
      'Error retrieving cold store stock'
    );

    throw new AppError(
      'Failed to retrieve cold store stock',
      500,
      'GET_COLD_STORE_STOCK_ERROR'
    );
  }
}

export async function getColdStoreStockById(
  id: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid stock ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const stock = await ColdStoreStock.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: coldStorageObjectId(coldStorageId),
    }).lean();

    if (!stock) {
      throw new NotFoundError(
        'Cold store stock not found',
        'COLD_STORE_STOCK_NOT_FOUND'
      );
    }

    logger?.info({ stockId: id, coldStorageId }, 'Retrieved cold store stock');

    return stock;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, id, coldStorageId },
      'Error retrieving cold store stock by ID'
    );

    throw new AppError(
      'Failed to retrieve cold store stock',
      500,
      'GET_COLD_STORE_STOCK_ERROR'
    );
  }
}

export async function updateColdStoreStock(
  id: string,
  coldStorageId: string,
  payload: UpdateColdStoreStockInput,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid stock ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const stock = await ColdStoreStock.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: coldStorageObjectId(coldStorageId),
    });

    if (!stock) {
      throw new NotFoundError(
        'Cold store stock not found',
        'COLD_STORE_STOCK_NOT_FOUND'
      );
    }

    const nextVariety = payload.variety ?? stock.variety;
    const nextSizeName = payload.size?.name ?? stock.size.name;
    const nextStockFilter =
      payload.stockFilter !== undefined
        ? payload.stockFilter
        : stock.stockFilter;

    const existing = await ColdStoreStock.findOne({
      _id: { $ne: stock._id },
      coldStorageId: stock.coldStorageId,
      variety: nextVariety,
      'size.name': nextSizeName,
      ...stockFilterQuery(nextStockFilter),
    }).lean();

    if (existing) {
      throw new ConflictError(STOCK_EXISTS_MESSAGE, 'COLD_STORE_STOCK_EXISTS');
    }

    stock.variety = nextVariety;
    if (payload.stockFilter !== undefined) {
      stock.stockFilter = payload.stockFilter;
    }
    stock.size = {
      name: nextSizeName,
      currentQuantity:
        payload.size?.currentQuantity ?? stock.size.currentQuantity,
      initialQuantity:
        payload.size?.initialQuantity ?? stock.size.initialQuantity,
    };

    await stock.save();

    logger?.info(
      { stockId: id, coldStorageId, updates: payload },
      'Cold store stock updated successfully'
    );

    return stock.toObject();
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
      throw new ConflictError(STOCK_EXISTS_MESSAGE, 'COLD_STORE_STOCK_EXISTS');
    }

    logger?.error(
      { error, id, coldStorageId, payload },
      'Unexpected error updating cold store stock'
    );

    throw new AppError(
      'Failed to update cold store stock',
      500,
      'UPDATE_COLD_STORE_STOCK_ERROR'
    );
  }
}

export async function deleteColdStoreStock(
  id: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid stock ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const stock = await ColdStoreStock.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: coldStorageObjectId(coldStorageId),
    }).lean();

    if (!stock) {
      throw new NotFoundError(
        'Cold store stock not found',
        'COLD_STORE_STOCK_NOT_FOUND'
      );
    }

    logger?.info({ stockId: id, coldStorageId }, 'Cold store stock deleted');

    return stock;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, id, coldStorageId },
      'Unexpected error deleting cold store stock'
    );

    throw new AppError(
      'Failed to delete cold store stock',
      500,
      'DELETE_COLD_STORE_STOCK_ERROR'
    );
  }
}

function summedDispatchLines(lines: DispatchStockLine[]) {
  const totals = new Map<
    string,
    { variety: string; size: string; quantity: number }
  >();

  for (const line of lines) {
    const variety = line.variety.trim();
    const size = line.size.trim();
    const quantity = line.quantityIssued;
    if (!variety || !size || quantity === 0) {
      continue;
    }

    const key = `${variety}\0${size}`;
    const current = totals.get(key);
    if (current) {
      current.quantity += quantity;
    } else {
      totals.set(key, { variety, size, quantity });
    }
  }

  return [...totals.values()].filter((line) => line.quantity !== 0);
}

async function decrementOneStockRow(
  coldStorageId: Types.ObjectId,
  variety: string,
  sizeName: string,
  quantity: number,
  session: ClientSession,
  stockFilter?: string
) {
  const filter = {
    coldStorageId,
    variety,
    'size.name': sizeName,
    ...stockFilterQuery(stockFilter),
  };
  const update = {
    $inc: { 'size.currentQuantity': -quantity },
    $setOnInsert: {
      coldStorageId,
      variety,
      'size.name': sizeName,
      'size.initialQuantity': 0,
      ...(stockFilter ? { stockFilter } : {}),
    },
  };

  try {
    await ColdStoreStock.findOneAndUpdate(filter, update, {
      upsert: true,
      session,
      new: true,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const retried = await ColdStoreStock.findOneAndUpdate(
      filter,
      { $inc: { 'size.currentQuantity': -quantity } },
      { session, new: true }
    );

    if (!retried) {
      await ColdStoreStock.findOneAndUpdate(filter, update, {
        upsert: true,
        session,
        new: true,
      });
    }
  }
}

/**
 * Subtracts dispatched bag quantities from currentQuantity on the stock row
 * for each variety, size, and stock filter. A named filter only touches that
 * bucket. An omitted filter only touches rows with no stock filter. Missing
 * rows are created with a negative current balance and an initial quantity
 * of zero.
 */
export async function decrementColdStoreStockForDispatch(
  coldStorageId: string,
  lines: DispatchStockLine[],
  session: ClientSession,
  stockFilter?: string
) {
  const storageId = new Types.ObjectId(coldStorageId);

  for (const line of summedDispatchLines(lines)) {
    await decrementOneStockRow(
      storageId,
      line.variety,
      line.size,
      line.quantity,
      session,
      stockFilter
    );
  }
}
