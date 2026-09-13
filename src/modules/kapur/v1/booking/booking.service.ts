import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import { Booking, type IBooking } from './booking.model.js';
import { BookingAudit, BookingAuditState } from './booking-audit.model.js';
import type {
  CreateBookingInput,
  UpdateBookingInput,
} from './booking.schema.js';
import { DispatchLedger } from '../dispatch-ledger/dispatch-ledger.model.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';

const BOOKING_SEARCH_RESULT_LIMIT = 100;

const BOOKING_EDITABLE_FIELDS = [
  'manualGatePassNumber',
  'date',
  'dispatchLedgerId',
  'bagSizes',
  'remarks',
] as const;

export interface BookingDateFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface GetPaginatedBookingsByColdStorageOptions extends BookingDateFilters {
  limit?: number;
  page?: number;
  sortOrder?: 'asc' | 'desc';
}

export interface BookingsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function serializeAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeAuditValue(item));
  }

  if (value && typeof value === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      serialized[key] = serializeAuditValue(nestedValue);
    }
    return serialized;
  }

  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (
    a instanceof mongoose.Types.ObjectId &&
    b instanceof mongoose.Types.ObjectId
  ) {
    return a.equals(b);
  }

  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null
  ) {
    return (
      JSON.stringify(serializeAuditValue(a)) ===
      JSON.stringify(serializeAuditValue(b))
    );
  }

  return a === b;
}

function buildBookingAuditDiff(
  existing: Record<string, unknown>,
  payload: UpdateBookingInput
): {
  previousState: BookingAuditState;
  modifiedState: BookingAuditState;
} {
  const previousState: BookingAuditState = {};
  const modifiedState: BookingAuditState = {};

  for (const field of BOOKING_EDITABLE_FIELDS) {
    if (payload[field] === undefined) {
      continue;
    }

    const oldValue = existing[field];
    let newValue: unknown = payload[field];

    if (field === 'dispatchLedgerId' && typeof newValue === 'string') {
      newValue = new mongoose.Types.ObjectId(newValue);
    }

    if (!valuesEqual(oldValue, newValue)) {
      if (oldValue !== undefined) {
        previousState[field] = serializeAuditValue(oldValue) as unknown;
      }
      modifiedState[field] = serializeAuditValue(newValue) as unknown;
    }
  }

  return { previousState, modifiedState };
}

function toObjectIdString(value: unknown): string | undefined {
  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (
    value &&
    typeof value === 'object' &&
    '_id' in value &&
    (value as { _id?: unknown })._id instanceof mongoose.Types.ObjectId
  ) {
    return (value as { _id: mongoose.Types.ObjectId })._id.toString();
  }

  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return value;
  }

  return undefined;
}

function collectDispatchLedgerIdsFromAuditState(
  state: BookingAuditState | undefined,
  dispatchLedgerIds: Set<string>
): void {
  if (!state || typeof state !== 'object') {
    return;
  }

  const dispatchLedgerId = toObjectIdString(state.dispatchLedgerId);
  if (dispatchLedgerId) {
    dispatchLedgerIds.add(dispatchLedgerId);
  }
}

function populateAuditStateDispatchLedger(
  state: unknown,
  dispatchLedgerMap: Map<string, Record<string, unknown>>
): unknown {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return state;
  }

  const auditState = state as Record<string, unknown>;
  const dispatchLedgerId = toObjectIdString(auditState.dispatchLedgerId);
  if (!dispatchLedgerId) {
    return auditState;
  }

  const dispatchLedger = dispatchLedgerMap.get(dispatchLedgerId);
  if (!dispatchLedger) {
    return auditState;
  }

  return {
    ...auditState,
    dispatchLedgerId: dispatchLedger,
  };
}

async function buildAuditDispatchLedgerMap(
  audits: Array<Record<string, unknown>>
): Promise<Map<string, Record<string, unknown>>> {
  const dispatchLedgerIds = new Set<string>();

  for (const audit of audits) {
    collectDispatchLedgerIdsFromAuditState(
      audit.previousState as BookingAuditState | undefined,
      dispatchLedgerIds
    );
    collectDispatchLedgerIdsFromAuditState(
      audit.modifiedState as BookingAuditState | undefined,
      dispatchLedgerIds
    );
  }

  if (dispatchLedgerIds.size === 0) {
    return new Map();
  }

  const dispatchLedgers = await DispatchLedger.find({
    _id: {
      $in: [...dispatchLedgerIds].map((id) => new mongoose.Types.ObjectId(id)),
    },
  })
    .select('name address mobileNumber')
    .lean();

  return new Map(
    dispatchLedgers.map((ledger) => [
      (ledger._id as mongoose.Types.ObjectId).toString(),
      ledger as Record<string, unknown>,
    ])
  );
}

async function formatBookingAuditsForResponse(
  audits: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const dispatchLedgerMap = await buildAuditDispatchLedgerMap(audits);

  return audits.map((audit) => ({
    ...audit,
    previousState: populateAuditStateDispatchLedger(
      audit.previousState,
      dispatchLedgerMap
    ),
    modifiedState: populateAuditStateDispatchLedger(
      audit.modifiedState,
      dispatchLedgerMap
    ),
  }));
}

async function assertDispatchLedgerInColdStorage(
  dispatchLedgerId: string,
  coldStorageId: string
): Promise<void> {
  const dispatchLedger = await DispatchLedger.findOne({
    _id: new Types.ObjectId(dispatchLedgerId),
    coldStorageId: new Types.ObjectId(coldStorageId),
  }).lean();

  if (!dispatchLedger) {
    throw new NotFoundError(
      'Dispatch ledger not found or access denied',
      'DISPATCH_LEDGER_NOT_FOUND'
    );
  }
}

async function getDispatchLedgerIdsForColdStorage(
  coldStorageId: string
): Promise<Types.ObjectId[]> {
  return DispatchLedger.find({
    coldStorageId: new Types.ObjectId(coldStorageId),
  })
    .distinct('_id')
    .lean();
}

function handleServiceError(error: unknown, logger?: FastifyBaseLogger): never {
  if (
    error instanceof ConflictError ||
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof AppError
  ) {
    throw error;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(error.errors).map((e) => e.message);
    throw new ValidationError(messages.join(', '), 'MONGOOSE_VALIDATION_ERROR');
  }

  const err = error as Error & {
    code?: number;
    keyPattern?: Record<string, unknown>;
  };
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'field';
    throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
  }

  logger?.error({ err: error }, 'Unexpected error in booking service');
  throw new AppError('Failed to process booking request', 500, 'BOOKING_ERROR');
}

async function createSingleBooking(
  coldStorageId: string,
  payload: CreateBookingInput,
  session: ClientSession,
  logger?: FastifyBaseLogger,
  createdBy?: string
): Promise<IBooking> {
  const {
    dispatchLedgerId,
    gatePassNo,
    manualGatePassNumber,
    date,
    bagSizes,
    remarks,
    idempotencyKey,
  } = payload;

  if (idempotencyKey) {
    const existing = await Booking.findOne({ idempotencyKey })
      .session(session)
      .lean();
    if (existing) {
      logger?.info(
        { idempotencyKey, bookingId: existing._id },
        'Idempotency: returning existing booking'
      );
      return existing as IBooking;
    }
  }

  const dispatchLedger = await DispatchLedger.findOne({
    _id: new Types.ObjectId(dispatchLedgerId),
    coldStorageId: new Types.ObjectId(coldStorageId),
  })
    .session(session)
    .lean();

  if (!dispatchLedger) {
    throw new NotFoundError(
      'Dispatch ledger not found',
      'DISPATCH_LEDGER_NOT_FOUND'
    );
  }

  const dispatchLedgerIds = await DispatchLedger.find({
    coldStorageId: new Types.ObjectId(coldStorageId),
  })
    .session(session)
    .distinct('_id')
    .lean();

  const existingByGatePassNo = await Booking.findOne({
    gatePassNo,
    dispatchLedgerId: { $in: dispatchLedgerIds },
  })
    .session(session)
    .lean();

  if (existingByGatePassNo) {
    throw new ConflictError(
      `Gate pass number ${gatePassNo} already exists for this cold storage`,
      'GATE_PASS_NUMBER_EXISTS'
    );
  }

  const booking = new Booking({
    dispatchLedgerId: new Types.ObjectId(dispatchLedgerId),
    ...(createdBy && { createdBy: new Types.ObjectId(createdBy) }),
    gatePassNo,
    ...(manualGatePassNumber !== undefined && { manualGatePassNumber }),
    date,
    bagSizes: bagSizes.map((bs) => ({
      size: bs.size,
      variety: bs.variety,
      currentQuantity: bs.currentQuantity,
      initialQuantity: bs.initialQuantity,
    })),
    editHistory: [],
    remarks: remarks ?? undefined,
    ...(idempotencyKey && { idempotencyKey }),
  });

  await booking.save({ session });

  logger?.info(
    { bookingId: booking._id, gatePassNo: booking.gatePassNo },
    'Booking created'
  );

  return booking as IBooking;
}

/**
 * Creates a booking gate pass for a dispatch ledger in the authenticated cold storage.
 */
export async function createBooking(
  coldStorageId: string,
  payload: CreateBookingInput,
  logger?: FastifyBaseLogger,
  createdBy?: string
): Promise<IBooking> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    logger?.info(
      { bagSizesCount: payload.bagSizes.length, date: payload.date },
      'Starting booking create'
    );

    const result = await createSingleBooking(
      coldStorageId,
      payload,
      session,
      logger,
      createdBy
    );

    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleServiceError(error, logger);
  } finally {
    session.endSession();
  }
}

/**
 * Searches bookings within a cold storage by exact gate pass number.
 * Matches documents where `number` equals either `gatePassNo` or `manualGatePassNumber`.
 */
export async function searchBookingsByNumber(
  coldStorageId: string,
  number: number,
  logger?: FastifyBaseLogger
): Promise<{ bookings: Array<Record<string, unknown>> }> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const dispatchLedgerIds =
      await getDispatchLedgerIdsForColdStorage(coldStorageId);

    if (dispatchLedgerIds.length === 0) {
      return { bookings: [] };
    }

    const filter = {
      $and: [
        { dispatchLedgerId: { $in: dispatchLedgerIds } },
        { $or: [{ gatePassNo: number }, { manualGatePassNumber: number }] },
      ],
    };

    const bookings = await Booking.find(filter)
      .populate({
        path: 'dispatchLedgerId',
        select: 'name address mobileNumber',
      })
      .populate({ path: 'createdBy', select: 'name' })
      .sort({ gatePassNo: -1, date: -1 })
      .limit(BOOKING_SEARCH_RESULT_LIMIT)
      .lean();

    logger?.info(
      { coldStorageId, number, count: bookings.length },
      'Searched bookings by number'
    );

    return {
      bookings: bookings as unknown as Array<Record<string, unknown>>,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId, number },
      'Error searching bookings by number'
    );

    throw new AppError(
      'Failed to search bookings',
      500,
      'SEARCH_BOOKINGS_ERROR'
    );
  }
}

/**
 * Retrieves bookings for a cold storage with pagination.
 */
export async function getPaginatedBookingsByColdStorage(
  coldStorageId: string,
  options: GetPaginatedBookingsByColdStorageOptions = {},
  logger?: FastifyBaseLogger
): Promise<{
  bookings: Array<Record<string, unknown>>;
  pagination: BookingsPagination;
}> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 5000);
    const page = Math.max(options.page ?? 1, 1);
    const sortOrder = options.sortOrder ?? 'desc';
    const sortDir = sortOrder === 'desc' ? -1 : 1;

    const dispatchLedgerIds =
      await getDispatchLedgerIdsForColdStorage(coldStorageId);

    const match: Record<string, unknown> = {
      dispatchLedgerId: { $in: dispatchLedgerIds },
    };

    if (options.dateFrom) {
      const start = new Date(options.dateFrom);
      if (Number.isNaN(start.getTime())) {
        throw new ValidationError(
          'Invalid dateFrom format; use YYYY-MM-DD',
          'INVALID_DATE_FROM'
        );
      }
      start.setUTCHours(0, 0, 0, 0);
      match.date = (match.date as Record<string, unknown>) ?? {};
      (match.date as Record<string, unknown>).$gte = start;
    }

    if (options.dateTo) {
      const end = new Date(options.dateTo);
      if (Number.isNaN(end.getTime())) {
        throw new ValidationError(
          'Invalid dateTo format; use YYYY-MM-DD',
          'INVALID_DATE_TO'
        );
      }
      end.setUTCHours(23, 59, 59, 999);
      match.date = (match.date as Record<string, unknown>) ?? {};
      (match.date as Record<string, unknown>).$lte = end;
    }

    const [total, bookings] = await Promise.all([
      Booking.countDocuments(match),
      Booking.find(match)
        .populate({
          path: 'dispatchLedgerId',
          select: 'name address mobileNumber',
        })
        .populate({ path: 'createdBy', select: 'name' })
        .sort({ gatePassNo: sortDir, date: sortDir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger?.info(
      {
        coldStorageId,
        count: bookings.length,
        total,
        page,
        limit,
      },
      'Retrieved paginated bookings by cold storage'
    );

    return {
      bookings: bookings as unknown as Array<Record<string, unknown>>,
      pagination: { page, limit, total, totalPages },
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving paginated bookings by cold storage'
    );

    throw new AppError(
      'Failed to retrieve bookings',
      500,
      'GET_BOOKINGS_ERROR'
    );
  }
}

/**
 * Updates a booking. Allowed fields only.
 * Ensures the booking belongs to the authenticated user's cold storage.
 */
export async function updateBooking(
  id: string,
  coldStorageId: string,
  payload: UpdateBookingInput,
  logger?: FastifyBaseLogger,
  editedById?: string,
  requestMetadata?: { ipAddress?: string; userAgent?: string }
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid booking ID format', 'INVALID_ID');
    }
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const existing = await Booking.findById(id).lean();
    if (!existing) {
      throw new NotFoundError('Booking not found', 'BOOKING_NOT_FOUND');
    }

    await assertDispatchLedgerInColdStorage(
      (existing.dispatchLedgerId as Types.ObjectId).toString(),
      coldStorageId
    );

    if (payload.dispatchLedgerId) {
      await assertDispatchLedgerInColdStorage(
        payload.dispatchLedgerId,
        coldStorageId
      );
    }

    const { previousState, modifiedState } = buildBookingAuditDiff(
      existing as unknown as Record<string, unknown>,
      payload
    );
    const hasAuditChanges = Object.keys(modifiedState).length > 0;

    const updateData: Record<string, unknown> = { ...payload };
    const unsetFields: Record<string, 1> = {};

    if (updateData.manualGatePassNumber === null) {
      unsetFields.manualGatePassNumber = 1;
      delete updateData.manualGatePassNumber;
    }

    if (payload.dispatchLedgerId) {
      updateData.dispatchLedgerId = new Types.ObjectId(
        payload.dispatchLedgerId
      );
    }

    const updateQuery: Record<string, unknown> = {};
    if (Object.keys(updateData).length > 0) {
      updateQuery.$set = updateData;
    }
    if (Object.keys(unsetFields).length > 0) {
      updateQuery.$unset = unsetFields;
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, updateQuery, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: 'dispatchLedgerId',
        select: 'name address mobileNumber',
      })
      .populate('createdBy', 'name mobileNumber')
      .lean();

    if (!updatedBooking) {
      throw new NotFoundError('Booking not found', 'BOOKING_NOT_FOUND');
    }

    if (hasAuditChanges) {
      await BookingAudit.create({
        bookingId: existing._id,
        editedById: editedById ? new Types.ObjectId(editedById) : undefined,
        previousState,
        modifiedState,
        ipAddress: requestMetadata?.ipAddress,
        userAgent: requestMetadata?.userAgent,
      });

      logger?.info(
        {
          bookingId: id,
          editedById,
          fieldsChanged: Object.keys(modifiedState),
        },
        'Audit record created for booking update'
      );
    }

    logger?.info(
      { bookingId: id, fieldsUpdated: Object.keys(payload) },
      'Booking updated successfully'
    );

    return updatedBooking;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError
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

    if (error instanceof Error && 'code' in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || 'field';
      throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
    }

    logger?.error({ error, id, payload }, 'Error updating booking');

    throw new AppError('Failed to update booking', 500, 'UPDATE_BOOKING_ERROR');
  }
}

export interface BookingSummarySizeRow {
  size: string;
  initialQuantity: number;
  currentQuantity: number;
  quantityRemoved: number;
}

export interface BookingSummaryVarietyRow {
  variety: string;
  initialQuantity: number;
  currentQuantity: number;
  quantityRemoved: number;
  sizes: BookingSummarySizeRow[];
}

/**
 * Per-variety booking summary with per-size breakdown.
 * Optional dateFrom/dateTo filter by booking date.
 */
export async function getBookingSummary(
  coldStorageId: string,
  filters: BookingDateFilters,
  logger?: FastifyBaseLogger
): Promise<BookingSummaryVarietyRow[]> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  const dispatchLedgerIds =
    await getDispatchLedgerIdsForColdStorage(coldStorageId);

  if (dispatchLedgerIds.length === 0) {
    return [];
  }

  const match: Record<string, unknown> = {
    dispatchLedgerId: { $in: dispatchLedgerIds },
  };

  if (filters.dateFrom) {
    const start = new Date(filters.dateFrom);
    if (Number.isNaN(start.getTime())) {
      throw new ValidationError(
        'Invalid dateFrom format; use YYYY-MM-DD',
        'INVALID_DATE_FROM'
      );
    }
    start.setUTCHours(0, 0, 0, 0);
    match.date = (match.date as Record<string, unknown>) ?? {};
    (match.date as Record<string, unknown>).$gte = start;
  }

  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    if (Number.isNaN(end.getTime())) {
      throw new ValidationError(
        'Invalid dateTo format; use YYYY-MM-DD',
        'INVALID_DATE_TO'
      );
    }
    end.setUTCHours(23, 59, 59, 999);
    match.date = (match.date as Record<string, unknown>) ?? {};
    (match.date as Record<string, unknown>).$lte = end;
  }

  const docs = await Booking.find(match).select('bagSizes').lean();

  const byVariety = new Map<
    string,
    Map<string, { initial: number; current: number }>
  >();

  for (const doc of docs) {
    for (const bs of doc.bagSizes ?? []) {
      const variety = bs.variety?.trim() || 'Unspecified';
      const size = bs.size?.trim() || '';
      const initial = Number(bs.initialQuantity) || 0;
      const current = Number(bs.currentQuantity) || 0;

      let sizeMap = byVariety.get(variety);
      if (!sizeMap) {
        sizeMap = new Map();
        byVariety.set(variety, sizeMap);
      }

      const existing = sizeMap.get(size) ?? { initial: 0, current: 0 };
      existing.initial += initial;
      existing.current += current;
      sizeMap.set(size, existing);
    }
  }

  const result: BookingSummaryVarietyRow[] = [];
  for (const [variety, sizeMap] of byVariety) {
    let varietyInitial = 0;
    let varietyCurrent = 0;
    const sizes: BookingSummarySizeRow[] = [];

    for (const [size, { initial, current }] of sizeMap) {
      sizes.push({
        size,
        initialQuantity: initial,
        currentQuantity: current,
        quantityRemoved: initial - current,
      });
      varietyInitial += initial;
      varietyCurrent += current;
    }

    result.push({
      variety,
      initialQuantity: varietyInitial,
      currentQuantity: varietyCurrent,
      quantityRemoved: varietyInitial - varietyCurrent,
      sizes,
    });
  }

  result.sort((a, b) => a.variety.localeCompare(b.variety));

  logger?.info(
    { coldStorageId, varietyCount: result.length },
    'Booking summary computed'
  );

  return result;
}

/**
 * Retrieves booking audit records for a cold storage.
 */
export async function getBookingAuditsByColdStorage(
  coldStorageId: string,
  options: { limit?: number; page?: number } = {},
  logger?: FastifyBaseLogger
): Promise<{
  audits: Array<Record<string, unknown>>;
  pagination: BookingsPagination;
}> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 5000);
    const page = Math.max(options.page ?? 1, 1);

    const dispatchLedgerIds =
      await getDispatchLedgerIdsForColdStorage(coldStorageId);

    const emptyPagination = { page, limit, total: 0, totalPages: 0 };

    if (dispatchLedgerIds.length === 0) {
      return { audits: [], pagination: emptyPagination };
    }

    const bookingIds = await Booking.find({
      dispatchLedgerId: { $in: dispatchLedgerIds },
    })
      .distinct('_id')
      .lean();

    if (bookingIds.length === 0) {
      return { audits: [], pagination: emptyPagination };
    }

    const filter = {
      bookingId: { $in: bookingIds },
    };

    const [total, audits] = await Promise.all([
      BookingAudit.countDocuments(filter),
      BookingAudit.find(filter)
        .populate({
          path: 'bookingId',
          select: 'gatePassNo manualGatePassNumber dispatchLedgerId',
          populate: {
            path: 'dispatchLedgerId',
            select: 'name address mobileNumber',
          },
        })
        .populate('editedById', 'name mobileNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit);
    const formattedAudits = await formatBookingAuditsForResponse(
      audits as unknown as Array<Record<string, unknown>>
    );

    logger?.info(
      { coldStorageId, count: formattedAudits.length, total, page, limit },
      'Retrieved booking audits by cold storage'
    );

    return {
      audits: formattedAudits,
      pagination: { page, limit, total, totalPages },
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving booking audits by cold storage'
    );

    throw new AppError(
      'Failed to retrieve booking audits',
      500,
      'GET_BOOKING_AUDITS_ERROR'
    );
  }
}
