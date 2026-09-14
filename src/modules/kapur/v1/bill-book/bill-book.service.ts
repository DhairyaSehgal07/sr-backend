import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';
import { BillBook } from './bill-book.model.js';
import {
  CreateBillBookInput,
  GetBillBookListQuery,
  UpdateBillBookInput,
} from './bill-book.schema.js';

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

export async function createBillBook(
  coldStorageId: string,
  payload: CreateBillBookInput,
  logger?: FastifyBaseLogger,
  createdBy?: string
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const existing = await BillBook.findOne({
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
      name: payload.name,
    }).lean();

    if (existing) {
      throw new ConflictError(
        'Bill book already exists for this cold storage',
        'BILL_BOOK_EXISTS'
      );
    }

    const billBook = await BillBook.create({
      name: payload.name,
      isActive: true,
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
      ...(createdBy &&
        mongoose.Types.ObjectId.isValid(createdBy) && {
          createdBy: new mongoose.Types.ObjectId(createdBy),
        }),
    });

    logger?.info(
      { billBookId: billBook._id, coldStorageId },
      'Bill book created successfully'
    );

    return billBook.toObject();
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
        'Bill book already exists for this cold storage',
        'BILL_BOOK_EXISTS'
      );
    }

    logger?.error(
      { error, coldStorageId, payload },
      'Unexpected error creating bill book'
    );

    throw new AppError(
      'Failed to create bill book',
      500,
      'CREATE_BILL_BOOK_ERROR'
    );
  }
}

export async function getBillBooksByColdStorage(
  coldStorageId: string,
  query: GetBillBookListQuery,
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
      filter.name = { $regex: query.search, $options: 'i' };
    }

    if (query.isActive === 'true') {
      filter.isActive = true;
    } else if (query.isActive === 'false') {
      filter.isActive = false;
    }

    const billBooks = await BillBook.find(filter)
      .sort({ name: 1, createdAt: -1 })
      .lean();

    logger?.info(
      { coldStorageId, count: billBooks.length },
      'Retrieved bill books by cold storage'
    );

    return billBooks;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId, query },
      'Error retrieving bill books'
    );

    throw new AppError(
      'Failed to retrieve bill books',
      500,
      'GET_BILL_BOOKS_ERROR'
    );
  }
}

export async function getBillBookById(
  id: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid bill book ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const billBook = await BillBook.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    }).lean();

    if (!billBook) {
      throw new NotFoundError('Bill book not found', 'BILL_BOOK_NOT_FOUND');
    }

    logger?.info({ billBookId: id, coldStorageId }, 'Retrieved bill book');

    return billBook;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, id, coldStorageId },
      'Error retrieving bill book by ID'
    );

    throw new AppError(
      'Failed to retrieve bill book',
      500,
      'GET_BILL_BOOK_ERROR'
    );
  }
}

export async function getActiveBillBookById(
  id: string,
  coldStorageId: string,
  session?: ClientSession
) {
  validateObjectId(id, 'Invalid bill book ID format', 'INVALID_ID');
  validateObjectId(
    coldStorageId,
    'Invalid cold storage ID format',
    'INVALID_COLD_STORAGE_ID'
  );

  const query = BillBook.findOne({
    _id: new Types.ObjectId(id),
    coldStorageId: new Types.ObjectId(coldStorageId),
  });

  if (session) {
    query.session(session);
  }

  const billBook = await query.lean();

  if (!billBook) {
    throw new NotFoundError('Bill book not found', 'BILL_BOOK_NOT_FOUND');
  }

  if (!billBook.isActive) {
    throw new ValidationError('Bill book is inactive', 'BILL_BOOK_INACTIVE');
  }

  return billBook;
}

export async function updateBillBook(
  id: string,
  coldStorageId: string,
  payload: UpdateBillBookInput,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(id, 'Invalid bill book ID format', 'INVALID_ID');
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const billBook = await BillBook.findOne({
      _id: new mongoose.Types.ObjectId(id),
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    });

    if (!billBook) {
      throw new NotFoundError('Bill book not found', 'BILL_BOOK_NOT_FOUND');
    }

    const nextName = payload.name ?? billBook.name;

    const existing = await BillBook.findOne({
      _id: { $ne: billBook._id },
      coldStorageId: billBook.coldStorageId,
      name: nextName,
    }).lean();

    if (existing) {
      throw new ConflictError(
        'Bill book already exists for this cold storage',
        'BILL_BOOK_EXISTS'
      );
    }

    if (payload.name !== undefined) {
      billBook.name = payload.name;
    }
    if (payload.isActive !== undefined) {
      billBook.isActive = payload.isActive;
    }

    await billBook.save();

    logger?.info(
      { billBookId: id, coldStorageId, updates: payload },
      'Bill book updated successfully'
    );

    return billBook.toObject();
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
        'Bill book already exists for this cold storage',
        'BILL_BOOK_EXISTS'
      );
    }

    logger?.error(
      { error, id, coldStorageId, payload },
      'Unexpected error updating bill book'
    );

    throw new AppError(
      'Failed to update bill book',
      500,
      'UPDATE_BILL_BOOK_ERROR'
    );
  }
}
