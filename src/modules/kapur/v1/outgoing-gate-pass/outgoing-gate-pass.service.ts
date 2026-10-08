import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  OutgoingGatePass,
  OutgoingGatePassStatus,
  type IOutgoingOrderDetail,
} from './outgoing-gate-pass.model.js';
import {
  OutgoingGatePassAudit,
  OutgoingGatePassAuditAction,
  type OutgoingGatePassAuditState,
} from './outgoing-gate-pass-audit.model.js';
import { FarmerStorageLink } from '../farmer-storage-link/farmer-storage-link.model.js';
import type {
  CancelOutgoingGatePassInput,
  CreateOutgoingGatePassInput,
  UpdateOutgoingGatePassInput,
} from './outgoing-gate-pass.schema.js';
import { DIRECT_SALE_CATEGORY } from './outgoing-gate-pass.schema.js';
import { DispatchLedger } from '../dispatch-ledger/dispatch-ledger.model.js';
import { getActiveBillBookById } from '../bill-book/bill-book.service.js';
import { rupeesToPaise } from '../finances/money.js';
import { postFinanceSaleFromNikasi } from '../finances/finances.service.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../../../../utils/errors.js';

const OUTGOING_GATE_PASS_EDITABLE_FIELDS = [
  'manualGatePassNumber',
  'date',
  'from',
  'to',
  'truckNumber',
  'transportCompany',
  'LSNumber',
  'driverName',
  'driverMobile',
  'owner',
  'shed',
  'remarks',
  'billNumber',
  'biltiNumber',
  'billBook',
  'biltiBook',
  'category',
  'costPerBag',
  'pre-sowing-treatment',
] as const;

const OUTGOING_GATE_PASS_NULLABLE_UPDATE_FIELDS = [
  'manualGatePassNumber',
  'from',
  'to',
  'truckNumber',
  'transportCompany',
  'LSNumber',
  'driverName',
  'driverMobile',
  'owner',
  'shed',
  'billNumber',
  'biltiNumber',
  'billBook',
  'biltiBook',
  'category',
  'costPerBag',
] as const;

function serializeOutgoingAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  return value;
}

function outgoingAuditValuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  return a === b;
}

function buildOutgoingGatePassAuditDiff(
  existing: Record<string, unknown>,
  payload: UpdateOutgoingGatePassInput
): {
  previousState: OutgoingGatePassAuditState;
  modifiedState: OutgoingGatePassAuditState;
} {
  const previousState: OutgoingGatePassAuditState = {};
  const modifiedState: OutgoingGatePassAuditState = {};

  for (const field of OUTGOING_GATE_PASS_EDITABLE_FIELDS) {
    if (payload[field] === undefined) {
      continue;
    }

    const oldValue = existing[field];
    const newValue = payload[field];

    if (!outgoingAuditValuesEqual(oldValue, newValue)) {
      if (oldValue !== undefined) {
        previousState[field] = serializeOutgoingAuditValue(oldValue);
      }
      modifiedState[field] = serializeOutgoingAuditValue(newValue);
    }
  }

  return { previousState, modifiedState };
}

/* =======================
   ORDER DETAILS
======================= */

function buildOrderDetails(
  payload: CreateOutgoingGatePassInput
): IOutgoingOrderDetail[] {
  const lines = payload.orderDetails.filter((line) => line.quantity > 0);

  if (lines.length === 0) {
    throw new ValidationError(
      'At least one order detail must have quantity greater than zero',
      'INVALID_ALLOCATION_QUANTITY'
    );
  }

  return lines.map((line) => ({
    size: line.size,
    bagType: line.bagType,
    quantityIssued: line.quantity,
    quantityAvailable: line.quantity,
    weightInKg: line.weightInKg,
    chamber: line.chamber,
    floor: line.floor,
    row: line.row,
  }));
}

/* =======================
   FARMER LINK / COLD STORAGE
======================= */

async function getFarmerStorageLinkIdsForColdStorage(
  coldStorageId: Types.ObjectId,
  session: ClientSession
): Promise<Types.ObjectId[]> {
  const FarmerStorageLink = mongoose.model('FarmerStorageLink');
  return FarmerStorageLink.find({ coldStorageId })
    .session(session)
    .distinct('_id')
    .lean();
}

async function assertFarmerStorageLinkInColdStorage(
  farmerStorageLinkId: string,
  coldStorageId: string,
  session: ClientSession,
  logger?: FastifyBaseLogger
): Promise<Types.ObjectId> {
  if (!mongoose.Types.ObjectId.isValid(farmerStorageLinkId)) {
    throw new ValidationError(
      'Invalid farmer storage link ID format',
      'INVALID_FARMER_STORAGE_LINK_ID'
    );
  }

  const FarmerStorageLink = mongoose.model('FarmerStorageLink');
  const link = await FarmerStorageLink.findById(farmerStorageLinkId)
    .session(session)
    .lean();

  if (!link) {
    logger?.warn(
      { farmerStorageLinkId },
      'Farmer storage link not found for outgoing gate pass'
    );
    throw new NotFoundError(
      'Farmer storage link not found',
      'FARMER_STORAGE_LINK_NOT_FOUND'
    );
  }

  const linkColdStorageId = (
    link as { coldStorageId?: Types.ObjectId }
  ).coldStorageId?.toString();

  if (linkColdStorageId !== coldStorageId) {
    throw new NotFoundError(
      'Farmer storage link not found',
      'FARMER_STORAGE_LINK_NOT_FOUND'
    );
  }

  return new Types.ObjectId(farmerStorageLinkId);
}

/* =======================
   REPLACES PASS VALIDATION
======================= */

async function validateReplacesOutgoingGatePass(
  replacesOutgoingGatePassId: string,
  farmerStorageLinkId: Types.ObjectId,
  session: ClientSession
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(replacesOutgoingGatePassId)) {
    throw new ValidationError(
      'Invalid replaces outgoing gate pass ID format',
      'INVALID_REPLACES_PASS_ID'
    );
  }

  const replaced = await OutgoingGatePass.findById(replacesOutgoingGatePassId)
    .session(session)
    .lean();

  if (!replaced) {
    throw new NotFoundError(
      'Replaced outgoing gate pass not found',
      'REPLACES_PASS_NOT_FOUND'
    );
  }

  if (replaced.status !== OutgoingGatePassStatus.CANCELLED) {
    throw new ValidationError(
      'Replaced outgoing gate pass must be cancelled',
      'REPLACES_PASS_NOT_CANCELLED'
    );
  }

  const replacedLinkId = (
    replaced.farmerStorageLinkId as Types.ObjectId
  ).toString();

  if (replacedLinkId !== farmerStorageLinkId.toString()) {
    throw new ValidationError(
      'Replaced outgoing gate pass must belong to the same farmer storage link',
      'REPLACES_PASS_LINK_MISMATCH'
    );
  }
}

/* =======================
   RESPONSE FORMATTING
======================= */

async function formatOutgoingGatePassResponse(
  outgoingGatePassId: Types.ObjectId
): Promise<Record<string, unknown>> {
  const populated = await OutgoingGatePass.findById(outgoingGatePassId)
    .populate({
      path: 'farmerStorageLinkId',
      select: 'accountNumber farmerId',
      populate: {
        path: 'farmerId',
        select: 'name address mobileNumber',
      },
    })
    .populate({ path: 'createdBy', select: 'name' })
    .populate({ path: 'dispatchLedgerId', select: 'name' })
    .populate({ path: 'billBookId', select: 'name' })
    .lean();

  if (!populated) {
    throw new NotFoundError(
      'Outgoing gate pass not found',
      'OUTGOING_GATE_PASS_NOT_FOUND'
    );
  }

  const raw = populated as unknown as Record<string, unknown>;
  type PopulatedLink = {
    accountNumber: number;
    farmerId: { name: string; address: string; mobileNumber: string };
  };
  type PopulatedAdmin = { _id: unknown; name: string };
  const populatedLink = raw.farmerStorageLinkId as
    PopulatedLink | null | undefined;
  const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;

  return {
    ...raw,
    'pre-sowing-treatment': raw['pre-sowing-treatment'] === true,
    farmerStorageLinkId:
      populatedLink && populatedLink.farmerId
        ? {
            name: populatedLink.farmerId.name,
            accountNumber: populatedLink.accountNumber,
            address: populatedLink.farmerId.address,
            mobileNumber: populatedLink.farmerId.mobileNumber,
          }
        : raw.farmerStorageLinkId,
    createdBy: populatedAdmin
      ? { _id: populatedAdmin._id, name: populatedAdmin.name }
      : raw.createdBy,
  };
}

/* =======================
   ERROR HANDLER
======================= */

function handleOutgoingServiceError(
  error: unknown,
  logger?: FastifyBaseLogger,
  options: {
    message?: string;
    code?: string;
  } = {}
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

  logger?.error(
    { err: error },
    'Unexpected error in outgoing gate pass service'
  );
  throw new AppError(
    options.message ?? 'Failed to process outgoing gate pass',
    500,
    options.code ?? 'OUTGOING_GATE_PASS_ERROR'
  );
}

async function assertOutgoingGatePassInColdStorage(
  outgoingGatePassId: string,
  coldStorageId: string,
  session: ClientSession,
  logger?: FastifyBaseLogger
) {
  if (!mongoose.Types.ObjectId.isValid(outgoingGatePassId)) {
    throw new ValidationError(
      'Invalid outgoing gate pass ID format',
      'INVALID_OUTGOING_GATE_PASS_ID'
    );
  }

  const outgoing = await OutgoingGatePass.findById(outgoingGatePassId)
    .session(session)
    .lean();

  if (!outgoing) {
    logger?.warn({ outgoingGatePassId }, 'Outgoing gate pass not found');
    throw new NotFoundError(
      'Outgoing gate pass not found',
      'OUTGOING_GATE_PASS_NOT_FOUND'
    );
  }

  const coldStorageObjectId = new Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await getFarmerStorageLinkIdsForColdStorage(
    coldStorageObjectId,
    session
  );

  const linkId = (outgoing.farmerStorageLinkId as Types.ObjectId).toString();
  const linkIds = farmerStorageLinkIds.map((id) => id.toString());

  if (!linkIds.includes(linkId)) {
    throw new NotFoundError(
      'Outgoing gate pass not found',
      'OUTGOING_GATE_PASS_NOT_FOUND'
    );
  }

  return outgoing;
}

async function findOutgoingGatePassInColdStorage(
  outgoingGatePassId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
) {
  if (!mongoose.Types.ObjectId.isValid(outgoingGatePassId)) {
    throw new ValidationError(
      'Invalid outgoing gate pass ID format',
      'INVALID_OUTGOING_GATE_PASS_ID'
    );
  }

  const outgoing = await OutgoingGatePass.findById(outgoingGatePassId).lean();

  if (!outgoing) {
    logger?.warn({ outgoingGatePassId }, 'Outgoing gate pass not found');
    throw new NotFoundError(
      'Outgoing gate pass not found',
      'OUTGOING_GATE_PASS_NOT_FOUND'
    );
  }

  const FarmerStorageLink = mongoose.model('FarmerStorageLink');
  const link = await FarmerStorageLink.findById(outgoing.farmerStorageLinkId)
    .select('coldStorageId')
    .lean();

  const linkColdStorageId = (
    link as { coldStorageId?: Types.ObjectId } | null
  )?.coldStorageId?.toString();

  if (!link || linkColdStorageId !== coldStorageId) {
    throw new NotFoundError(
      'Outgoing gate pass not found',
      'OUTGOING_GATE_PASS_NOT_FOUND'
    );
  }

  return outgoing;
}

/* =======================
   CREATE OUTGOING GATE PASS
======================= */

async function loadDirectSaleParty(
  coldStorageId: string,
  payload: CreateOutgoingGatePassInput,
  session: ClientSession
) {
  if (!payload.dispatchLedgerId || !payload.billBookId) {
    throw new ValidationError(
      'Dispatch ledger and bill book are required for Direct Sale',
      'DIRECT_SALE_PARTY_REQUIRED'
    );
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

  const billBook = await getActiveBillBookById(
    payload.billBookId,
    coldStorageId,
    session
  );

  return { dispatchLedger, billBook };
}

async function postDirectSaleFinance(params: {
  coldStorageId: Types.ObjectId;
  createdById?: string;
  outgoing: {
    _id: Types.ObjectId;
    date: Date;
    gatePassNo: number;
    billNumber?: number;
    costPerBag?: number;
    orderDetails: Array<{ quantityIssued: number }>;
  };
  dispatchLedger: { _id: Types.ObjectId; name: string };
  billBook: { _id: Types.ObjectId; name: string };
  session: ClientSession;
}) {
  const bags = params.outgoing.orderDetails.reduce(
    (total, line) => total + line.quantityIssued,
    0
  );
  const amountPaise = rupeesToPaise(params.outgoing.costPerBag ?? 0) * bags;

  if (amountPaise <= 0) {
    throw new ValidationError(
      'Billed amount must be greater than zero',
      'BILLED_AMOUNT_REQUIRED'
    );
  }

  await postFinanceSaleFromNikasi({
    coldStorageId: params.coldStorageId,
    ...(params.createdById && {
      createdBy: new Types.ObjectId(params.createdById),
    }),
    nikasi: {
      _id: params.outgoing._id,
      date: params.outgoing.date,
      gatePassNo: params.outgoing.gatePassNo,
      ...(params.outgoing.billNumber !== undefined && {
        billNumber: params.outgoing.billNumber,
      }),
      billBookId: params.billBook._id,
      billBookName: params.billBook.name,
      dispatchLedgerId: params.dispatchLedger._id,
      dispatchLedgerName: params.dispatchLedger.name,
      bags,
      amountPaise,
    },
    session: params.session,
  });
}

export async function createOutgoingGatePass(
  coldStorageId: string,
  payload: CreateOutgoingGatePassInput,
  logger?: FastifyBaseLogger,
  createdById?: string
): Promise<Record<string, unknown>> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const coldStorageObjectId = new Types.ObjectId(coldStorageId);
    const farmerStorageLinkObjectId =
      await assertFarmerStorageLinkInColdStorage(
        payload.farmerStorageLinkId,
        coldStorageId,
        session,
        logger
      );

    if (payload.idempotencyKey) {
      const existing = await OutgoingGatePass.findOne({
        idempotencyKey: payload.idempotencyKey,
      })
        .session(session)
        .lean();
      if (existing) {
        logger?.info(
          {
            idempotencyKey: payload.idempotencyKey,
            outgoingGatePassId: existing._id,
          },
          'Idempotency: returning existing outgoing gate pass'
        );
        await session.commitTransaction();
        return formatOutgoingGatePassResponse(existing._id as Types.ObjectId);
      }
    }

    const farmerStorageLinkIdsForColdStorage =
      await getFarmerStorageLinkIdsForColdStorage(coldStorageObjectId, session);

    const existingByGatePassNo = await OutgoingGatePass.findOne({
      gatePassNo: payload.gatePassNo,
      farmerStorageLinkId: { $in: farmerStorageLinkIdsForColdStorage },
    })
      .session(session)
      .lean();

    if (existingByGatePassNo) {
      throw new ConflictError(
        `Gate pass number ${payload.gatePassNo} already exists for this cold storage`,
        'GATE_PASS_NUMBER_EXISTS'
      );
    }

    if (payload.replacesOutgoingGatePassId) {
      await validateReplacesOutgoingGatePass(
        payload.replacesOutgoingGatePassId,
        farmerStorageLinkObjectId,
        session
      );
    }

    const orderDetails = buildOrderDetails(payload);

    const isDirectSale = payload.category === DIRECT_SALE_CATEGORY;
    const directSaleParty = isDirectSale
      ? await loadDirectSaleParty(coldStorageId, payload, session)
      : undefined;

    const doc = await OutgoingGatePass.create(
      [
        {
          farmerStorageLinkId: farmerStorageLinkObjectId,
          createdBy: createdById ? new Types.ObjectId(createdById) : undefined,
          gatePassNo: payload.gatePassNo,
          ...(payload.manualGatePassNumber !== undefined && {
            manualGatePassNumber: payload.manualGatePassNumber,
          }),
          date: payload.date,
          variety: payload.variety,
          ...(payload.from !== undefined && { from: payload.from }),
          ...(payload.to !== undefined && { to: payload.to }),
          ...(payload.truckNumber !== undefined && {
            truckNumber: payload.truckNumber,
          }),
          ...(payload.transportCompany && {
            transportCompany: payload.transportCompany,
          }),
          ...(payload.LSNumber && { LSNumber: payload.LSNumber }),
          ...(payload.driverName && { driverName: payload.driverName }),
          ...(payload.driverMobile && { driverMobile: payload.driverMobile }),
          ...(payload.owner && { owner: payload.owner }),
          ...(payload.shed && { shed: payload.shed }),
          ...(payload.billNumber !== undefined && {
            billNumber: payload.billNumber,
          }),
          ...(payload.biltiNumber !== undefined && {
            biltiNumber: payload.biltiNumber,
          }),
          ...(directSaleParty && {
            billBook: directSaleParty.billBook.name,
            billBookId: directSaleParty.billBook._id,
            dispatchLedgerId: directSaleParty.dispatchLedger._id,
          }),
          ...(!directSaleParty &&
            payload.billBook !== undefined && { billBook: payload.billBook }),
          ...(payload.biltiBook !== undefined && {
            biltiBook: payload.biltiBook,
          }),
          ...(payload.category !== undefined && { category: payload.category }),
          ...(payload.costPerBag !== undefined && {
            costPerBag: payload.costPerBag,
          }),
          ...(payload['pre-sowing-treatment'] !== undefined && {
            'pre-sowing-treatment': payload['pre-sowing-treatment'],
          }),
          orderDetails,
          remarks: payload.remarks,
          status: OutgoingGatePassStatus.ACTIVE,
          ...(payload.replacesOutgoingGatePassId && {
            replacesOutgoingGatePassId: new Types.ObjectId(
              payload.replacesOutgoingGatePassId
            ),
          }),
          idempotencyKey: payload.idempotencyKey,
        },
      ],
      { session }
    ).then((arr) => arr[0]);

    if (directSaleParty) {
      await postDirectSaleFinance({
        coldStorageId: coldStorageObjectId,
        createdById,
        outgoing: {
          _id: doc._id as Types.ObjectId,
          date: doc.date,
          gatePassNo: doc.gatePassNo,
          ...(doc.billNumber !== undefined && { billNumber: doc.billNumber }),
          costPerBag: doc.costPerBag,
          orderDetails: doc.orderDetails,
        },
        dispatchLedger: directSaleParty.dispatchLedger,
        billBook: directSaleParty.billBook,
        session,
      });
    }

    await session.commitTransaction();

    await OutgoingGatePassAudit.create({
      outgoingGatePassId: doc._id,
      action: OutgoingGatePassAuditAction.CREATE,
      performedById: createdById ? new Types.ObjectId(createdById) : undefined,
      previousState: {},
      modifiedState: {
        gatePassNo: doc.gatePassNo,
        status: OutgoingGatePassStatus.ACTIVE,
        farmerStorageLinkId: farmerStorageLinkObjectId.toString(),
        variety: doc.variety,
        date: doc.date.toISOString(),
      },
    });

    logger?.info(
      {
        outgoingGatePassId: doc._id,
        farmerStorageLinkId: payload.farmerStorageLinkId,
        gatePassNo: doc.gatePassNo,
      },
      'Outgoing gate pass created successfully'
    );

    return formatOutgoingGatePassResponse(doc._id as Types.ObjectId);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleOutgoingServiceError(error, logger, {
      message: 'Failed to create outgoing gate pass',
      code: 'CREATE_OUTGOING_GATE_PASS_ERROR',
    });
  } finally {
    session.endSession();
  }
}

/* =======================
   UPDATE OUTGOING GATE PASS
======================= */

export async function updateOutgoingGatePass(
  coldStorageId: string,
  outgoingGatePassId: string,
  payload: UpdateOutgoingGatePassInput,
  logger?: FastifyBaseLogger,
  editedById?: string,
  requestMetadata?: { ipAddress?: string; userAgent?: string }
): Promise<Record<string, unknown>> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  try {
    const existing = await findOutgoingGatePassInColdStorage(
      outgoingGatePassId,
      coldStorageId,
      logger
    );

    if (existing.status === OutgoingGatePassStatus.CANCELLED) {
      throw new ValidationError(
        'Cancelled outgoing gate pass cannot be edited',
        'OUTGOING_GATE_PASS_CANCELLED'
      );
    }

    const { previousState, modifiedState } = buildOutgoingGatePassAuditDiff(
      existing as unknown as Record<string, unknown>,
      payload
    );
    const hasAuditChanges = Object.keys(modifiedState).length > 0;

    const updateData: Record<string, unknown> = { ...payload };
    const unsetFields: Record<string, 1> = {};

    for (const field of OUTGOING_GATE_PASS_NULLABLE_UPDATE_FIELDS) {
      if (updateData[field] === null) {
        unsetFields[field] = 1;
        delete updateData[field];
      }
    }

    const updateQuery: Record<string, unknown> = {};
    if (Object.keys(updateData).length > 0) {
      updateQuery.$set = updateData;
    }
    if (Object.keys(unsetFields).length > 0) {
      updateQuery.$unset = unsetFields;
    }

    if (Object.keys(updateQuery).length === 0) {
      throw new ValidationError(
        'At least one field must be provided for update',
        'NO_FIELDS_TO_UPDATE'
      );
    }

    const outgoingObjectId = new Types.ObjectId(outgoingGatePassId);

    const updated = await OutgoingGatePass.findOneAndUpdate(
      {
        _id: outgoingObjectId,
        status: OutgoingGatePassStatus.ACTIVE,
      },
      updateQuery,
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      throw new ConflictError(
        'Outgoing gate pass could not be updated; it may have been modified concurrently',
        'CONCURRENT_MODIFICATION'
      );
    }

    if (hasAuditChanges) {
      await OutgoingGatePassAudit.create({
        outgoingGatePassId: outgoingObjectId,
        action: OutgoingGatePassAuditAction.EDIT,
        performedById: editedById ? new Types.ObjectId(editedById) : undefined,
        previousState,
        modifiedState,
        ipAddress: requestMetadata?.ipAddress,
        userAgent: requestMetadata?.userAgent,
      });
    }

    logger?.info(
      { outgoingGatePassId, fieldsUpdated: Object.keys(modifiedState) },
      'Outgoing gate pass updated successfully'
    );

    return formatOutgoingGatePassResponse(outgoingObjectId);
  } catch (error) {
    handleOutgoingServiceError(error, logger, {
      message: 'Failed to update outgoing gate pass',
      code: 'UPDATE_OUTGOING_GATE_PASS_ERROR',
    });
  }
}

/* =======================
   CANCEL OUTGOING GATE PASS
======================= */

export async function cancelOutgoingGatePass(
  coldStorageId: string,
  outgoingGatePassId: string,
  payload: CancelOutgoingGatePassInput,
  logger?: FastifyBaseLogger,
  cancelledById?: string
): Promise<Record<string, unknown>> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const outgoing = await assertOutgoingGatePassInColdStorage(
      outgoingGatePassId,
      coldStorageId,
      session,
      logger
    );

    if (outgoing.status === OutgoingGatePassStatus.CANCELLED) {
      throw new ValidationError(
        'Outgoing gate pass is already cancelled',
        'OUTGOING_GATE_PASS_ALREADY_CANCELLED'
      );
    }

    const cancelledAt = new Date();
    const outgoingObjectId = new Types.ObjectId(outgoingGatePassId);

    const updated = await OutgoingGatePass.findOneAndUpdate(
      {
        _id: outgoingObjectId,
        status: OutgoingGatePassStatus.ACTIVE,
      },
      {
        $set: {
          status: OutgoingGatePassStatus.CANCELLED,
          cancelledAt,
          cancelledBy: cancelledById
            ? new Types.ObjectId(cancelledById)
            : undefined,
          cancellationRemarks: payload.cancellationRemarks,
        },
      },
      { session, new: true }
    ).lean();

    if (!updated) {
      throw new ConflictError(
        'Outgoing gate pass could not be cancelled; it may have been modified concurrently',
        'CONCURRENT_MODIFICATION'
      );
    }

    await session.commitTransaction();

    await OutgoingGatePassAudit.create({
      outgoingGatePassId: outgoingObjectId,
      action: OutgoingGatePassAuditAction.CANCEL,
      performedById: cancelledById
        ? new Types.ObjectId(cancelledById)
        : undefined,
      previousState: {
        status: OutgoingGatePassStatus.ACTIVE,
        gatePassNo: outgoing.gatePassNo,
      },
      modifiedState: {
        status: OutgoingGatePassStatus.CANCELLED,
        gatePassNo: outgoing.gatePassNo,
        cancelledAt: cancelledAt.toISOString(),
        cancellationRemarks: payload.cancellationRemarks,
      },
    });

    logger?.info(
      {
        outgoingGatePassId,
        gatePassNo: outgoing.gatePassNo,
      },
      'Outgoing gate pass cancelled successfully'
    );

    return formatOutgoingGatePassResponse(outgoingObjectId);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleOutgoingServiceError(error, logger, {
      message: 'Failed to cancel outgoing gate pass',
      code: 'CANCEL_OUTGOING_GATE_PASS_ERROR',
    });
  } finally {
    session.endSession();
  }
}

/* =======================
   SHED SUMMARY
======================= */

export { DIRECT_SALE_CATEGORY } from './outgoing-gate-pass.schema.js';

export const OUTGOING_TO_SHED_CATEGORY = 'Outgoing to Shed';

export interface OutgoingShedSummaryDateFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface OutgoingShedSummarySizeRow {
  size: string;
  quantity: number;
}

export interface OutgoingShedSummaryVarietyRow {
  variety: string;
  quantity: number;
  sizes: OutgoingShedSummarySizeRow[];
}

export interface OutgoingShedSummaryGroup {
  /** `"all"` for the combined total across sheds; otherwise the shed name */
  shed: string;
  varieties: OutgoingShedSummaryVarietyRow[];
}

function buildVarietyRowsFromSizeMaps(
  byVariety: Map<string, Map<string, number>>
): OutgoingShedSummaryVarietyRow[] {
  const result: OutgoingShedSummaryVarietyRow[] = [];

  for (const [variety, sizeMap] of byVariety) {
    let quantity = 0;
    const sizes: OutgoingShedSummarySizeRow[] = [];

    for (const [size, sizeQuantity] of sizeMap) {
      sizes.push({ size, quantity: sizeQuantity });
      quantity += sizeQuantity;
    }

    sizes.sort((a, b) => a.size.localeCompare(b.size));
    result.push({ variety, quantity, sizes });
  }

  result.sort((a, b) => a.variety.localeCompare(b.variety));
  return result;
}

/**
 * Variety × size bag totals for ACTIVE outgoing passes with category "Outgoing to Shed",
 * grouped by shed. First entry is always `{ shed: "all", ... }` (combined totals),
 * followed by one entry per shed.
 */
export async function getOutgoingShedSummary(
  coldStorageId: string,
  filters: OutgoingShedSummaryDateFilters,
  logger?: FastifyBaseLogger
): Promise<OutgoingShedSummaryGroup[]> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return [{ shed: 'all', varieties: [] }];
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
    category: OUTGOING_TO_SHED_CATEGORY,
    status: OutgoingGatePassStatus.ACTIVE,
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

  const grouped = await OutgoingGatePass.aggregate<{
    _id: { shed: string; variety: string; size: string };
    quantity: number;
  }>([
    { $match: match },
    { $unwind: '$orderDetails' },
    {
      $group: {
        _id: {
          shed: {
            $let: {
              vars: {
                trimmed: { $trim: { input: { $ifNull: ['$shed', ''] } } },
              },
              in: {
                $cond: [{ $eq: ['$$trimmed', ''] }, 'Unspecified', '$$trimmed'],
              },
            },
          },
          variety: { $ifNull: ['$variety', 'Unspecified'] },
          size: { $ifNull: ['$orderDetails.size', ''] },
        },
        quantity: { $sum: { $ifNull: ['$orderDetails.quantityIssued', 0] } },
      },
    },
  ]);

  const byShed = new Map<string, Map<string, Map<string, number>>>();
  const allByVariety = new Map<string, Map<string, number>>();

  for (const row of grouped) {
    const shed = row._id.shed?.trim() || 'Unspecified';
    const variety = row._id.variety?.trim() || 'Unspecified';
    const size = row._id.size?.trim() || '';

    let shedVarietyMap = byShed.get(shed);
    if (!shedVarietyMap) {
      shedVarietyMap = new Map();
      byShed.set(shed, shedVarietyMap);
    }

    let sizeMap = shedVarietyMap.get(variety);
    if (!sizeMap) {
      sizeMap = new Map();
      shedVarietyMap.set(variety, sizeMap);
    }
    sizeMap.set(size, (sizeMap.get(size) ?? 0) + row.quantity);

    let allSizeMap = allByVariety.get(variety);
    if (!allSizeMap) {
      allSizeMap = new Map();
      allByVariety.set(variety, allSizeMap);
    }
    allSizeMap.set(size, (allSizeMap.get(size) ?? 0) + row.quantity);
  }

  const result: OutgoingShedSummaryGroup[] = [
    { shed: 'all', varieties: buildVarietyRowsFromSizeMaps(allByVariety) },
  ];

  const shedNames = [...byShed.keys()].sort((a, b) => a.localeCompare(b));
  for (const shed of shedNames) {
    result.push({
      shed,
      varieties: buildVarietyRowsFromSizeMaps(byShed.get(shed)!),
    });
  }

  logger?.info(
    {
      coldStorageId,
      shedCount: shedNames.length,
      varietyCount: allByVariety.size,
    },
    'Outgoing shed summary computed'
  );

  return result;
}
