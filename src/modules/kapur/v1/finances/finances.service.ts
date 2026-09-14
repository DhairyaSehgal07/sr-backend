import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';
import { DispatchLedger } from '../dispatch-ledger/dispatch-ledger.model.js';
import { getActiveBillBookById } from '../bill-book/bill-book.service.js';
import { FinanceSale } from './finance-sale.model.js';
import {
  FinanceRecovery,
  type IFinanceRecoveryAllocation,
} from './finance-recovery.model.js';
import {
  FinanceJournal,
  type FinanceJournalSourceCollection,
  type IFinanceJournalLine,
} from './finance-journal.model.js';
import { saleStatusFromAmounts } from './money.js';
import type {
  CreateFinanceRecoveryInput,
  GetFinanceListQuery,
} from './finances.schema.js';

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

function handleServiceError(
  error: unknown,
  logger: FastifyBaseLogger | undefined,
  fallbackMessage: string,
  fallbackCode: string
): never {
  if (
    error instanceof ConflictError ||
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof AppError
  ) {
    throw error;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(error.errors).map((err) => err.message);
    throw new ValidationError(messages.join(', '), 'MONGOOSE_VALIDATION_ERROR');
  }

  if (isDuplicateKeyError(error)) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
  }

  logger?.error({ error }, fallbackMessage);

  throw new AppError(fallbackMessage, 500, fallbackCode);
}

function assertBalancedJournal(lines: IFinanceJournalLine[]) {
  const debitPaise = lines.reduce((sum, line) => sum + line.debitPaise, 0);
  const creditPaise = lines.reduce((sum, line) => sum + line.creditPaise, 0);

  if (debitPaise !== creditPaise) {
    throw new ValidationError(
      'Journal lines must balance (debits equal credits)',
      'JOURNAL_UNBALANCED'
    );
  }
}

async function insertJournal(params: {
  coldStorageId: Types.ObjectId;
  date: Date;
  voucherType: 'sale' | 'recovery';
  sourceCollection: FinanceJournalSourceCollection;
  sourceId: Types.ObjectId;
  narration: string;
  lines: IFinanceJournalLine[];
  createdBy?: Types.ObjectId;
  session: ClientSession;
}) {
  assertBalancedJournal(params.lines);

  const journal = new FinanceJournal({
    coldStorageId: params.coldStorageId,
    date: params.date,
    voucherType: params.voucherType,
    source: {
      collection: params.sourceCollection,
      id: params.sourceId,
    },
    narration: params.narration,
    lines: params.lines,
    ...(params.createdBy && { createdBy: params.createdBy }),
  });

  await journal.save({ session: params.session });
}

export interface PostFinanceSaleFromNikasiParams {
  coldStorageId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  nikasi: {
    _id: Types.ObjectId;
    date: Date;
    gatePassNo: number;
    billNumber?: number;
    billBookId: Types.ObjectId;
    billBookName: string;
    dispatchLedgerId: Types.ObjectId;
    dispatchLedgerName: string;
    bags: number;
    netWeight?: number;
    amountPaise: number;
  };
  session: ClientSession;
}

export async function postFinanceSaleFromNikasi(
  params: PostFinanceSaleFromNikasiParams
) {
  const { nikasi, coldStorageId, createdBy, session } = params;

  const sale = new FinanceSale({
    coldStorageId,
    dispatchId: nikasi._id,
    date: nikasi.date,
    gatePassNo: nikasi.gatePassNo,
    billBookId: nikasi.billBookId,
    billBookName: nikasi.billBookName,
    ...(nikasi.billNumber !== undefined && { billNumber: nikasi.billNumber }),
    dispatchLedgerId: nikasi.dispatchLedgerId,
    dispatchLedgerName: nikasi.dispatchLedgerName,
    bags: nikasi.bags,
    ...(nikasi.netWeight !== undefined && { netWeight: nikasi.netWeight }),
    amountPaise: nikasi.amountPaise,
    recoveredPaise: 0,
    outstandingPaise: nikasi.amountPaise,
    status: saleStatusFromAmounts(nikasi.amountPaise, 0),
    ...(createdBy && { createdBy }),
  });

  await sale.save({ session });

  await insertJournal({
    coldStorageId,
    date: nikasi.date,
    voucherType: 'sale',
    sourceCollection: 'finance_sales',
    sourceId: sale._id as Types.ObjectId,
    narration: `Sale from gate pass ${nikasi.gatePassNo} — ${nikasi.dispatchLedgerName} / ${nikasi.billBookName}`,
    lines: [
      {
        account: 'dispatch_ledger',
        dispatchLedgerId: nikasi.dispatchLedgerId,
        debitPaise: nikasi.amountPaise,
        creditPaise: 0,
      },
      {
        account: 'sales',
        debitPaise: 0,
        creditPaise: nikasi.amountPaise,
      },
    ],
    createdBy,
    session,
  });

  return sale;
}

function coldStorageFilter(
  coldStorageId: string,
  query: GetFinanceListQuery
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    coldStorageId: new Types.ObjectId(coldStorageId),
  };

  if (query.billBookId) {
    validateObjectId(
      query.billBookId,
      'Invalid bill book ID format',
      'INVALID_BILL_BOOK_ID'
    );
    filter.billBookId = new Types.ObjectId(query.billBookId);
  }

  return filter;
}

export async function createFinanceRecovery(
  coldStorageId: string,
  payload: CreateFinanceRecoveryInput,
  logger?: FastifyBaseLogger,
  createdBy?: string
) {
  validateObjectId(
    coldStorageId,
    'Invalid cold storage ID format',
    'INVALID_COLD_STORAGE_ID'
  );

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const coldStorageObjectId = new Types.ObjectId(coldStorageId);
    const createdByObjectId =
      createdBy && mongoose.Types.ObjectId.isValid(createdBy)
        ? new Types.ObjectId(createdBy)
        : undefined;

    // Session-bound reads must be sequential: parallel ops on one ClientSession
    // fail with ConflictingOperationInProgress (Mongo 117) on Atlas.
    const billBook = await getActiveBillBookById(
      payload.billBookId,
      coldStorageId,
      session
    );
    const dispatchLedger = await DispatchLedger.findOne({
      _id: new Types.ObjectId(payload.dispatchLedgerId),
      coldStorageId: coldStorageObjectId,
    })
      .session(session)
      .lean();

    if (!dispatchLedger) {
      throw new NotFoundError(
        'Dispatch ledger not found',
        'DISPATCH_LEDGER_NOT_FOUND'
      );
    }

    const outstandingAgg = await FinanceSale.aggregate<{
      outstandingPaise: number;
    }>([
      {
        $match: {
          coldStorageId: coldStorageObjectId,
          dispatchLedgerId: dispatchLedger._id,
          billBookId: billBook._id,
        },
      },
      {
        $group: {
          _id: null,
          outstandingPaise: { $sum: '$outstandingPaise' },
        },
      },
    ]).session(session);

    const outstandingPaise = outstandingAgg[0]?.outstandingPaise ?? 0;

    if (payload.amountPaise > outstandingPaise) {
      throw new ValidationError(
        `Recovery amount exceeds outstanding of ${outstandingPaise} paise for this party and bill book`,
        'RECOVERY_EXCEEDS_OUTSTANDING'
      );
    }

    const openSales = await FinanceSale.find({
      coldStorageId: coldStorageObjectId,
      dispatchLedgerId: dispatchLedger._id,
      billBookId: billBook._id,
      status: { $in: ['open', 'partial'] },
    })
      .sort({ date: 1, gatePassNo: 1 })
      .session(session);

    let remaining = payload.amountPaise;
    const allocations: IFinanceRecoveryAllocation[] = [];

    for (const sale of openSales) {
      if (remaining <= 0) {
        break;
      }

      const applyPaise = Math.min(sale.outstandingPaise, remaining);
      if (applyPaise <= 0) {
        continue;
      }

      sale.recoveredPaise += applyPaise;
      sale.outstandingPaise = sale.amountPaise - sale.recoveredPaise;
      sale.status = saleStatusFromAmounts(
        sale.amountPaise,
        sale.recoveredPaise
      );
      await sale.save({ session });

      allocations.push({
        saleId: sale._id as Types.ObjectId,
        amountPaise: applyPaise,
      });
      remaining -= applyPaise;
    }

    if (remaining > 0 || allocations.length === 0) {
      throw new ValidationError(
        'Unable to allocate recovery against open sales',
        'RECOVERY_ALLOCATION_FAILED'
      );
    }

    const recovery = new FinanceRecovery({
      coldStorageId: coldStorageObjectId,
      date: payload.date,
      dispatchLedgerId: dispatchLedger._id,
      dispatchLedgerName: dispatchLedger.name,
      billBookId: billBook._id,
      billBookName: billBook.name,
      amountPaise: payload.amountPaise,
      ...(payload.remark !== undefined && { remark: payload.remark }),
      allocations,
      ...(createdByObjectId && { createdBy: createdByObjectId }),
    });

    await recovery.save({ session });

    await insertJournal({
      coldStorageId: coldStorageObjectId,
      date: payload.date,
      voucherType: 'recovery',
      sourceCollection: 'finance_recoveries',
      sourceId: recovery._id as Types.ObjectId,
      narration: `Recovery from ${dispatchLedger.name} / ${billBook.name}`,
      lines: [
        {
          account: 'cash',
          debitPaise: payload.amountPaise,
          creditPaise: 0,
        },
        {
          account: 'dispatch_ledger',
          dispatchLedgerId: dispatchLedger._id,
          debitPaise: 0,
          creditPaise: payload.amountPaise,
        },
      ],
      createdBy: createdByObjectId,
      session,
    });

    await session.commitTransaction();

    logger?.info(
      {
        recoveryId: recovery._id,
        coldStorageId,
        amountPaise: payload.amountPaise,
        allocationCount: allocations.length,
      },
      'Finance recovery created'
    );

    return recovery.toObject();
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleServiceError(
      error,
      logger,
      'Failed to create finance recovery',
      'CREATE_FINANCE_RECOVERY_ERROR'
    );
  } finally {
    session.endSession();
  }
}

export async function getFinanceSummary(
  coldStorageId: string,
  query: GetFinanceListQuery,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const match = coldStorageFilter(coldStorageId, query);

    const [salesAgg, recoveryAgg] = await Promise.all([
      FinanceSale.aggregate<{
        billedPaise: number;
        recoveredPaise: number;
        outstandingPaise: number;
        saleCount: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            billedPaise: { $sum: '$amountPaise' },
            recoveredPaise: { $sum: '$recoveredPaise' },
            outstandingPaise: { $sum: '$outstandingPaise' },
            saleCount: { $sum: 1 },
          },
        },
      ]),
      FinanceRecovery.aggregate<{
        recoveredPaise: number;
        recoveryCount: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            recoveredPaise: { $sum: '$amountPaise' },
            recoveryCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const billedPaise = salesAgg[0]?.billedPaise ?? 0;
    const recoveredFromSales = salesAgg[0]?.recoveredPaise ?? 0;
    const recoveredFromRecoveries = recoveryAgg[0]?.recoveredPaise ?? 0;
    const outstandingPaise =
      salesAgg[0]?.outstandingPaise ?? billedPaise - recoveredFromRecoveries;

    const summary = {
      billedPaise,
      recoveredPaise: recoveredFromRecoveries,
      outstandingPaise,
      saleCount: salesAgg[0]?.saleCount ?? 0,
      recoveryCount: recoveryAgg[0]?.recoveryCount ?? 0,
    };

    logger?.info(
      {
        coldStorageId,
        billBookId: query.billBookId,
        ...summary,
        recoveredPaiseCachedOnSales: recoveredFromSales,
      },
      'Retrieved finance summary'
    );

    return summary;
  } catch (error) {
    handleServiceError(
      error,
      logger,
      'Failed to retrieve finance summary',
      'GET_FINANCE_SUMMARY_ERROR'
    );
  }
}

export async function getFinanceSales(
  coldStorageId: string,
  query: GetFinanceListQuery,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const sales = await FinanceSale.find(
      coldStorageFilter(coldStorageId, query)
    )
      .sort({ date: -1, gatePassNo: -1 })
      .lean();

    logger?.info(
      { coldStorageId, billBookId: query.billBookId, count: sales.length },
      'Retrieved finance sales'
    );

    return sales;
  } catch (error) {
    handleServiceError(
      error,
      logger,
      'Failed to retrieve finance sales',
      'GET_FINANCE_SALES_ERROR'
    );
  }
}

export async function getFinanceOutstanding(
  coldStorageId: string,
  query: GetFinanceListQuery,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const outstanding = await FinanceSale.aggregate([
      {
        $match: {
          ...coldStorageFilter(coldStorageId, query),
          outstandingPaise: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            dispatchLedgerId: '$dispatchLedgerId',
            billBookId: '$billBookId',
          },
          dispatchLedgerName: { $last: '$dispatchLedgerName' },
          billBookName: { $last: '$billBookName' },
          billedPaise: { $sum: '$amountPaise' },
          recoveredPaise: { $sum: '$recoveredPaise' },
          outstandingPaise: { $sum: '$outstandingPaise' },
        },
      },
      {
        $project: {
          _id: 0,
          dispatchLedgerId: '$_id.dispatchLedgerId',
          billBookId: '$_id.billBookId',
          dispatchLedgerName: 1,
          billBookName: 1,
          billedPaise: 1,
          recoveredPaise: 1,
          outstandingPaise: 1,
        },
      },
      { $sort: { dispatchLedgerName: 1, billBookName: 1 } },
    ]);

    logger?.info(
      {
        coldStorageId,
        billBookId: query.billBookId,
        count: outstanding.length,
      },
      'Retrieved finance outstanding'
    );

    return outstanding;
  } catch (error) {
    handleServiceError(
      error,
      logger,
      'Failed to retrieve finance outstanding',
      'GET_FINANCE_OUTSTANDING_ERROR'
    );
  }
}

export async function getFinanceRecoveries(
  coldStorageId: string,
  query: GetFinanceListQuery,
  logger?: FastifyBaseLogger
) {
  try {
    validateObjectId(
      coldStorageId,
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );

    const recoveries = await FinanceRecovery.find(
      coldStorageFilter(coldStorageId, query)
    )
      .sort({ date: -1, createdAt: -1 })
      .lean();

    logger?.info(
      {
        coldStorageId,
        billBookId: query.billBookId,
        count: recoveries.length,
      },
      'Retrieved finance recoveries'
    );

    return recoveries;
  } catch (error) {
    handleServiceError(
      error,
      logger,
      'Failed to retrieve finance recoveries',
      'GET_FINANCE_RECOVERIES_ERROR'
    );
  }
}
