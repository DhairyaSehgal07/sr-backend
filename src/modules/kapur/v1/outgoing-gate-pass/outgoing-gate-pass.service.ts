import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  OutgoingGatePass,
  OutgoingGatePassStatus,
  type IOutgoingOrderDetail,
  type IOutgoingStorageGatePassSnapshot,
} from './outgoing-gate-pass.model.js';
import {
  OutgoingGatePassAudit,
  OutgoingGatePassAuditAction,
  type OutgoingGatePassAuditState,
} from './outgoing-gate-pass-audit.model.js';
import { StorageGatePass } from '../storage-gate-pass/storage-gate-pass.model.js';
import type { BagType } from '../storage-gate-pass/storage-gate-pass.model.js';
import { FarmerStorageLink } from '../farmer-storage-link/farmer-storage-link.model.js';
import type {
  CancelOutgoingGatePassInput,
  CreateOutgoingGatePassInput,
  UpdateOutgoingGatePassInput,
} from './outgoing-gate-pass.schema.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../../../../utils/errors.js';

/* =======================
   TYPES (internal)
======================= */

interface OutgoingValidatedAllocation {
  storageGatePassId: string;
  size: string;
  quantityToAllocate: number;
  weightInKg: number;
  chamber: string;
  floor: string;
  row: string;
}

export interface OutgoingStoragePassWithFilteredAllocations {
  storageGatePassId: string;
  allocations: OutgoingValidatedAllocation[];
}

type StoragePassLean = {
  _id: Types.ObjectId;
  farmerStorageLinkId: Types.ObjectId;
  gatePassNo: number;
  variety: string;
  storageCategory: string;
  bagSizes: Array<{
    size: string;
    currentQuantity: number;
    initialQuantity: number;
    bagType: BagType;
    chamber: string;
    floor: string;
    row: string;
  }>;
};

function allocationLineKey(
  size: string,
  bagType: BagType,
  chamber: string,
  floor: string,
  row: string,
  weightInKg: number
): string {
  return `${size}|${bagType}|${chamber}|${floor}|${row}|${weightInKg}`;
}

function bagLineKey(
  size: string,
  chamber: string,
  floor: string,
  row: string
): string {
  return `${size}|${chamber}|${floor}|${row}`;
}

const OUTGOING_GATE_PASS_EDITABLE_FIELDS = [
  'manualGatePassNumber',
  'date',
  'from',
  'to',
  'truckNumber',
  'remarks',
  'billNumber',
  'biltiNumber',
  'billBook',
  'biltiBook',
  'category',
] as const;

const OUTGOING_GATE_PASS_NULLABLE_UPDATE_FIELDS = [
  'manualGatePassNumber',
  'billNumber',
  'biltiNumber',
  'billBook',
  'biltiBook',
  'category',
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
   INPUT VALIDATION
======================= */

export function validateOutgoingGatePassInput(
  payload: CreateOutgoingGatePassInput,
  logger?: FastifyBaseLogger
): OutgoingStoragePassWithFilteredAllocations[] {
  const result: OutgoingStoragePassWithFilteredAllocations[] = [];

  for (const sp of payload.storageGatePasses) {
    const nonZeroAllocations = sp.allocations.filter(
      (a) => a.quantityToAllocate > 0
    );

    if (nonZeroAllocations.length === 0) {
      logger?.warn(
        { storageGatePassId: sp.storageGatePassId },
        'All allocations have zero quantity'
      );
      throw new ValidationError(
        `Storage gate pass ${sp.storageGatePassId}: at least one allocation must have quantity > 0`,
        'INVALID_ALLOCATION_QUANTITY'
      );
    }

    result.push({
      storageGatePassId: sp.storageGatePassId,
      allocations: nonZeroAllocations.map((a) => ({
        storageGatePassId: sp.storageGatePassId,
        size: a.size,
        quantityToAllocate: a.quantityToAllocate,
        weightInKg: a.weightInKg,
        chamber: a.chamber,
        floor: a.floor,
        row: a.row,
      })),
    });
  }

  return result;
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
   FETCH & VALIDATE STORAGE GATE PASSES
======================= */

export async function fetchAndValidateStorageGatePasses(
  payload: CreateOutgoingGatePassInput,
  validated: OutgoingStoragePassWithFilteredAllocations[],
  farmerStorageLinkObjectId: Types.ObjectId,
  session: ClientSession,
  _logger?: FastifyBaseLogger
): Promise<Map<string, StoragePassLean>> {
  const storageGatePassIds = validated.map(
    (v) => new Types.ObjectId(v.storageGatePassId)
  );

  const fetched = await StorageGatePass.find({
    _id: { $in: storageGatePassIds },
  })
    .session(session)
    .lean();

  if (fetched.length !== storageGatePassIds.length) {
    const foundIds = new Set(
      fetched.map((f) => (f as { _id: Types.ObjectId })._id.toString())
    );
    const missingIds = storageGatePassIds
      .filter((id) => !foundIds.has(id.toString()))
      .map((id) => id.toString());
    throw new NotFoundError(
      `Storage gate pass(es) not found: ${missingIds.join(', ')}`,
      'STORAGE_GATE_PASS_NOT_FOUND'
    );
  }

  const storagePassMap = new Map<string, StoragePassLean>();
  for (const sp of fetched) {
    const s = sp as StoragePassLean;
    storagePassMap.set(s._id.toString(), s);
  }

  const expectedVariety = payload.variety.trim();
  const expectedLinkId = farmerStorageLinkObjectId.toString();

  for (const item of validated) {
    const storagePass = storagePassMap.get(item.storageGatePassId);
    if (!storagePass) continue;

    if (storagePass.farmerStorageLinkId.toString() !== expectedLinkId) {
      throw new ValidationError(
        `Storage gate pass ${item.storageGatePassId} does not belong to the specified farmer storage link`,
        'STORAGE_PASS_FARMER_LINK_MISMATCH'
      );
    }

    const spVariety = storagePass.variety?.trim();
    if (spVariety !== expectedVariety) {
      throw new ValidationError(
        `Variety mismatch for storage gate pass ${item.storageGatePassId}: expected "${expectedVariety}", got "${spVariety}"`,
        'VARIETY_MISMATCH'
      );
    }

    for (const alloc of item.allocations) {
      const detail = storagePass.bagSizes.find(
        (d) =>
          d.size === alloc.size &&
          d.chamber === alloc.chamber &&
          d.floor === alloc.floor &&
          d.row === alloc.row
      );
      if (!detail) {
        throw new ValidationError(
          `No matching bag size for size "${alloc.size}" at ${alloc.chamber}/${alloc.floor}/${alloc.row} in storage gate pass ${item.storageGatePassId}`,
          'SIZE_LOCATION_NOT_FOUND'
        );
      }
      if (detail.currentQuantity < alloc.quantityToAllocate) {
        throw new ValidationError(
          `Insufficient quantity for size "${alloc.size}" at ${alloc.chamber}/${alloc.floor}/${alloc.row} in storage gate pass ${item.storageGatePassId}: available ${detail.currentQuantity}, requested ${alloc.quantityToAllocate}`,
          'INSUFFICIENT_STOCK'
        );
      }
    }
  }

  return storagePassMap;
}

/* =======================
   BULK OPERATIONS
======================= */

export function prepareBulkOperationsForOutgoing(
  validated: OutgoingStoragePassWithFilteredAllocations[]
): mongoose.mongo.AnyBulkWriteOperation<typeof StorageGatePass.prototype>[] {
  const bulkOps: Array<{
    updateOne: {
      filter: Record<string, unknown>;
      update: Record<string, unknown>;
      arrayFilters?: Array<Record<string, unknown>>;
    };
  }> = [];

  for (const item of validated) {
    for (const alloc of item.allocations) {
      bulkOps.push({
        updateOne: {
          filter: { _id: new Types.ObjectId(item.storageGatePassId) },
          update: {
            $inc: {
              'bagSizes.$[elem].currentQuantity': -alloc.quantityToAllocate,
            },
          },
          arrayFilters: [
            {
              'elem.size': alloc.size,
              'elem.chamber': alloc.chamber,
              'elem.floor': alloc.floor,
              'elem.row': alloc.row,
              'elem.currentQuantity': { $gte: alloc.quantityToAllocate },
            },
          ],
        },
      });
    }
  }

  return bulkOps as mongoose.mongo.AnyBulkWriteOperation<
    typeof StorageGatePass.prototype
  >[];
}

function prepareBulkOperationsForCancelRestore(
  snapshots: IOutgoingStorageGatePassSnapshot[]
): mongoose.mongo.AnyBulkWriteOperation<typeof StorageGatePass.prototype>[] {
  const bulkOps: Array<{
    updateOne: {
      filter: Record<string, unknown>;
      update: Record<string, unknown>;
      arrayFilters?: Array<Record<string, unknown>>;
    };
  }> = [];

  for (const snapshot of snapshots) {
    for (const bag of snapshot.bagSizes) {
      if (bag.quantityIssued <= 0) continue;

      bulkOps.push({
        updateOne: {
          filter: { _id: snapshot._id },
          update: {
            $inc: {
              'bagSizes.$[elem].currentQuantity': bag.quantityIssued,
            },
          },
          arrayFilters: [
            {
              'elem.size': bag.size,
              'elem.bagType': bag.bagType,
              'elem.chamber': bag.chamber,
              'elem.floor': bag.floor,
              'elem.row': bag.row,
            },
          ],
        },
      });
    }
  }

  return bulkOps as mongoose.mongo.AnyBulkWriteOperation<
    typeof StorageGatePass.prototype
  >[];
}

/* =======================
   BUILD ORDER DETAILS & SNAPSHOTS
======================= */

function buildOrderDetails(
  validated: OutgoingStoragePassWithFilteredAllocations[],
  storagePassMap: Map<string, StoragePassLean>
): IOutgoingOrderDetail[] {
  const aggregated = new Map<
    string,
    IOutgoingOrderDetail & { quantityIssued: number }
  >();

  for (const item of validated) {
    const sp = storagePassMap.get(item.storageGatePassId);
    if (!sp) continue;

    for (const alloc of item.allocations) {
      const detail = sp.bagSizes.find(
        (d) =>
          d.size === alloc.size &&
          d.chamber === alloc.chamber &&
          d.floor === alloc.floor &&
          d.row === alloc.row
      );
      if (!detail) continue;

      const key = allocationLineKey(
        alloc.size,
        detail.bagType,
        alloc.chamber,
        alloc.floor,
        alloc.row,
        alloc.weightInKg
      );
      const remaining = Math.max(
        0,
        detail.currentQuantity - alloc.quantityToAllocate
      );

      const existing = aggregated.get(key);
      if (existing) {
        existing.quantityIssued += alloc.quantityToAllocate;
        existing.quantityAvailable = remaining;
      } else {
        aggregated.set(key, {
          size: alloc.size,
          bagType: detail.bagType,
          quantityIssued: alloc.quantityToAllocate,
          quantityAvailable: remaining,
          weightInKg: alloc.weightInKg,
          chamber: alloc.chamber,
          floor: alloc.floor,
          row: alloc.row,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

function buildStorageGatePassSnapshots(
  validated: OutgoingStoragePassWithFilteredAllocations[],
  storagePassMap: Map<string, StoragePassLean>
): IOutgoingStorageGatePassSnapshot[] {
  const snapshots: IOutgoingStorageGatePassSnapshot[] = [];

  for (const item of validated) {
    const sp = storagePassMap.get(item.storageGatePassId);
    if (!sp) continue;

    const allocatedByKey = new Map<
      string,
      {
        quantityIssued: number;
        bagType: BagType;
        initialQuantity: number;
        currentQuantityBefore: number;
      }
    >();

    for (const alloc of item.allocations) {
      const detail = sp.bagSizes.find(
        (d) =>
          d.size === alloc.size &&
          d.chamber === alloc.chamber &&
          d.floor === alloc.floor &&
          d.row === alloc.row
      );
      if (!detail) continue;

      const key = bagLineKey(alloc.size, alloc.chamber, alloc.floor, alloc.row);
      const existing = allocatedByKey.get(key);
      if (existing) {
        existing.quantityIssued += alloc.quantityToAllocate;
      } else {
        allocatedByKey.set(key, {
          quantityIssued: alloc.quantityToAllocate,
          bagType: detail.bagType,
          initialQuantity: detail.initialQuantity,
          currentQuantityBefore: detail.currentQuantity,
        });
      }
    }

    const bagSizes = Array.from(allocatedByKey.entries()).map(([key, data]) => {
      const [size, chamber, floor, row] = key.split('|');
      return {
        size,
        bagType: data.bagType,
        chamber,
        floor,
        row,
        initialQuantity: data.initialQuantity,
        currentQuantity: Math.max(
          0,
          data.currentQuantityBefore - data.quantityIssued
        ),
        quantityIssued: data.quantityIssued,
      };
    });

    snapshots.push({
      _id: sp._id,
      gatePassNo: sp.gatePassNo,
      variety: sp.variety,
      storageCategory: sp.storageCategory,
      bagSizes,
    });
  }

  return snapshots;
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

    const validated = validateOutgoingGatePassInput(payload, logger);

    const storagePassMap = await fetchAndValidateStorageGatePasses(
      payload,
      validated,
      farmerStorageLinkObjectId,
      session,
      logger
    );

    const bulkOps = prepareBulkOperationsForOutgoing(validated);
    if (bulkOps.length === 0) {
      throw new ValidationError(
        'No allocations to apply',
        'INVALID_ALLOCATION_QUANTITY'
      );
    }

    const updateResult = await StorageGatePass.bulkWrite(
      bulkOps as Parameters<typeof StorageGatePass.bulkWrite>[0],
      { session }
    );

    if (updateResult.modifiedCount !== bulkOps.length) {
      throw new ConflictError(
        `Expected ${bulkOps.length} updates, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
        'CONCURRENT_MODIFICATION'
      );
    }

    const orderDetails = buildOrderDetails(validated, storagePassMap);
    const storageGatePassSnapshots = buildStorageGatePassSnapshots(
      validated,
      storagePassMap
    );

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
          from: payload.from,
          to: payload.to,
          truckNumber: payload.truckNumber ?? '',
          ...(payload.billNumber !== undefined && {
            billNumber: payload.billNumber,
          }),
          ...(payload.biltiNumber !== undefined && {
            biltiNumber: payload.biltiNumber,
          }),
          ...(payload.billBook !== undefined && { billBook: payload.billBook }),
          ...(payload.biltiBook !== undefined && {
            biltiBook: payload.biltiBook,
          }),
          ...(payload.category !== undefined && { category: payload.category }),
          orderDetails,
          storageGatePassSnapshots,
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

    const snapshots = outgoing.storageGatePassSnapshots ?? [];
    const bulkOps = prepareBulkOperationsForCancelRestore(snapshots);

    if (bulkOps.length > 0) {
      const updateResult = await StorageGatePass.bulkWrite(
        bulkOps as Parameters<typeof StorageGatePass.bulkWrite>[0],
        { session }
      );

      if (updateResult.modifiedCount !== bulkOps.length) {
        throw new ConflictError(
          `Expected ${bulkOps.length} stock restores, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
          'CONCURRENT_MODIFICATION'
        );
      }
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
        restoredOperations: bulkOps.length,
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
   TRANSFER STOCK (outgoing doc only; stock already deducted)
======================= */

export interface CreateOutgoingGatePassForTransferStockParams {
  farmerStorageLinkId: Types.ObjectId;
  gatePassNo: number;
  date: Date;
  variety: string;
  from: string;
  to: string;
  truckNumber?: string;
  remarks?: string;
  createdById?: string;
  validated: OutgoingStoragePassWithFilteredAllocations[];
  storagePassMap: Map<string, StoragePassLean>;
}

export async function createOutgoingGatePassForTransferStock(
  session: ClientSession,
  params: CreateOutgoingGatePassForTransferStockParams
): Promise<Types.ObjectId> {
  const orderDetails = buildOrderDetails(
    params.validated,
    params.storagePassMap
  );
  const storageGatePassSnapshots = buildStorageGatePassSnapshots(
    params.validated,
    params.storagePassMap
  );

  const doc = await OutgoingGatePass.create(
    [
      {
        farmerStorageLinkId: params.farmerStorageLinkId,
        createdBy: params.createdById
          ? new Types.ObjectId(params.createdById)
          : undefined,
        gatePassNo: params.gatePassNo,
        date: params.date,
        variety: params.variety,
        from: params.from,
        to: params.to,
        truckNumber: params.truckNumber ?? '',
        orderDetails,
        storageGatePassSnapshots,
        remarks: params.remarks,
        category: 'Internal Transfer',
        status: OutgoingGatePassStatus.ACTIVE,
      },
    ],
    { session }
  ).then((arr) => arr[0]);

  return doc._id as Types.ObjectId;
}

export async function recordOutgoingGatePassCreateAudit(
  outgoingGatePassId: Types.ObjectId,
  params: {
    gatePassNo: number;
    variety: string;
    date: Date;
    farmerStorageLinkId: Types.ObjectId;
    createdById?: string;
  }
): Promise<void> {
  await OutgoingGatePassAudit.create({
    outgoingGatePassId,
    action: OutgoingGatePassAuditAction.CREATE,
    performedById: params.createdById
      ? new Types.ObjectId(params.createdById)
      : undefined,
    previousState: {},
    modifiedState: {
      gatePassNo: params.gatePassNo,
      status: OutgoingGatePassStatus.ACTIVE,
      farmerStorageLinkId: params.farmerStorageLinkId.toString(),
      variety: params.variety,
      date: params.date.toISOString(),
    },
  });
}

/* =======================
   SHED SUMMARY
======================= */

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

/**
 * Variety × size bag totals for ACTIVE outgoing passes with category "Outgoing to Shed".
 */
export async function getOutgoingShedSummary(
  coldStorageId: string,
  filters: OutgoingShedSummaryDateFilters,
  logger?: FastifyBaseLogger
): Promise<OutgoingShedSummaryVarietyRow[]> {
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
    return [];
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
    _id: { variety: string; size: string };
    quantity: number;
  }>([
    { $match: match },
    { $unwind: '$orderDetails' },
    {
      $group: {
        _id: {
          variety: { $ifNull: ['$variety', 'Unspecified'] },
          size: { $ifNull: ['$orderDetails.size', ''] },
        },
        quantity: { $sum: { $ifNull: ['$orderDetails.quantityIssued', 0] } },
      },
    },
  ]);

  const byVariety = new Map<string, Map<string, number>>();

  for (const row of grouped) {
    const variety = row._id.variety?.trim() || 'Unspecified';
    const size = row._id.size?.trim() || '';

    let sizeMap = byVariety.get(variety);
    if (!sizeMap) {
      sizeMap = new Map();
      byVariety.set(variety, sizeMap);
    }
    sizeMap.set(size, (sizeMap.get(size) ?? 0) + row.quantity);
  }

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

  logger?.info(
    { coldStorageId, varietyCount: result.length },
    'Outgoing shed summary computed'
  );

  return result;
}
