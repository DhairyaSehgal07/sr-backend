import mongoose, { ClientSession, Types } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import {
  TransferStockGatePass,
  type ITransferStockItem,
} from './transfer-stock.model.js';
import {
  TRANSFER_STOCK_REPORT_COLUMNS,
  type CreateTransferStockServiceInput,
  type GetTransferStockGatePassesByColdStorageQuery,
  type GetTransferStockReportQuery,
  type TransferStockReport,
} from './transfer-stock.schema.js';
import {
  StorageGatePass,
  type BagType,
} from '../storage-gate-pass/storage-gate-pass.model.js';
import { OutgoingGatePass } from '../outgoing-gate-pass/outgoing-gate-pass.model.js';
import {
  createOutgoingGatePassForTransferStock,
  fetchAndValidateStorageGatePasses,
  prepareBulkOperationsForOutgoing,
  recordOutgoingGatePassCreateAudit,
  validateOutgoingGatePassInput,
  type OutgoingStoragePassWithFilteredAllocations,
} from '../outgoing-gate-pass/outgoing-gate-pass.service.js';
import type { CreateOutgoingGatePassInput } from '../outgoing-gate-pass/outgoing-gate-pass.schema.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../utils/errors.js';

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

type DestinationBagSize = {
  size: string;
  bagType: BagType;
  chamber: string;
  floor: string;
  row: string;
  currentQuantity: number;
  initialQuantity: number;
};

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
      'Farmer storage link not found for transfer stock'
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

function toOutgoingPayload(
  payload: CreateTransferStockServiceInput
): CreateOutgoingGatePassInput {
  return {
    farmerStorageLinkId: payload.fromFarmerStorageLinkId,
    gatePassNo: payload.outgoingGatePassNo,
    date: payload.date,
    variety: payload.variety,
    from: payload.from,
    to: payload.to,
    truckNumber: payload.truckNumber,
    storageGatePasses: payload.storageGatePasses.map((sp) => ({
      storageGatePassId: sp.storageGatePassId,
      allocations: sp.allocations.map((a) => ({
        size: a.size,
        quantityToAllocate: a.quantityToAllocate,
        weightInKg: a.weightInKg,
        chamber: a.chamber,
        floor: a.floor,
        row: a.row,
      })),
    })),
    remarks: payload.remarks,
  };
}

function buildDestinationBagSizes(
  validated: OutgoingStoragePassWithFilteredAllocations[],
  storagePassMap: Map<string, StoragePassLean>
): DestinationBagSize[] {
  const aggregated = new Map<string, DestinationBagSize>();

  for (const item of validated) {
    const storagePass = storagePassMap.get(item.storageGatePassId);
    if (!storagePass) continue;

    for (const alloc of item.allocations) {
      const detail = storagePass.bagSizes.find(
        (d) =>
          d.size === alloc.size &&
          d.chamber === alloc.chamber &&
          d.floor === alloc.floor &&
          d.row === alloc.row
      );
      if (!detail) continue;

      const key = `${alloc.size}|${detail.bagType}|${alloc.chamber}|${alloc.floor}|${alloc.row}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.currentQuantity += alloc.quantityToAllocate;
        existing.initialQuantity += alloc.quantityToAllocate;
      } else {
        aggregated.set(key, {
          size: alloc.size,
          bagType: detail.bagType,
          chamber: alloc.chamber,
          floor: alloc.floor,
          row: alloc.row,
          currentQuantity: alloc.quantityToAllocate,
          initialQuantity: alloc.quantityToAllocate,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

function buildTransferItems(
  validated: OutgoingStoragePassWithFilteredAllocations[],
  storagePassMap: Map<string, StoragePassLean>
): ITransferStockItem[] {
  const items: ITransferStockItem[] = [];

  for (const item of validated) {
    const storagePass = storagePassMap.get(item.storageGatePassId);
    if (!storagePass) continue;

    for (const alloc of item.allocations) {
      const detail = storagePass.bagSizes.find(
        (d) =>
          d.size === alloc.size &&
          d.chamber === alloc.chamber &&
          d.floor === alloc.floor &&
          d.row === alloc.row
      );
      if (!detail) continue;

      items.push({
        storageGatePassId: storagePass._id,
        gatePassNo: storagePass.gatePassNo,
        size: alloc.size,
        bagType: detail.bagType,
        quantity: alloc.quantityToAllocate,
        chamber: alloc.chamber,
        floor: alloc.floor,
        row: alloc.row,
      });
    }
  }

  return items;
}

type PopulatedFarmerLink = {
  accountNumber: number;
  farmerId: { name: string; address: string; mobileNumber: string };
};
type PopulatedAdmin = { _id: unknown; name: string };

function formatPopulatedTransferStockDoc(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const fromLink = raw.fromFarmerStorageLinkId as
    PopulatedFarmerLink | null | undefined;
  const toLink = raw.toFarmerStorageLinkId as
    PopulatedFarmerLink | null | undefined;
  const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;

  const formatLink = (link: PopulatedFarmerLink | null | undefined) =>
    link && link.farmerId
      ? {
          name: link.farmerId.name,
          accountNumber: link.accountNumber,
          address: link.farmerId.address,
          mobileNumber: link.farmerId.mobileNumber,
        }
      : undefined;

  return {
    ...raw,
    fromFarmerStorageLinkId:
      formatLink(fromLink) ?? raw.fromFarmerStorageLinkId,
    toFarmerStorageLinkId: formatLink(toLink) ?? raw.toFarmerStorageLinkId,
    createdBy: populatedAdmin
      ? { _id: populatedAdmin._id, name: populatedAdmin.name }
      : raw.createdBy,
  };
}

const transferStockPopulateOptions = [
  {
    path: 'fromFarmerStorageLinkId',
    select: 'accountNumber farmerId',
    populate: {
      path: 'farmerId',
      select: 'name address mobileNumber',
    },
  },
  {
    path: 'toFarmerStorageLinkId',
    select: 'accountNumber farmerId',
    populate: {
      path: 'farmerId',
      select: 'name address mobileNumber',
    },
  },
  { path: 'createdBy', select: 'name' },
];

async function formatTransferStockResponse(
  transferStockGatePassId: Types.ObjectId
): Promise<Record<string, unknown>> {
  const populated = await TransferStockGatePass.findById(
    transferStockGatePassId
  )
    .populate(transferStockPopulateOptions)
    .lean();

  if (!populated) {
    throw new NotFoundError(
      'Transfer stock gate pass not found',
      'TRANSFER_STOCK_GATE_PASS_NOT_FOUND'
    );
  }

  return formatPopulatedTransferStockDoc(
    populated as unknown as Record<string, unknown>
  );
}

export interface TransferStockGatePassesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function getTransferStockGatePassesByColdStorage(
  coldStorageId: string,
  options: GetTransferStockGatePassesByColdStorageQuery = {},
  logger?: FastifyBaseLogger
): Promise<{
  transferStockGatePasses: Array<Record<string, unknown>>;
  pagination: TransferStockGatePassesPagination;
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
    const gatePassNo = options.gatePassNo;

    const coldStorageObjectId = new Types.ObjectId(coldStorageId);
    const FarmerStorageLink = mongoose.model('FarmerStorageLink');
    const farmerStorageLinkIds = await FarmerStorageLink.find({
      coldStorageId: coldStorageObjectId,
    })
      .distinct('_id')
      .lean();

    const filter: Record<string, unknown> = {
      $or: [
        { fromFarmerStorageLinkId: { $in: farmerStorageLinkIds } },
        { toFarmerStorageLinkId: { $in: farmerStorageLinkIds } },
      ],
    };

    if (gatePassNo != null) {
      filter.gatePassNo = gatePassNo;
    }

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

    const [total, transferStockGatePasses] = await Promise.all([
      TransferStockGatePass.countDocuments(filter),
      TransferStockGatePass.find(filter)
        .populate(transferStockPopulateOptions)
        .sort({ gatePassNo: sortDir, date: sortDir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    if (gatePassNo != null && total === 0) {
      throw new NotFoundError(
        `Transfer stock gate pass with gate pass number ${gatePassNo} not found`,
        'TRANSFER_STOCK_GATE_PASS_NOT_FOUND'
      );
    }

    const totalPages = Math.ceil(total / limit);

    logger?.info(
      {
        coldStorageId,
        count: transferStockGatePasses.length,
        total,
        page,
        limit,
        ...(gatePassNo != null && { gatePassNo }),
      },
      'Retrieved transfer stock gate passes by cold storage'
    );

    return {
      transferStockGatePasses: transferStockGatePasses.map((doc) =>
        formatPopulatedTransferStockDoc(
          doc as unknown as Record<string, unknown>
        )
      ),
      pagination: { page, limit, total, totalPages },
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving transfer stock gate passes by cold storage'
    );

    throw new AppError(
      'Failed to retrieve transfer stock gate passes',
      500,
      'GET_TRANSFER_STOCK_GATE_PASSES_ERROR'
    );
  }
}

function toReportString(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value);
}

function formatReportDate(date: Date | string | undefined): string {
  if (date == null) {
    return '';
  }
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
}

function formatReportNumberOptional(value: number | undefined | null): string {
  if (value == null) {
    return '';
  }
  return String(value);
}

function toObjectIdString(value: unknown): string {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

type TransferStockReportLean = {
  _id?: unknown;
  gatePassNo?: number;
  date?: Date | string;
  variety?: string;
  truckNumber?: string;
  remarks?: string;
  items?: Array<{
    gatePassNo?: number;
    size?: string;
    bagType?: string;
    quantity?: number;
    chamber?: string;
    floor?: string;
    row?: string;
  }>;
  fromFarmerStorageLinkId?: {
    accountNumber?: number;
    farmerId?: { name?: string; address?: string } | null;
  } | null;
  toFarmerStorageLinkId?: {
    accountNumber?: number;
    farmerId?: { name?: string; address?: string } | null;
  } | null;
  createdBy?: { name?: string } | null;
  createdOutgoingGatePassId?: { gatePassNo?: number } | null;
  createdStorageGatePassId?: { gatePassNo?: number } | null;
};

function formatBagDetails(items: TransferStockReportLean['items']): string {
  if (!items?.length) {
    return '';
  }

  return items
    .map((item) => {
      const sourceGp = item.gatePassNo != null ? `GP ${item.gatePassNo}: ` : '';
      return `${sourceGp}${item.size ?? ''} (${item.bagType ?? ''}) x${item.quantity ?? 0} @ ${item.chamber ?? ''}/${item.floor ?? ''}/${item.row ?? ''}`;
    })
    .join('; ');
}

function mapTransferStockToReport(
  pass: TransferStockReportLean
): TransferStockReport {
  const fromFarmer = pass.fromFarmerStorageLinkId?.farmerId;
  const toFarmer = pass.toFarmerStorageLinkId?.farmerId;
  const totalBags = (pass.items ?? []).reduce(
    (sum, item) => sum + (item.quantity ?? 0),
    0
  );

  return {
    _id: toObjectIdString(pass._id),
    gatePassNo: formatReportNumberOptional(pass.gatePassNo),
    date: formatReportDate(pass.date),
    variety: toReportString(pass.variety),
    fromFarmerName: toReportString(fromFarmer?.name),
    fromAccountNumber: formatReportNumberOptional(
      pass.fromFarmerStorageLinkId?.accountNumber
    ),
    fromFarmerAddress: toReportString(fromFarmer?.address),
    toFarmerName: toReportString(toFarmer?.name),
    toAccountNumber: formatReportNumberOptional(
      pass.toFarmerStorageLinkId?.accountNumber
    ),
    toFarmerAddress: toReportString(toFarmer?.address),
    truckNumber: toReportString(pass.truckNumber),
    outgoingGatePassNo: formatReportNumberOptional(
      pass.createdOutgoingGatePassId?.gatePassNo
    ),
    destinationStorageGatePassNo: formatReportNumberOptional(
      pass.createdStorageGatePassId?.gatePassNo
    ),
    totalBags: String(totalBags),
    bagDetails: formatBagDetails(pass.items),
    remarks: toReportString(pass.remarks),
    createdBy: toReportString(pass.createdBy?.name),
  };
}

const transferStockReportPopulateOptions = [
  {
    path: 'fromFarmerStorageLinkId',
    select: 'accountNumber farmerId',
    populate: {
      path: 'farmerId',
      select: 'name address mobileNumber',
    },
  },
  {
    path: 'toFarmerStorageLinkId',
    select: 'accountNumber farmerId',
    populate: {
      path: 'farmerId',
      select: 'name address mobileNumber',
    },
  },
  { path: 'createdBy', select: 'name' },
  { path: 'createdOutgoingGatePassId', select: 'gatePassNo' },
  { path: 'createdStorageGatePassId', select: 'gatePassNo' },
];

export async function getTransferStockGatePassReport(
  coldStorageId: string,
  options: GetTransferStockReportQuery = {},
  logger?: FastifyBaseLogger
): Promise<{
  columns: typeof TRANSFER_STOCK_REPORT_COLUMNS;
  transferStockGatePasses: TransferStockReport[];
}> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const coldStorageObjectId = new Types.ObjectId(coldStorageId);
    const FarmerStorageLink = mongoose.model('FarmerStorageLink');
    const farmerStorageLinkIds = await FarmerStorageLink.find({
      coldStorageId: coldStorageObjectId,
    })
      .distinct('_id')
      .lean();

    const filter: Record<string, unknown> = {
      $or: [
        { fromFarmerStorageLinkId: { $in: farmerStorageLinkIds } },
        { toFarmerStorageLinkId: { $in: farmerStorageLinkIds } },
      ],
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

    const transferStockGatePasses = await TransferStockGatePass.find(filter)
      .populate(transferStockReportPopulateOptions)
      .sort({ gatePassNo: -1, date: -1 })
      .lean();

    logger?.info(
      {
        coldStorageId,
        count: transferStockGatePasses.length,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      },
      'Retrieved transfer stock gate pass report'
    );

    return {
      columns: TRANSFER_STOCK_REPORT_COLUMNS,
      transferStockGatePasses: (
        transferStockGatePasses as unknown as TransferStockReportLean[]
      ).map(mapTransferStockToReport),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving transfer stock gate pass report'
    );

    throw new AppError(
      'Failed to retrieve transfer stock gate pass report',
      500,
      'GET_TRANSFER_STOCK_REPORT_ERROR'
    );
  }
}

function handleTransferStockServiceError(
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

  logger?.error({ err: error }, 'Unexpected error in transfer stock service');
  throw new AppError(
    options.message ?? 'Failed to process transfer stock gate pass',
    500,
    options.code ?? 'TRANSFER_STOCK_ERROR'
  );
}

export async function createTransferStockGatePass(
  coldStorageId: string,
  payload: CreateTransferStockServiceInput,
  logger?: FastifyBaseLogger,
  createdById?: string
): Promise<Record<string, unknown>> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }

  if (payload.fromFarmerStorageLinkId === payload.toFarmerStorageLinkId) {
    throw new ValidationError(
      'From and to farmer storage links must be different',
      'SAME_FARMER_STORAGE_LINK'
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const coldStorageObjectId = new Types.ObjectId(coldStorageId);
    const fromFarmerStorageLinkObjectId =
      await assertFarmerStorageLinkInColdStorage(
        payload.fromFarmerStorageLinkId,
        coldStorageId,
        session,
        logger
      );
    const toFarmerStorageLinkObjectId =
      await assertFarmerStorageLinkInColdStorage(
        payload.toFarmerStorageLinkId,
        coldStorageId,
        session,
        logger
      );

    if (payload.idempotencyKey) {
      const existing = await TransferStockGatePass.findOne({
        idempotencyKey: payload.idempotencyKey,
      })
        .session(session)
        .lean();
      if (existing) {
        logger?.info(
          {
            idempotencyKey: payload.idempotencyKey,
            transferStockGatePassId: existing._id,
          },
          'Idempotency: returning existing transfer stock gate pass'
        );
        await session.commitTransaction();
        return formatTransferStockResponse(existing._id as Types.ObjectId);
      }
    }

    const existingTransferByGatePassNo = await TransferStockGatePass.findOne({
      fromFarmerStorageLinkId: fromFarmerStorageLinkObjectId,
      gatePassNo: payload.gatePassNo,
    })
      .session(session)
      .lean();

    if (existingTransferByGatePassNo) {
      throw new ConflictError(
        `Transfer gate pass number ${payload.gatePassNo} already exists for this farmer`,
        'TRANSFER_GATE_PASS_NUMBER_EXISTS'
      );
    }

    const farmerStorageLinkIdsForColdStorage =
      await getFarmerStorageLinkIdsForColdStorage(coldStorageObjectId, session);

    const existingOutgoingByGatePassNo = await OutgoingGatePass.findOne({
      gatePassNo: payload.outgoingGatePassNo,
      farmerStorageLinkId: { $in: farmerStorageLinkIdsForColdStorage },
    })
      .session(session)
      .lean();

    if (existingOutgoingByGatePassNo) {
      throw new ConflictError(
        `Outgoing gate pass number ${payload.outgoingGatePassNo} already exists for this cold storage`,
        'GATE_PASS_NUMBER_EXISTS'
      );
    }

    const existingDestinationStorageByGatePassNo =
      await StorageGatePass.findOne({
        gatePassNo: payload.destinationStorageGatePassNo,
        farmerStorageLinkId: { $in: farmerStorageLinkIdsForColdStorage },
      })
        .session(session)
        .lean();

    if (existingDestinationStorageByGatePassNo) {
      throw new ConflictError(
        `Destination storage gate pass number ${payload.destinationStorageGatePassNo} already exists for this cold storage`,
        'GATE_PASS_NUMBER_EXISTS'
      );
    }

    const outgoingPayload = toOutgoingPayload(payload);
    const validated = validateOutgoingGatePassInput(outgoingPayload, logger);

    const storagePassMap = await fetchAndValidateStorageGatePasses(
      outgoingPayload,
      validated,
      fromFarmerStorageLinkObjectId,
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

    const destinationBagSizes = buildDestinationBagSizes(
      validated,
      storagePassMap
    );
    if (destinationBagSizes.length === 0) {
      throw new ValidationError(
        'Could not build destination bag sizes from allocations',
        'INVALID_ALLOCATION_QUANTITY'
      );
    }

    const destinationStoragePass = await StorageGatePass.create(
      [
        {
          farmerStorageLinkId: toFarmerStorageLinkObjectId,
          createdBy: createdById ? new Types.ObjectId(createdById) : undefined,
          gatePassNo: payload.destinationStorageGatePassNo,
          date: payload.date,
          variety: payload.variety,
          storageCategory: payload.category,
          ...(payload.manualGatePassNumber !== undefined && {
            manualGatePassNumber: payload.manualGatePassNumber,
          }),
          ...(payload.stage !== undefined && { stage: payload.stage }),
          bagSizes: destinationBagSizes,
          editHistory: [],
          remarks: payload.remarks,
        },
      ],
      { session }
    ).then((arr) => arr[0]);

    const outgoingGatePassId = await createOutgoingGatePassForTransferStock(
      session,
      {
        farmerStorageLinkId: fromFarmerStorageLinkObjectId,
        gatePassNo: payload.outgoingGatePassNo,
        date: payload.date,
        variety: payload.variety,
        from: payload.from,
        to: payload.to,
        truckNumber: payload.truckNumber,
        remarks: payload.remarks,
        createdById,
        validated,
        storagePassMap,
      }
    );

    const transferItems = buildTransferItems(validated, storagePassMap);

    const transferDoc = await TransferStockGatePass.create(
      [
        {
          fromFarmerStorageLinkId: fromFarmerStorageLinkObjectId,
          toFarmerStorageLinkId: toFarmerStorageLinkObjectId,
          createdBy: createdById ? new Types.ObjectId(createdById) : undefined,
          gatePassNo: payload.gatePassNo,
          date: payload.date,
          variety: payload.variety,
          truckNumber: payload.truckNumber,
          items: transferItems,
          remarks: payload.remarks,
          createdStorageGatePassId: destinationStoragePass._id,
          createdOutgoingGatePassId: outgoingGatePassId,
          idempotencyKey: payload.idempotencyKey,
        },
      ],
      { session }
    ).then((arr) => arr[0]);

    await session.commitTransaction();

    await recordOutgoingGatePassCreateAudit(outgoingGatePassId, {
      gatePassNo: payload.outgoingGatePassNo,
      variety: payload.variety,
      date: payload.date,
      farmerStorageLinkId: fromFarmerStorageLinkObjectId,
      createdById,
    });

    logger?.info(
      {
        transferStockGatePassId: transferDoc._id,
        fromFarmerStorageLinkId: payload.fromFarmerStorageLinkId,
        toFarmerStorageLinkId: payload.toFarmerStorageLinkId,
        gatePassNo: transferDoc.gatePassNo,
        createdStorageGatePassId: destinationStoragePass._id,
        createdOutgoingGatePassId: outgoingGatePassId,
      },
      'Transfer stock gate pass created successfully'
    );

    return formatTransferStockResponse(transferDoc._id as Types.ObjectId);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleTransferStockServiceError(error, logger, {
      message: 'Failed to create transfer stock gate pass',
      code: 'CREATE_TRANSFER_STOCK_ERROR',
    });
  } finally {
    session.endSession();
  }
}
