import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  NikasiGatePass,
  NikasiGatePassStatus,
  type INikasiBookingDeduction,
  type INikasiGatePass,
  type INikasiShedDeduction,
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
import { BillBook } from '../bill-book/bill-book.model.js';
import { getActiveBillBookById } from '../bill-book/bill-book.service.js';
import { billedPaiseFromBagLines } from '../finances/money.js';
import {
  assertFinanceSaleCanBeNulled,
  postFinanceSaleFromNikasi,
  voidFinanceSaleForDispatch,
} from '../finances/finances.service.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';

/** Safety cap for exact-number search results within a cold storage */
const NIKASI_GATE_PASS_SEARCH_RESULT_LIMIT = 100;

const billBookPopulate = {
  path: 'billBookId',
  select: 'name',
} as const;

function liveBillBookName(billBookId: unknown): string | undefined {
  if (
    billBookId &&
    typeof billBookId === 'object' &&
    'name' in billBookId &&
    typeof (billBookId as { name?: unknown }).name === 'string'
  ) {
    return (billBookId as { name: string }).name;
  }

  return undefined;
}

function withLiveBillBookName<
  T extends { billBookId?: unknown; billBook?: string },
>(doc: T): T {
  const name = liveBillBookName(doc.billBookId);
  if (name !== undefined) {
    doc.billBook = name;
  }

  return doc;
}

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

export interface BookingBagSizeLean {
  size: string;
  variety: string;
  currentQuantity: number;
}

export interface BookingLean {
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

export interface ShedPassLean {
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

export interface RequestedBagLine {
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

export function computeFifoBookingDeductions(
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
): Promise<BookingDeduction[]> {
  const bookings = await Booking.find({
    dispatchLedgerId: new Types.ObjectId(dispatchLedgerId),
  })
    .sort({ date: 1, gatePassNo: 1 })
    .select('bagSizes')
    .session(session)
    .lean<BookingLean[]>();

  const deductions = computeFifoBookingDeductions(bookings, lines);
  if (deductions.length === 0) {
    return [];
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

  return deductions;
}

export function computeFifoShedDeductions(
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

async function applyShedFifoDeductions(
  coldStorageId: string,
  lines: RequestedBagLine[],
  session: ClientSession
): Promise<ShedDeduction[]> {
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
    return [];
  }

  for (const deduction of deductions) {
    const updateResult = await OutgoingGatePass.updateOne(
      { _id: deduction.outgoingGatePassId },
      {
        $inc: {
          'orderDetails.$[elem].quantityIssued': -deduction.deductAmount,
        },
      },
      {
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
        session,
      }
    );

    if (updateResult.modifiedCount !== 1) {
      throw new ConflictError(
        `Expected 1 shed update, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
        'CONCURRENT_MODIFICATION'
      );
    }
  }

  return deductions;
}

function toStoredShedDeductions(
  deductions: ShedDeduction[]
): INikasiShedDeduction[] {
  return deductions.map((deduction) => ({
    outgoingGatePassId: deduction.outgoingGatePassId,
    size: deduction.size,
    bagType: deduction.bagType,
    chamber: deduction.chamber,
    floor: deduction.floor,
    row: deduction.row,
    quantity: deduction.deductAmount,
  }));
}

function toStoredBookingDeductions(
  deductions: BookingDeduction[]
): INikasiBookingDeduction[] {
  return deductions.map((deduction) => ({
    bookingId: deduction.bookingId,
    size: deduction.size,
    variety: deduction.variety,
    quantity: deduction.deductAmount,
  }));
}

function issuedBagCount(bagSize: Array<{ quantityIssued: number }>): number {
  return bagSize.reduce((total, line) => total + line.quantityIssued, 0);
}

function shedLineMatches(
  detail: {
    size: string;
    bagType: string;
    chamber: string;
    floor: string;
    row: string;
  },
  deduction: INikasiShedDeduction
): boolean {
  return (
    detail.size === deduction.size &&
    detail.bagType === deduction.bagType &&
    detail.chamber === deduction.chamber &&
    detail.floor === deduction.floor &&
    detail.row === deduction.row
  );
}

async function assertShedDeductionsRestorable(
  deductions: INikasiShedDeduction[],
  session: ClientSession
): Promise<void> {
  const ids = [
    ...new Set(
      deductions.map((deduction) => deduction.outgoingGatePassId.toString())
    ),
  ];
  if (ids.length === 0) {
    return;
  }

  const passes = await OutgoingGatePass.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  })
    .select('status orderDetails')
    .session(session)
    .lean();

  const passesById = new Map(passes.map((pass) => [pass._id.toString(), pass]));

  for (const deduction of deductions) {
    if (deduction.quantity <= 0) {
      continue;
    }

    const pass = passesById.get(deduction.outgoingGatePassId.toString());
    if (!pass) {
      throw new NotFoundError(
        'Outgoing gate pass for a stored deduction was not found',
        'OUTGOING_GATE_PASS_NOT_FOUND'
      );
    }

    if (pass.status !== OutgoingGatePassStatus.ACTIVE) {
      throw new ValidationError(
        'Outgoing gate pass is not active, so its quantity cannot be restored',
        'OUTGOING_GATE_PASS_NOT_ACTIVE'
      );
    }

    const matches = (pass.orderDetails ?? []).filter((detail) =>
      shedLineMatches(detail, deduction)
    );
    if (matches.length !== 1) {
      throw new ValidationError(
        `Expected 1 outgoing line for size "${deduction.size}" at ${deduction.chamber}/${deduction.floor}/${deduction.row}, found ${matches.length}`,
        'SHED_LINE_NOT_FOUND'
      );
    }
  }
}

async function assertBookingDeductionsRestorable(
  deductions: INikasiBookingDeduction[],
  session: ClientSession
): Promise<void> {
  const ids = [
    ...new Set(deductions.map((deduction) => deduction.bookingId.toString())),
  ];
  const bookings = await Booking.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  })
    .select('bagSizes')
    .session(session)
    .lean();

  const bookingsById = new Map(
    bookings.map((booking) => [booking._id.toString(), booking])
  );

  for (const deduction of deductions) {
    if (deduction.quantity <= 0) {
      continue;
    }

    const booking = bookingsById.get(deduction.bookingId.toString());
    if (!booking) {
      throw new NotFoundError(
        'Booking for a stored deduction was not found',
        'BOOKING_NOT_FOUND'
      );
    }

    const matches = (booking.bagSizes ?? []).filter(
      (line) =>
        line.size === deduction.size && line.variety === deduction.variety
    );
    if (matches.length !== 1) {
      throw new ValidationError(
        `Expected 1 booking line for size "${deduction.size}" variety "${deduction.variety}", found ${matches.length}`,
        'BOOKING_LINE_NOT_FOUND'
      );
    }
  }
}

/**
 * Creates a nikasi gate pass. Always deducts bag lines from ACTIVE outgoing-to-shed
 * stock for the cold storage (FIFO by date, gatePassNo). When isBooked is true,
 * also deducts the same lines from booking gate passes for the dispatch ledger.
 * The exact lines deducted are stored on the pass so they can be restored later.
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
        .populate(billBookPopulate)
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
        return withLiveBillBookName(existing) as INikasiGatePass;
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

    const shedDeductions = await applyShedFifoDeductions(
      coldStorageId,
      payload.bagSize,
      session
    );

    const bookingDeductions = payload.isBooked
      ? await applyBookingFifoDeductions(
          payload.dispatchLedgerId,
          payload.bagSize,
          session
        )
      : [];

    const billBook = await getActiveBillBookById(
      payload.billBookId,
      coldStorageId,
      session
    );

    const amountPaise = billedPaiseFromBagLines(payload.bagSize);
    if (amountPaise <= 0) {
      throw new ValidationError(
        'Billed amount must be greater than zero',
        'BILLED_AMOUNT_REQUIRED'
      );
    }

    const bags = payload.bagSize.reduce(
      (total, line) => total + line.quantityIssued,
      0
    );

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
      billBookId: billBook._id,
      ...(payload.biltiBook !== undefined && { biltiBook: payload.biltiBook }),
      category: payload.category,
      date: payload.date,
      ...(payload.from !== undefined && { from: payload.from }),
      ...(payload.to !== undefined && { to: payload.to }),
      ...(payload.truckNumber !== undefined && {
        truckNumber: payload.truckNumber,
      }),
      ...(payload.transportCompany !== undefined && {
        transportCompany: payload.transportCompany,
      }),
      ...(payload.LSNumber !== undefined && {
        LSNumber: payload.LSNumber,
      }),
      ...(payload.driverName !== undefined && {
        driverName: payload.driverName,
      }),
      ...(payload.driverMobile !== undefined && {
        driverMobile: payload.driverMobile,
      }),
      ...(payload.owner !== undefined && { owner: payload.owner }),
      bagSize: payload.bagSize,
      status: NikasiGatePassStatus.ACTIVE,
      shedDeductions: toStoredShedDeductions(shedDeductions),
      bookingDeductions: toStoredBookingDeductions(bookingDeductions),
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

    await postFinanceSaleFromNikasi({
      coldStorageId: new Types.ObjectId(coldStorageId),
      ...(createdBy && { createdBy: new Types.ObjectId(createdBy) }),
      nikasi: {
        _id: nikasiGatePass._id as Types.ObjectId,
        date: nikasiGatePass.date,
        gatePassNo: nikasiGatePass.gatePassNo,
        ...(payload.billNumber !== undefined && {
          billNumber: payload.billNumber,
        }),
        billBookId: billBook._id as Types.ObjectId,
        billBookName: billBook.name,
        dispatchLedgerId: dispatchLedger._id as Types.ObjectId,
        dispatchLedgerName: dispatchLedger.name,
        bags,
        ...(payload.netWeight !== undefined && {
          netWeight: payload.netWeight,
        }),
        amountPaise,
      },
      session,
    });

    await session.commitTransaction();
    await nikasiGatePass.populate(billBookPopulate);
    return withLiveBillBookName(nikasiGatePass);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleServiceError(error, logger);
  } finally {
    session.endSession();
  }
}

/**
 * Marks a nikasi gate pass null: restores the outgoing and booking quantities
 * recorded at create time, voids the finance sale, and keeps the document so
 * its gate pass number stays taken.
 */
export async function markNikasiGatePassNull(
  coldStorageId: string,
  nikasiGatePassId: string,
  logger?: FastifyBaseLogger,
  nulledBy?: string
): Promise<INikasiGatePass> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  if (!mongoose.Types.ObjectId.isValid(nikasiGatePassId)) {
    throw new ValidationError(
      'Invalid nikasi gate pass ID format',
      'INVALID_NIKASI_GATE_PASS_ID'
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const coldStorageObjectId = new Types.ObjectId(coldStorageId);
    const dispatchLedgerIds = await DispatchLedger.find({
      coldStorageId: coldStorageObjectId,
    })
      .session(session)
      .distinct('_id');

    const nikasi = await NikasiGatePass.findOne({
      _id: new Types.ObjectId(nikasiGatePassId),
      dispatchLedgerId: { $in: dispatchLedgerIds },
    }).session(session);

    if (!nikasi) {
      throw new NotFoundError(
        'Nikasi gate pass not found',
        'NIKASI_GATE_PASS_NOT_FOUND'
      );
    }

    if (nikasi.status === NikasiGatePassStatus.NULL) {
      throw new ConflictError(
        'Nikasi gate pass is already null',
        'NIKASI_GATE_PASS_ALREADY_NULL'
      );
    }

    const bags = issuedBagCount(nikasi.bagSize);
    const shedDeductions = nikasi.shedDeductions ?? [];
    const bookingDeductions = nikasi.bookingDeductions ?? [];

    if (bags > 0 && shedDeductions.length === 0) {
      throw new ValidationError(
        'Shed deductions are not recorded for this gate pass',
        'MISSING_SHED_DEDUCTIONS'
      );
    }

    if (nikasi.isBooked && bags > 0 && bookingDeductions.length === 0) {
      throw new ValidationError(
        'Booking deductions are not recorded for this gate pass',
        'MISSING_BOOKING_DEDUCTIONS'
      );
    }

    await assertShedDeductionsRestorable(shedDeductions, session);
    if (bookingDeductions.length > 0) {
      await assertBookingDeductionsRestorable(bookingDeductions, session);
    }

    await assertFinanceSaleCanBeNulled({
      coldStorageId: coldStorageObjectId,
      dispatchId: nikasi._id as Types.ObjectId,
      session,
    });

    for (const deduction of shedDeductions) {
      if (deduction.quantity <= 0) {
        continue;
      }

      const updateResult = await OutgoingGatePass.updateOne(
        {
          _id: deduction.outgoingGatePassId,
          status: OutgoingGatePassStatus.ACTIVE,
        },
        {
          $inc: {
            'orderDetails.$[elem].quantityIssued': deduction.quantity,
          },
        },
        {
          arrayFilters: [
            {
              'elem.size': deduction.size,
              'elem.bagType': deduction.bagType,
              'elem.chamber': deduction.chamber,
              'elem.floor': deduction.floor,
              'elem.row': deduction.row,
            },
          ],
          session,
        }
      );

      if (updateResult.modifiedCount !== 1) {
        throw new ConflictError(
          'Outgoing gate pass quantity could not be restored',
          'CONCURRENT_MODIFICATION'
        );
      }
    }

    for (const deduction of bookingDeductions) {
      if (deduction.quantity <= 0) {
        continue;
      }

      const updateResult = await Booking.updateOne(
        {
          _id: deduction.bookingId,
          bagSizes: {
            $elemMatch: {
              size: deduction.size,
              variety: deduction.variety,
            },
          },
        },
        {
          $inc: {
            'bagSizes.$.currentQuantity': deduction.quantity,
          },
        },
        { session }
      );

      if (updateResult.modifiedCount !== 1) {
        throw new ConflictError(
          'Booking quantity could not be restored',
          'CONCURRENT_MODIFICATION'
        );
      }
    }

    const nulledAt = new Date();
    const updated = await NikasiGatePass.findOneAndUpdate(
      {
        _id: nikasi._id,
        status: { $ne: NikasiGatePassStatus.NULL },
      },
      {
        $set: {
          status: NikasiGatePassStatus.NULL,
          nulledAt,
          ...(nulledBy && mongoose.Types.ObjectId.isValid(nulledBy)
            ? { nulledBy: new Types.ObjectId(nulledBy) }
            : {}),
        },
      },
      { session, returnDocument: 'after' }
    );

    if (!updated) {
      throw new ConflictError(
        'Nikasi gate pass could not be marked null',
        'CONCURRENT_MODIFICATION'
      );
    }

    await voidFinanceSaleForDispatch({
      coldStorageId: coldStorageObjectId,
      dispatchId: nikasi._id as Types.ObjectId,
      session,
    });

    await session.commitTransaction();
    await updated.populate(billBookPopulate);
    return withLiveBillBookName(updated);
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
      status: { $ne: NikasiGatePassStatus.NULL },
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
        .populate(billBookPopulate)
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
      nikasiGatePasses: nikasiGatePasses.map((pass) =>
        withLiveBillBookName(pass)
      ) as unknown as Array<Record<string, unknown>>,
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

    const matchingBillBooks = await BillBook.find({
      coldStorageId: new Types.ObjectId(coldStorageId),
      name: String(number),
    })
      .select('_id')
      .lean();

    const billBookMatch =
      matchingBillBooks.length > 0
        ? [{ billBookId: { $in: matchingBillBooks.map((book) => book._id) } }]
        : [];

    const filter = {
      $and: [
        { dispatchLedgerId: { $in: dispatchLedgerIds } },
        { status: { $ne: NikasiGatePassStatus.NULL } },
        {
          $or: [
            { gatePassNo: number },
            { manualGatePassNumber: number },
            { billNumber: number },
            { bitliNumber: number },
            { billBook: String(number) },
            { biltiBook: String(number) },
            ...billBookMatch,
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
      .populate(billBookPopulate)
      .sort({ gatePassNo: -1, date: -1 })
      .limit(NIKASI_GATE_PASS_SEARCH_RESULT_LIMIT)
      .lean();

    logger?.info(
      { coldStorageId, number, count: nikasiGatePasses.length },
      'Searched nikasi gate passes by number'
    );

    return {
      nikasiGatePasses: nikasiGatePasses.map((pass) =>
        withLiveBillBookName(pass)
      ) as unknown as Array<Record<string, unknown>>,
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
  status?: 'ACTIVE' | 'NULL';
  manualGatePassNumber?: number;
  isBooked?: boolean;
  billNumber?: number;
  bitliNumber?: number;
  billBookId?:
    | unknown
    | {
        _id?: unknown;
        name?: string;
      };
  billBook?: string;
  biltiBook?: string;
  category: string;
  date?: Date | string;
  from?: string;
  to?: string;
  truckNumber?: string;
  transportCompany?: string;
  LSNumber?: string;
  driverName?: string;
  driverMobile?: string;
  owner?: string;
  bagSize?: Array<{
    size: string;
    variety: string;
    quantityIssued: number;
    costPerBag?: number;
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
    status: pass.status ?? 'ACTIVE',
    date: formatReportDateTime(pass.date),
    category: pass.category,
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

  if (pass.billBookId != null) {
    const populated =
      typeof pass.billBookId === 'object' &&
      pass.billBookId !== null &&
      '_id' in pass.billBookId
        ? (pass.billBookId as { _id?: unknown; name?: string })
        : undefined;
    const billBookId = toObjectIdString(populated?._id ?? pass.billBookId);
    if (billBookId) {
      report.billBookId = billBookId;
    }
    const liveName = populated?.name ?? pass.billBook;
    if (liveName != null) {
      report.billBook = liveName;
    }
  } else if (pass.billBook != null) {
    report.billBook = pass.billBook;
  }

  if (pass.biltiBook != null) {
    report.biltiBook = pass.biltiBook;
  }

  if (pass.from != null && pass.from !== '') {
    report.from = pass.from;
  }

  if (pass.to != null) {
    report.to = pass.to;
  }

  if (pass.truckNumber != null) {
    report.truckNumber = pass.truckNumber;
  }

  if (pass.transportCompany != null) {
    report.transportCompany = pass.transportCompany;
  }

  if (pass.LSNumber != null) {
    report.LSNumber = pass.LSNumber;
  }

  if (pass.driverName != null) {
    report.driverName = pass.driverName;
  }

  if (pass.driverMobile != null) {
    report.driverMobile = pass.driverMobile;
  }

  if (pass.owner != null) {
    report.owner = pass.owner;
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
      status: { $ne: NikasiGatePassStatus.NULL },
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
      .populate(billBookPopulate)
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
