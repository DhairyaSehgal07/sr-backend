import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  NikasiGatePass,
  type INikasiGatePass,
} from './nikasi-gate-pass.model.js';
import { Booking } from '../booking/booking.model.js';
import { DispatchLedger } from '../dispatch-ledger/dispatch-ledger.model.js';
import { FarmerStorageLink } from '../farmer-storage-link/farmer-storage-link.model.js';
import {
  OutgoingGatePass,
  OutgoingGatePassStatus,
} from '../outgoing-gate-pass/outgoing-gate-pass.model.js';
import { OUTGOING_TO_SHED_CATEGORY } from '../outgoing-gate-pass/outgoing-gate-pass.service.js';
import type {
  CreateNikasiGatePassInput,
  NikasiReport,
} from './nikasi-gate-pass.schema.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';

/** Safety cap for exact-number search results within a cold storage */
const NIKASI_GATE_PASS_SEARCH_RESULT_LIMIT = 100;

export interface NikasiGatePassDateFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface GetPaginatedNikasiGatePassesByColdStorageOptions extends NikasiGatePassDateFilters {
  limit?: number;
  page?: number;
  sortOrder?: 'asc' | 'desc';
}

export interface GetNikasiGatePassReportOptions {
  dateFrom?: string;
  dateTo?: string;
}

export interface NikasiGatePassesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface BookingBagSizeLean {
  size: string;
  variety: string;
  currentQuantity: number;
}

interface BookingLean {
  _id: Types.ObjectId;
  bagSizes: BookingBagSizeLean[];
}

interface BookingDeduction {
  bookingId: Types.ObjectId;
  size: string;
  variety: string;
  deductAmount: number;
}

interface ShedOrderDetailLean {
  size: string;
  bagType: string;
  quantityIssued: number;
  chamber: string;
  floor: string;
  row: string;
}

interface ShedPassLean {
  _id: Types.ObjectId;
  variety: string;
  orderDetails: ShedOrderDetailLean[];
}

interface ShedDeduction {
  outgoingGatePassId: Types.ObjectId;
  size: string;
  bagType: string;
  chamber: string;
  floor: string;
  row: string;
  deductAmount: number;
}

interface RequestedBagLine {
  size: string;
  variety: string;
  quantityIssued: number;
}

function bagLineKey(size: string, variety: string): string {
  return `${size}::${variety}`;
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

  logger?.error({ err: error }, 'Unexpected error in nikasi gate pass service');
  throw new AppError(
    'Failed to process nikasi gate pass request',
    500,
    'NIKASI_GATE_PASS_ERROR'
  );
}

function computeFifoBookingDeductions(
  bookings: BookingLean[],
  lines: RequestedBagLine[]
): BookingDeduction[] {
  const aggregated = new Map<
    string,
    { size: string; variety: string; total: number }
  >();

  for (const line of lines) {
    const key = bagLineKey(line.size, line.variety);
    const existing = aggregated.get(key);
    if (existing) {
      existing.total += line.quantityIssued;
    } else {
      aggregated.set(key, {
        size: line.size,
        variety: line.variety,
        total: line.quantityIssued,
      });
    }
  }

  const deductions: BookingDeduction[] = [];

  for (const { size, variety, total } of aggregated.values()) {
    if (total <= 0) {
      continue;
    }

    let remaining = total;
    let available = 0;

    for (const booking of bookings) {
      if (remaining <= 0) {
        break;
      }

      const bag = booking.bagSizes.find(
        (entry) => entry.size === size && entry.variety === variety
      );
      if (!bag || bag.currentQuantity <= 0) {
        continue;
      }

      available += bag.currentQuantity;
      const deductAmount = Math.min(remaining, bag.currentQuantity);
      deductions.push({
        bookingId: booking._id,
        size,
        variety,
        deductAmount,
      });
      remaining -= deductAmount;
    }

    if (remaining > 0) {
      throw new ValidationError(
        `Insufficient booked quantity for size "${size}" variety "${variety}": requested ${total}, available ${available}`,
        'INSUFFICIENT_BOOKING_STOCK'
      );
    }
  }

  return deductions;
}

async function applyBookingFifoDeductions(
  dispatchLedgerId: string,
  lines: RequestedBagLine[],
  session: ClientSession
): Promise<void> {
  const bookings = await Booking.find({
    dispatchLedgerId: new Types.ObjectId(dispatchLedgerId),
  })
    .sort({ date: 1, gatePassNo: 1 })
    .select('bagSizes')
    .session(session)
    .lean<BookingLean[]>();

  const deductions = computeFifoBookingDeductions(bookings, lines);
  if (deductions.length === 0) {
    return;
  }

  for (const deduction of deductions) {
    const updateResult = await Booking.updateOne(
      {
        _id: deduction.bookingId,
        bagSizes: {
          $elemMatch: {
            size: deduction.size,
            variety: deduction.variety,
            currentQuantity: { $gte: deduction.deductAmount },
          },
        },
      },
      {
        $inc: {
          'bagSizes.$.currentQuantity': -deduction.deductAmount,
        },
      },
      { session }
    );

    if (updateResult.modifiedCount !== 1) {
      throw new ConflictError(
        `Expected 1 booking update, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
        'CONCURRENT_MODIFICATION'
      );
    }
  }
}

function computeFifoShedDeductions(
  shedPasses: ShedPassLean[],
  lines: RequestedBagLine[]
): ShedDeduction[] {
  const aggregated = new Map<
    string,
    { size: string; variety: string; total: number }
  >();

  for (const line of lines) {
    const key = bagLineKey(line.size, line.variety);
    const existing = aggregated.get(key);
    if (existing) {
      existing.total += line.quantityIssued;
    } else {
      aggregated.set(key, {
        size: line.size,
        variety: line.variety,
        total: line.quantityIssued,
      });
    }
  }

  const remainingByLine = new Map<string, number>();
  const deductions: ShedDeduction[] = [];

  for (const { size, variety, total } of aggregated.values()) {
    if (total <= 0) {
      continue;
    }

    let remaining = total;
    let available = 0;

    for (const pass of shedPasses) {
      if (remaining <= 0) {
        break;
      }

      if (pass.variety !== variety) {
        continue;
      }

      for (let index = 0; index < pass.orderDetails.length; index++) {
        if (remaining <= 0) {
          break;
        }

        const detail = pass.orderDetails[index];
        if (!detail || detail.size !== size) {
          continue;
        }

        const lineKey = `${pass._id.toString()}::${index}`;
        const lineRemaining =
          remainingByLine.get(lineKey) ?? detail.quantityIssued;
        if (lineRemaining <= 0) {
          continue;
        }

        available += lineRemaining;
        const deductAmount = Math.min(remaining, lineRemaining);
        deductions.push({
          outgoingGatePassId: pass._id,
          size: detail.size,
          bagType: detail.bagType,
          chamber: detail.chamber,
          floor: detail.floor,
          row: detail.row,
          deductAmount,
        });
        remainingByLine.set(lineKey, lineRemaining - deductAmount);
        remaining -= deductAmount;
      }
    }

    if (remaining > 0) {
      throw new ValidationError(
        `Insufficient shed quantity for size "${size}" variety "${variety}": requested ${total}, available ${available}`,
        'INSUFFICIENT_SHED_STOCK'
      );
    }
  }

  return deductions;
}

function prepareShedBulkOps(
  deductions: ShedDeduction[]
): mongoose.mongo.AnyBulkWriteOperation<typeof OutgoingGatePass.prototype>[] {
  const bulkOps: Array<{
    updateOne: {
      filter: Record<string, unknown>;
      update: Record<string, unknown>;
      arrayFilters?: Array<Record<string, unknown>>;
    };
  }> = [];

  for (const deduction of deductions) {
    bulkOps.push({
      updateOne: {
        filter: { _id: deduction.outgoingGatePassId },
        update: {
          $inc: {
            'orderDetails.$[elem].quantityIssued': -deduction.deductAmount,
          },
        },
        arrayFilters: [
          {
            'elem.size': deduction.size,
            'elem.bagType': deduction.bagType,
            'elem.chamber': deduction.chamber,
            'elem.floor': deduction.floor,
            'elem.row': deduction.row,
            'elem.quantityIssued': { $gte: deduction.deductAmount },
          },
        ],
      },
    });
  }

  return bulkOps as mongoose.mongo.AnyBulkWriteOperation<
    typeof OutgoingGatePass.prototype
  >[];
}

async function applyShedFifoDeductions(
  coldStorageId: string,
  lines: RequestedBagLine[],
  session: ClientSession
): Promise<void> {
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: new Types.ObjectId(coldStorageId),
  })
    .distinct('_id')
    .session(session)
    .lean();

  const shedPasses =
    farmerStorageLinkIds.length === 0
      ? []
      : await OutgoingGatePass.find({
          farmerStorageLinkId: { $in: farmerStorageLinkIds },
          category: OUTGOING_TO_SHED_CATEGORY,
          status: OutgoingGatePassStatus.ACTIVE,
        })
          .sort({ date: 1, gatePassNo: 1 })
          .select('variety gatePassNo date orderDetails')
          .session(session)
          .lean<ShedPassLean[]>();

  const deductions = computeFifoShedDeductions(shedPasses, lines);
  if (deductions.length === 0) {
    return;
  }

  const bulkOps = prepareShedBulkOps(deductions);
  const updateResult = await OutgoingGatePass.bulkWrite(
    bulkOps as Parameters<typeof OutgoingGatePass.bulkWrite>[0],
    { session }
  );

  if (updateResult.modifiedCount !== bulkOps.length) {
    throw new ConflictError(
      `Expected ${bulkOps.length} shed updates, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
      'CONCURRENT_MODIFICATION'
    );
  }
}

/**
 * Creates a nikasi gate pass. Always deducts bag lines from ACTIVE outgoing-to-shed
 * stock for the cold storage (FIFO by date, gatePassNo). When isBooked is true,
 * also deducts the same lines from booking gate passes for the dispatch ledger.
 */
export async function createNikasiGatePass(
  coldStorageId: string,
  payload: CreateNikasiGatePassInput,
  logger?: FastifyBaseLogger,
  createdBy?: string
): Promise<INikasiGatePass> {
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
      {
        bagSizeCount: payload.bagSize.length,
        gatePassNo: payload.gatePassNo,
        date: payload.date,
        isBooked: payload.isBooked ?? false,
      },
      'Starting nikasi gate pass create'
    );

    if (payload.idempotencyKey) {
      const existing = await NikasiGatePass.findOne({
        idempotencyKey: payload.idempotencyKey,
      })
        .session(session)
        .lean();

      if (existing) {
        logger?.info(
          {
            idempotencyKey: payload.idempotencyKey,
            nikasiGatePassId: existing._id,
          },
          'Idempotency: returning existing nikasi gate pass'
        );
        await session.commitTransaction();
        return existing as INikasiGatePass;
      }
    }

    const dispatchLedger = await DispatchLedger.findOne({
      _id: new Types.ObjectId(payload.dispatchLedgerId),
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

    const existingByGatePassNo = await NikasiGatePass.findOne({
      gatePassNo: payload.gatePassNo,
      dispatchLedgerId: { $in: dispatchLedgerIds },
    })
      .session(session)
      .lean();

    if (existingByGatePassNo) {
      throw new ConflictError(
        `Gate pass number ${payload.gatePassNo} already exists for this cold storage`,
        'GATE_PASS_NUMBER_EXISTS'
      );
    }

    await applyShedFifoDeductions(coldStorageId, payload.bagSize, session);

    if (payload.isBooked) {
      await applyBookingFifoDeductions(
        payload.dispatchLedgerId,
        payload.bagSize,
        session
      );
    }

    const nikasiGatePass = new NikasiGatePass({
      dispatchLedgerId: new Types.ObjectId(payload.dispatchLedgerId),
      ...(createdBy && { createdBy: new Types.ObjectId(createdBy) }),
      gatePassNo: payload.gatePassNo,
      ...(payload.manualGatePassNumber !== undefined && {
        manualGatePassNumber: payload.manualGatePassNumber,
      }),
      ...(payload.isBooked !== undefined && { isBooked: payload.isBooked }),
      ...(payload.billNumber !== undefined && {
        billNumber: payload.billNumber,
      }),
      ...(payload.bitliNumber !== undefined && {
        bitliNumber: payload.bitliNumber,
      }),
      ...(payload.billBook !== undefined && { billBook: payload.billBook }),
      ...(payload.biltiBook !== undefined && { biltiBook: payload.biltiBook }),
      category: payload.category,
      date: payload.date,
      from: payload.from,
      ...(payload.to !== undefined && { to: payload.to }),
      ...(payload.truckNumber !== undefined && {
        truckNumber: payload.truckNumber,
      }),
      bagSize: payload.bagSize,
      ...(payload.remarks !== undefined && { remarks: payload.remarks }),
      ...(payload.netWeight !== undefined && { netWeight: payload.netWeight }),
      ...(payload.averageWeightPerBag !== undefined && {
        averageWeightPerBag: payload.averageWeightPerBag,
      }),
      ...(payload.idempotencyKey !== undefined && {
        idempotencyKey: payload.idempotencyKey,
      }),
    });

    await nikasiGatePass.save({ session });
    await session.commitTransaction();
    return nikasiGatePass;
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleServiceError(error, logger);
  } finally {
    session.endSession();
  }
}

/**
 * Retrieves nikasi gate passes for a cold storage with pagination.
 */
export async function getPaginatedNikasiGatePassesByColdStorage(
  coldStorageId: string,
  options: GetPaginatedNikasiGatePassesByColdStorageOptions = {},
  logger?: FastifyBaseLogger
): Promise<{
  nikasiGatePasses: Array<Record<string, unknown>>;
  pagination: NikasiGatePassesPagination;
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

    const [total, nikasiGatePasses] = await Promise.all([
      NikasiGatePass.countDocuments(match),
      NikasiGatePass.find(match)
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
        count: nikasiGatePasses.length,
        total,
        page,
        limit,
      },
      'Retrieved paginated nikasi gate passes by cold storage'
    );

    return {
      nikasiGatePasses: nikasiGatePasses as unknown as Array<
        Record<string, unknown>
      >,
      pagination: { page, limit, total, totalPages },
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving paginated nikasi gate passes by cold storage'
    );

    throw new AppError(
      'Failed to retrieve nikasi gate passes',
      500,
      'GET_NIKASI_GATE_PASSES_ERROR'
    );
  }
}

/**
 * Searches nikasi gate passes within a cold storage by exact gate pass number.
 * Matches documents where `number` equals gatePassNo, manualGatePassNumber,
 * billNumber, bitliNumber, billBook, or biltiBook.
 */
export async function searchNikasiGatePassesByNumber(
  coldStorageId: string,
  number: number,
  logger?: FastifyBaseLogger
): Promise<{ nikasiGatePasses: Array<Record<string, unknown>> }> {
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
      return { nikasiGatePasses: [] };
    }

    const filter = {
      $and: [
        { dispatchLedgerId: { $in: dispatchLedgerIds } },
        {
          $or: [
            { gatePassNo: number },
            { manualGatePassNumber: number },
            { billNumber: number },
            { bitliNumber: number },
            { billBook: String(number) },
            { biltiBook: String(number) },
          ],
        },
      ],
    };

    const nikasiGatePasses = await NikasiGatePass.find(filter)
      .populate({
        path: 'dispatchLedgerId',
        select: 'name address mobileNumber',
      })
      .populate({ path: 'createdBy', select: 'name' })
      .sort({ gatePassNo: -1, date: -1 })
      .limit(NIKASI_GATE_PASS_SEARCH_RESULT_LIMIT)
      .lean();

    logger?.info(
      { coldStorageId, number, count: nikasiGatePasses.length },
      'Searched nikasi gate passes by number'
    );

    return {
      nikasiGatePasses: nikasiGatePasses as unknown as Array<
        Record<string, unknown>
      >,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId, number },
      'Error searching nikasi gate passes by number'
    );

    throw new AppError(
      'Failed to search nikasi gate passes',
      500,
      'SEARCH_NIKASI_GATE_PASSES_ERROR'
    );
  }
}

function toObjectIdString(value: unknown): string {
  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return '';
}

function formatReportDateTime(date: Date | string | undefined): string {
  if (date == null) {
    return '';
  }
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString();
}

type NikasiGatePassReportLean = {
  _id?: unknown;
  dispatchLedgerId?: {
    _id?: unknown;
    name?: string;
    address?: string;
    mobileNumber?: string;
  } | null;
  createdBy?: {
    _id?: unknown;
    name?: string;
  } | null;
  gatePassNo: number;
  manualGatePassNumber?: number;
  isBooked?: boolean;
  billNumber?: number;
  bitliNumber?: number;
  billBook?: string;
  biltiBook?: string;
  category: string;
  date?: Date | string;
  from: string;
  to?: string;
  truckNumber?: string;
  bagSize?: Array<{
    size: string;
    variety: string;
    quantityIssued: number;
  }>;
  remarks?: string;
  netWeight?: number;
  averageWeightPerBag?: number;
};

function mapNikasiGatePassToReport(
  pass: NikasiGatePassReportLean
): NikasiReport {
  const dispatchLedger: NikasiReport['dispatchLedgerId'] = {
    _id: toObjectIdString(pass.dispatchLedgerId?._id),
    name: pass.dispatchLedgerId?.name ?? '',
    address: pass.dispatchLedgerId?.address ?? '',
  };

  if (pass.dispatchLedgerId?.mobileNumber != null) {
    dispatchLedger.mobileNumber = pass.dispatchLedgerId.mobileNumber;
  }

  const bagSize = pass.bagSize ?? [];
  const totalBags = bagSize.reduce(
    (total, line) => total + (line.quantityIssued ?? 0),
    0
  );

  const report: NikasiReport = {
    _id: toObjectIdString(pass._id),
    dispatchLedgerId: dispatchLedger,
    gatePassNo: pass.gatePassNo,
    date: formatReportDateTime(pass.date),
    category: pass.category,
    from: pass.from,
    bagSize,
    totalBags,
  };

  if (pass.createdBy) {
    report.createdBy = {
      _id: toObjectIdString(pass.createdBy._id),
      name: pass.createdBy.name ?? '',
    };
  }

  if (pass.manualGatePassNumber != null) {
    report.manualGatePassNumber = pass.manualGatePassNumber;
  }

  if (pass.isBooked != null) {
    report.isBooked = pass.isBooked;
  }

  if (pass.billNumber != null) {
    report.billNumber = pass.billNumber;
  }

  if (pass.bitliNumber != null) {
    report.bitliNumber = pass.bitliNumber;
  }

  if (pass.billBook != null) {
    report.billBook = pass.billBook;
  }

  if (pass.biltiBook != null) {
    report.biltiBook = pass.biltiBook;
  }

  if (pass.to != null) {
    report.to = pass.to;
  }

  if (pass.truckNumber != null) {
    report.truckNumber = pass.truckNumber;
  }

  if (pass.remarks != null) {
    report.remarks = pass.remarks;
  }

  if (pass.netWeight != null) {
    report.netWeight = pass.netWeight;
  }

  if (pass.averageWeightPerBag != null) {
    report.averageWeightPerBag = pass.averageWeightPerBag;
  }

  return report;
}

/**
 * Retrieves all nikasi gate passes for a cold storage within an optional date range (no pagination).
 */
export async function getNikasiGatePassReport(
  coldStorageId: string,
  options: GetNikasiGatePassReportOptions = {},
  logger?: FastifyBaseLogger
): Promise<{ nikasiGatePasses: NikasiReport[] }> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const dispatchLedgerIds =
      await getDispatchLedgerIdsForColdStorage(coldStorageId);

    const filter: Record<string, unknown> = {
      dispatchLedgerId: { $in: dispatchLedgerIds },
    };

    if (options.dateFrom != null || options.dateTo != null) {
      const dateConditions: Record<string, unknown> = {};
      if (options.dateFrom != null) {
        const from = new Date(options.dateFrom);
        if (Number.isNaN(from.getTime())) {
          throw new ValidationError(
            'Invalid dateFrom format. Use ISO date, e.g. 2026-03-01',
            'INVALID_DATE_FROM'
          );
        }
        from.setUTCHours(0, 0, 0, 0);
        dateConditions.$gte = from;
      }
      if (options.dateTo != null) {
        const to = new Date(options.dateTo);
        if (Number.isNaN(to.getTime())) {
          throw new ValidationError(
            'Invalid dateTo format. Use ISO date, e.g. 2026-03-07',
            'INVALID_DATE_TO'
          );
        }
        to.setUTCHours(23, 59, 59, 999);
        dateConditions.$lte = to;
      }
      filter.date = dateConditions;
    }

    const nikasiGatePasses = await NikasiGatePass.find(filter)
      .populate({
        path: 'dispatchLedgerId',
        select: 'name address mobileNumber',
      })
      .populate({ path: 'createdBy', select: 'name' })
      .sort({ gatePassNo: -1, date: -1 })
      .lean();

    logger?.info(
      {
        coldStorageId,
        count: nikasiGatePasses.length,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      },
      'Retrieved nikasi gate pass report'
    );

    return {
      nikasiGatePasses: (
        nikasiGatePasses as unknown as NikasiGatePassReportLean[]
      ).map(mapNikasiGatePassToReport),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving nikasi gate pass report'
    );

    throw new AppError(
      'Failed to retrieve nikasi gate pass report',
      500,
      'GET_NIKASI_GATE_PASS_REPORT_ERROR'
    );
  }
}
