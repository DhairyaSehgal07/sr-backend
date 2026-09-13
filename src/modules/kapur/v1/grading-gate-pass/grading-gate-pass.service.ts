import { GradingGatePass } from './grading-gate-pass.model.js';
import {
  GradingGatePassAudit,
  GradingGatePassAuditState,
} from './grading-gate-pass-audit.model.js';
import {
  GatePassStatus,
  IncomingGatePass,
} from '../incoming-gate-pass/incoming-gate-pass.model.js';
import {
  CreateGradingGatePassInput,
  GradingReport,
  UpdateGradingGatePassInput,
} from './grading-gate-pass.schema.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../../../../utils/errors.js';
import {
  calculateGradingNetWeightKg,
  calculateIncomingNetWeightKg,
  calculateWastageKg,
  calculateWastagePercentage,
  formatNumberMaxTwoDecimals,
  type BagWeightType,
} from '../../../../utils/calculations.js';
import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';

const GRADING_GATE_PASS_SEARCH_RESULT_LIMIT = 100;

const GRADING_GATE_PASS_EDITABLE_FIELDS = [
  'manualGatePassNumber',
  'date',
  'variety',
  'orderDetails',
  'remarks',
] as const;

function serializeAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const serialized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      serialized[key] = serializeAuditValue(nestedValue);
    }
    return serialized;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeAuditValue(item));
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

function buildGradingGatePassAuditDiff(
  existing: Record<string, unknown>,
  payload: UpdateGradingGatePassInput
): {
  previousState: GradingGatePassAuditState;
  modifiedState: GradingGatePassAuditState;
} {
  const previousState: GradingGatePassAuditState = {};
  const modifiedState: GradingGatePassAuditState = {};

  for (const field of GRADING_GATE_PASS_EDITABLE_FIELDS) {
    if (payload[field] === undefined) {
      continue;
    }

    const oldValue = existing[field];
    const newValue = payload[field];

    if (!valuesEqual(oldValue, newValue)) {
      if (oldValue !== undefined) {
        previousState[field] = serializeAuditValue(oldValue) as unknown;
      }
      modifiedState[field] = serializeAuditValue(newValue) as unknown;
    }
  }

  return { previousState, modifiedState };
}

function toObjectIdString(value: unknown): string | null {
  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return value;
  }

  if (value && typeof value === 'object' && '_id' in value) {
    return toObjectIdString((value as { _id: unknown })._id);
  }

  return null;
}

function formatGradingGatePassAuditsForResponse(
  audits: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return audits.map((audit) => ({
    ...audit,
    gradingGatePassId: toObjectIdString(audit.gradingGatePassId),
    editedById: audit.editedById,
  }));
}

function serializeIncomingGatePassIds(ids: unknown[]): string[] {
  return ids.map((id) => {
    if (id instanceof mongoose.Types.ObjectId) {
      return id.toString();
    }
    if (typeof id === 'string') {
      return id;
    }
    return String(id);
  });
}

function buildIncomingGatePassIdsLinkDelinkAudit(
  previousIds: unknown[],
  modifiedIds: unknown[]
): {
  previousState: GradingGatePassAuditState;
  modifiedState: GradingGatePassAuditState;
} {
  const previousIncomingGatePassIds = serializeIncomingGatePassIds(previousIds);
  const modifiedIncomingGatePassIds = serializeIncomingGatePassIds(modifiedIds);

  if (valuesEqual(previousIncomingGatePassIds, modifiedIncomingGatePassIds)) {
    return { previousState: {}, modifiedState: {} };
  }

  return {
    previousState: { incomingGatePassIds: previousIncomingGatePassIds },
    modifiedState: { incomingGatePassIds: modifiedIncomingGatePassIds },
  };
}

type GradingGatePassAuditMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

async function persistGradingGatePassAudit(
  gradingGatePassId: mongoose.Types.ObjectId,
  previousState: GradingGatePassAuditState,
  modifiedState: GradingGatePassAuditState,
  options: {
    editedById?: string;
    requestMetadata?: GradingGatePassAuditMetadata;
    logger?: FastifyBaseLogger;
    logMessage?: string;
    logContext?: Record<string, unknown>;
  }
): Promise<void> {
  if (Object.keys(modifiedState).length === 0) {
    return;
  }

  await GradingGatePassAudit.create({
    gradingGatePassId,
    editedById: options.editedById
      ? new mongoose.Types.ObjectId(options.editedById)
      : undefined,
    previousState,
    modifiedState,
    ipAddress: options.requestMetadata?.ipAddress,
    userAgent: options.requestMetadata?.userAgent,
  });

  options.logger?.info(
    {
      gradingGatePassId: gradingGatePassId.toString(),
      editedById: options.editedById,
      fieldsChanged: Object.keys(modifiedState),
      ...options.logContext,
    },
    options.logMessage ?? 'Audit record created for grading gate pass change'
  );
}

const INCOMING_GATE_PASS_POPULATE_SELECT =
  'gatePassNo manualGatePassNumber bagsReceived truckNumber date weightSlip';

/** Slim shape for populated incoming gate passes in list/search responses */
export interface IncomingGatePassSummary {
  _id: string;
  gatePassNo: number;
  manualGatePassNumber?: number;
  bagsReceived: number;
  truckNumber: string;
  date: string;
  grossWeightKg?: number;
  tareWeightKg?: number;
}

function formatIncomingGatePassForResponse(
  doc: Record<string, unknown>
): IncomingGatePassSummary {
  const weightSlip = doc.weightSlip as
    | { grossWeightKg?: number; tareWeightKg?: number }
    | undefined;

  const id = doc._id;
  const _id =
    id instanceof mongoose.Types.ObjectId
      ? id.toString()
      : typeof id === 'string'
        ? id
        : String(id);

  const date = doc.date;
  const dateIso =
    date instanceof Date
      ? date.toISOString()
      : typeof date === 'string'
        ? date
        : date != null
          ? String(date)
          : '';

  return {
    _id,
    gatePassNo: doc.gatePassNo as number,
    manualGatePassNumber: doc.manualGatePassNumber as number | undefined,
    bagsReceived: (doc.bagsReceived as number) ?? 0,
    truckNumber: (doc.truckNumber as string) ?? '',
    date: dateIso,
    grossWeightKg: weightSlip?.grossWeightKg,
    tareWeightKg: weightSlip?.tareWeightKg,
  };
}

function formatGradingGatePassWithIncomingSummaries(
  doc: Record<string, unknown>
): Record<string, unknown> {
  const incoming = doc.incomingGatePassIds;
  if (!Array.isArray(incoming)) {
    return doc;
  }

  return {
    ...doc,
    incomingGatePassIds: incoming.map((item) =>
      item && typeof item === 'object' && item !== null && 'gatePassNo' in item
        ? formatIncomingGatePassForResponse(item as Record<string, unknown>)
        : item
    ),
  };
}

/**
 * Creates a new grading gate pass
 * @param payload - Grading gate pass data
 * @param logger - Optional logger instance
 * @returns Created grading gate pass document
 * @throws ConflictError if gate pass number already exists or any incoming gate pass is already graded
 * @throws ValidationError if input validation fails
 * @throws NotFoundError if incoming gate pass or created by user not found
 */
export async function createGradingGatePass(
  payload: CreateGradingGatePassInput,
  logger?: FastifyBaseLogger,
  createdBy?: string
) {
  try {
    const incomingGatePassIds = payload.incomingGatePassIds ?? [];
    const incomingGatePasses = await IncomingGatePass.find({
      _id: { $in: incomingGatePassIds },
    }).lean();

    if (incomingGatePasses.length !== incomingGatePassIds.length) {
      const foundIds = new Set(
        incomingGatePasses.map((p) =>
          (p as { _id: mongoose.Types.ObjectId })._id.toString()
        )
      );
      const missing = incomingGatePassIds.filter((id) => !foundIds.has(id));
      logger?.warn(
        { missingIncomingGatePassIds: missing },
        'Attempt to create grading gate pass for non-existent incoming gate pass(s)'
      );
      throw new NotFoundError(
        'One or more incoming gate passes not found',
        'INCOMING_GATE_PASS_NOT_FOUND'
      );
    }

    const alreadyGraded = incomingGatePasses.filter(
      (p) => p.status === GatePassStatus.GRADED
    );
    if (alreadyGraded.length > 0) {
      const gatePassNumbers = alreadyGraded.map((p) => p.gatePassNo);
      logger?.warn(
        {
          incomingGatePassIds: alreadyGraded.map((p) => p._id.toString()),
          gatePassNumbers,
        },
        'Attempt to grade incoming gate pass(es) that are already graded'
      );
      throw new ConflictError(
        `One or more incoming gate passes are already graded (gate pass number(s): ${gatePassNumbers.join(', ')}). Each incoming gate pass can only be graded once.`,
        'INCOMING_GATE_PASS_ALREADY_GRADED'
      );
    }

    const farmerStorageLinkIds = new Set(
      incomingGatePasses.map(
        (p) =>
          (
            p as { farmerStorageLinkId?: mongoose.Types.ObjectId }
          ).farmerStorageLinkId?.toString?.() ?? ''
      )
    );
    if (
      incomingGatePassIds.length > 0 &&
      (farmerStorageLinkIds.size !== 1 ||
        !farmerStorageLinkIds.has(payload.farmerStorageLinkId))
    ) {
      logger?.warn(
        {
          payloadFarmerStorageLinkId: payload.farmerStorageLinkId,
          incomingFarmerStorageLinkIds: [...farmerStorageLinkIds],
        },
        'Farmer storage link must match all incoming gate passes'
      );
      throw new ValidationError(
        'Farmer storage link must match all incoming gate passes',
        'FARMER_STORAGE_LINK_MISMATCH'
      );
    }

    let createdById: mongoose.Types.ObjectId | undefined;
    if (createdBy) {
      const StoreAdmin = mongoose.model('StoreAdmin');
      const storeAdmin = await StoreAdmin.findById(createdBy);

      if (!storeAdmin) {
        logger?.warn(
          { createdBy },
          'Attempt to create grading gate pass with non-existent store admin'
        );
        throw new NotFoundError(
          'Store admin not found',
          'STORE_ADMIN_NOT_FOUND'
        );
      }
      createdById = new mongoose.Types.ObjectId(createdBy);
    }

    const FarmerStorageLink = mongoose.model('FarmerStorageLink');
    const link = await FarmerStorageLink.findById(
      payload.farmerStorageLinkId
    ).lean();
    const coldStorageId = (link as { coldStorageId?: mongoose.Types.ObjectId })
      ?.coldStorageId;
    if (!coldStorageId) {
      throw new NotFoundError(
        'Farmer storage link not found',
        'FARMER_STORAGE_LINK_NOT_FOUND'
      );
    }
    const farmerStorageLinkIdsForColdStorage = await FarmerStorageLink.find({
      coldStorageId,
    })
      .distinct('_id')
      .lean();

    const existing = await GradingGatePass.findOne({
      gatePassNo: payload.gatePassNo,
      farmerStorageLinkId: { $in: farmerStorageLinkIdsForColdStorage },
    });

    if (existing) {
      logger?.warn(
        { gatePassNo: payload.gatePassNo },
        'Attempt to create grading gate pass with existing gate pass number'
      );
      throw new ConflictError(
        'Gate pass with this number already exists',
        'GATE_PASS_NUMBER_EXISTS'
      );
    }

    const gradingGatePass = await GradingGatePass.create({
      ...payload,
      farmerStorageLinkId: new mongoose.Types.ObjectId(
        payload.farmerStorageLinkId
      ),
      incomingGatePassIds:
        incomingGatePassIds.length > 0
          ? incomingGatePassIds.map((id) => new mongoose.Types.ObjectId(id))
          : null,
      ...(createdById && { createdBy: createdById }),
    });

    if (incomingGatePassIds.length > 0) {
      const updateResult = await IncomingGatePass.updateMany(
        {
          _id: { $in: incomingGatePassIds },
          status: GatePassStatus.NOT_GRADED,
        },
        { $set: { status: GatePassStatus.GRADED } }
      );

      if (updateResult.matchedCount !== incomingGatePassIds.length) {
        await GradingGatePass.findByIdAndDelete(gradingGatePass._id);
        logger?.warn(
          {
            incomingGatePassIds,
            matchedCount: updateResult.matchedCount,
          },
          'Incoming gate pass status changed during grading gate pass creation'
        );
        throw new ConflictError(
          'One or more incoming gate passes are already graded. Each incoming gate pass can only be graded once.',
          'INCOMING_GATE_PASS_ALREADY_GRADED'
        );
      }
    }

    logger?.info(
      {
        gradingGatePassId: gradingGatePass._id,
        gatePassNo: gradingGatePass.gatePassNo,
        incomingGatePassIds: gradingGatePass.incomingGatePassIds,
      },
      'Grading gate pass created successfully'
    );

    return gradingGatePass;
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

    if (error instanceof Error && 'code' in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || 'field';
      throw new ConflictError(`${field} already exists`, 'DUPLICATE_KEY_ERROR');
    }

    logger?.error(
      { error, payload },
      'Unexpected error creating grading gate pass'
    );

    throw new AppError(
      'Failed to create grading gate pass',
      500,
      'CREATE_GRADING_GATE_PASS_ERROR'
    );
  }
}

/** Options for getGradingGatePassesByColdStorage (pagination + sort) */
export interface GetGradingGatePassesByColdStorageOptions {
  limit?: number;
  page?: number;
  sortOrder?: 'asc' | 'desc';
}

/** Pagination metadata for grading gate passes list */
export interface GradingGatePassesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Options for getGradingGatePassReport (date range filter, no pagination) */
export interface GetGradingGatePassReportOptions {
  dateFrom?: string;
  dateTo?: string;
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

type GradingGatePassReportLean = {
  _id?: unknown;
  farmerStorageLinkId?: {
    _id?: unknown;
    accountNumber?: number;
    farmerId?: {
      _id?: unknown;
      name?: string;
      address?: string;
    } | null;
  } | null;
  incomingGatePassIds?: Array<{
    _id?: unknown;
    manualGatePassNumber?: number;
    bagsReceived?: number;
    stage?: string;
    category?: string;
    weightSlip?: {
      grossWeightKg?: number;
      tareWeightKg?: number;
    };
  }>;
  createdBy?: {
    _id?: unknown;
    name?: string;
  } | null;
  gatePassNo: number;
  manualGatePassNumber?: number;
  date?: Date | string;
  variety: string;
  orderDetails?: Array<{
    size: string;
    bagType: BagWeightType;
    quantity: number;
    weightPerBagKg: number;
  }>;
  remarks?: string;
};

interface IncomingGatePassReportMapping {
  report: GradingReport['incomingGatePassIds'][number];
  netWeightKg: number | null;
}

function mapFarmerStorageLinkForReport(
  link: GradingGatePassReportLean['farmerStorageLinkId']
): GradingReport['farmerStorageLinkId'] {
  const mappedLink: GradingReport['farmerStorageLinkId'] = {
    _id: toObjectIdString(link?._id) ?? '',
  };

  if (link?.accountNumber != null) {
    mappedLink.accountNumber = link.accountNumber;
  }

  if (link?.farmerId) {
    mappedLink.farmerId = {
      _id: toObjectIdString(link.farmerId._id) ?? '',
      name: link.farmerId.name ?? '',
      address: link.farmerId.address ?? '',
    };
  }

  return mappedLink;
}

function mapIncomingGatePassForGradingReport(
  incomingGatePass: NonNullable<
    GradingGatePassReportLean['incomingGatePassIds']
  >[number]
): IncomingGatePassReportMapping {
  const netWeightKg = calculateIncomingNetWeightKg({
    bagsReceived: incomingGatePass.bagsReceived,
    grossWeightKg: incomingGatePass.weightSlip?.grossWeightKg,
    tareWeightKg: incomingGatePass.weightSlip?.tareWeightKg,
  });

  const report: GradingReport['incomingGatePassIds'][number] = {
    _id: toObjectIdString(incomingGatePass._id) ?? '',
    bagsReceived: incomingGatePass.bagsReceived ?? 0,
    stage: incomingGatePass.stage ?? '',
    category: incomingGatePass.category ?? '',
    netWeightKg:
      netWeightKg == null ? '' : formatNumberMaxTwoDecimals(netWeightKg),
  };

  if (incomingGatePass.manualGatePassNumber != null) {
    report.manualGatePassNumber = incomingGatePass.manualGatePassNumber;
  }

  return { report, netWeightKg };
}

function mapGradingGatePassToReport(
  pass: GradingGatePassReportLean
): GradingReport {
  const incomingGatePassMappings = (pass.incomingGatePassIds ?? []).map(
    mapIncomingGatePassForGradingReport
  );
  const incomingNetWeightKg = incomingGatePassMappings.reduce(
    (total, item) => total + (item.netWeightKg ?? 0),
    0
  );
  const orderDetails = pass.orderDetails ?? [];
  const totalBags = orderDetails.reduce(
    (total, detail) => total + (detail.quantity ?? 0),
    0
  );
  const netWeightKg = calculateGradingNetWeightKg(orderDetails);
  const wastageKg = calculateWastageKg(incomingNetWeightKg, netWeightKg);
  const wastagePercentage = calculateWastagePercentage(
    wastageKg,
    incomingNetWeightKg
  );

  const report: GradingReport = {
    _id: toObjectIdString(pass._id) ?? '',
    farmerStorageLinkId: mapFarmerStorageLinkForReport(
      pass.farmerStorageLinkId
    ),
    incomingGatePassIds: incomingGatePassMappings.map((item) => item.report),
    gatePassNo: pass.gatePassNo,
    date: formatReportDateTime(pass.date),
    variety: pass.variety,
    orderDetails,
    totalBags,
    incomingNetWeightKg: formatNumberMaxTwoDecimals(incomingNetWeightKg),
    netWeightKg: formatNumberMaxTwoDecimals(netWeightKg),
    wastageKg: formatNumberMaxTwoDecimals(wastageKg),
    wastagePercentage:
      wastagePercentage == null
        ? ''
        : formatNumberMaxTwoDecimals(wastagePercentage),
  };

  if (pass.createdBy) {
    report.createdBy = {
      _id: toObjectIdString(pass.createdBy._id) ?? '',
      name: pass.createdBy.name ?? '',
    };
  }
  if (pass.manualGatePassNumber != null) {
    report.manualGatePassNumber = pass.manualGatePassNumber;
  }
  if (pass.remarks != null) {
    report.remarks = pass.remarks;
  }

  return report;
}

/**
 * Retrieves grading gate passes for a cold storage with pagination.
 */
export async function getGradingGatePassesByColdStorage(
  coldStorageId: string,
  options: GetGradingGatePassesByColdStorageOptions = {},
  logger?: FastifyBaseLogger
): Promise<{
  gradingGatePasses: Array<Record<string, unknown>>;
  pagination: GradingGatePassesPagination;
}> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const sortOrder = options.sortOrder ?? 'desc';
    const sortDir = sortOrder === 'desc' ? -1 : 1;

    const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

    const FarmerStorageLink = mongoose.model('FarmerStorageLink');
    const farmerStorageLinkIds = await FarmerStorageLink.find({
      coldStorageId: coldStorageObjectId,
    })
      .distinct('_id')
      .lean();

    const IncomingGatePass = mongoose.model('IncomingGatePass');
    const incomingGatePassIds = await IncomingGatePass.find({
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
    })
      .distinct('_id')
      .lean();

    const filter: Record<string, unknown> = {
      incomingGatePassIds: { $in: incomingGatePassIds },
    };

    const [total, gradingGatePasses] = await Promise.all([
      GradingGatePass.countDocuments(filter),
      GradingGatePass.find(filter)
        .populate({
          path: 'farmerStorageLinkId',
          select: 'accountNumber',
          populate: { path: 'farmerId', select: 'name' },
        })
        .populate({
          path: 'incomingGatePassIds',
          select: INCOMING_GATE_PASS_POPULATE_SELECT,
        })
        .populate('createdBy', 'name mobileNumber')
        .sort({ gatePassNo: sortDir, date: sortDir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger?.info(
      {
        coldStorageId,
        count: gradingGatePasses.length,
        total,
        page,
        limit,
      },
      'Retrieved grading gate passes by cold storage'
    );

    return {
      gradingGatePasses: gradingGatePasses.map((gp) =>
        formatGradingGatePassWithIncomingSummaries(
          gp as unknown as Record<string, unknown>
        )
      ),
      pagination: { page, limit, total, totalPages },
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving grading gate passes by cold storage'
    );

    throw new AppError(
      'Failed to retrieve grading gate passes',
      500,
      'GET_GRADING_GATE_PASSES_ERROR'
    );
  }
}

/**
 * Retrieves all grading gate passes for a cold storage within an optional date range (no pagination).
 */
export async function getGradingGatePassReport(
  coldStorageId: string,
  options: GetGradingGatePassReportOptions = {},
  logger?: FastifyBaseLogger
): Promise<{ gradingGatePasses: GradingReport[] }> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const farmerStorageLinkIds =
      await getFarmerStorageLinkIdsForColdStorage(coldStorageId);

    const filter: Record<string, unknown> = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
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

    const gradingGatePasses = await GradingGatePass.find(filter)
      .populate({
        path: 'farmerStorageLinkId',
        select: 'accountNumber farmerId',
        populate: { path: 'farmerId', select: 'name address' },
      })
      .populate({
        path: 'incomingGatePassIds',
        select:
          '_id manualGatePassNumber bagsReceived stage category weightSlip',
      })
      .populate('createdBy', 'name')
      .sort({ gatePassNo: -1, date: -1 })
      .lean();

    logger?.info(
      {
        coldStorageId,
        count: gradingGatePasses.length,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      },
      'Retrieved grading gate pass report'
    );

    return {
      gradingGatePasses: (
        gradingGatePasses as unknown as GradingGatePassReportLean[]
      ).map(mapGradingGatePassToReport),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      'Error retrieving grading gate pass report'
    );

    throw new AppError(
      'Failed to retrieve grading gate pass report',
      500,
      'GET_GRADING_GATE_PASS_REPORT_ERROR'
    );
  }
}

/**
 * Retrieves a single grading gate pass by ID for the authenticated cold storage.
 */
export async function getGradingGatePassById(
  gradingGatePassId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger
): Promise<Record<string, unknown>> {
  try {
    if (!mongoose.Types.ObjectId.isValid(gradingGatePassId)) {
      throw new ValidationError(
        'Invalid grading gate pass ID format',
        'INVALID_ID'
      );
    }

    const farmerStorageLinkIds =
      await getFarmerStorageLinkIdsForColdStorage(coldStorageId);

    const gradingGatePass = await GradingGatePass.findOne({
      _id: new mongoose.Types.ObjectId(gradingGatePassId),
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
    })
      .populate({
        path: 'farmerStorageLinkId',
        select: 'accountNumber',
        populate: { path: 'farmerId', select: 'name' },
      })
      .populate({
        path: 'incomingGatePassIds',
        select: INCOMING_GATE_PASS_POPULATE_SELECT,
      })
      .populate('createdBy', 'name mobileNumber')
      .lean();

    if (!gradingGatePass) {
      throw new NotFoundError(
        'Grading gate pass not found',
        'GRADING_GATE_PASS_NOT_FOUND'
      );
    }

    logger?.info(
      { gradingGatePassId, coldStorageId },
      'Retrieved grading gate pass by ID'
    );

    return formatGradingGatePassWithIncomingSummaries(
      gradingGatePass as unknown as Record<string, unknown>
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, gradingGatePassId, coldStorageId },
      'Error retrieving grading gate pass by ID'
    );

    throw new AppError(
      'Failed to retrieve grading gate pass',
      500,
      'GET_GRADING_GATE_PASS_ERROR'
    );
  }
}

/**
 * Searches grading gate passes within a cold storage by exact gate pass number.
 * Matches documents where `number` equals either `gatePassNo` or `manualGatePassNumber`.
 */
export async function searchGradingGatePassesByNumber(
  coldStorageId: string,
  number: number,
  logger?: FastifyBaseLogger
): Promise<{ gradingGatePasses: Array<Record<string, unknown>> }> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

    const FarmerStorageLink = mongoose.model('FarmerStorageLink');
    const farmerStorageLinkIds = await FarmerStorageLink.find({
      coldStorageId: coldStorageObjectId,
    })
      .distinct('_id')
      .lean();

    if (farmerStorageLinkIds.length === 0) {
      return { gradingGatePasses: [] };
    }

    const filter = {
      $and: [
        { farmerStorageLinkId: { $in: farmerStorageLinkIds } },
        { $or: [{ gatePassNo: number }, { manualGatePassNumber: number }] },
      ],
    };

    const gradingGatePasses = await GradingGatePass.find(filter)
      .populate({
        path: 'farmerStorageLinkId',
        select: 'accountNumber',
        populate: { path: 'farmerId', select: 'name' },
      })
      .populate({
        path: 'incomingGatePassIds',
        select: INCOMING_GATE_PASS_POPULATE_SELECT,
      })
      .populate('createdBy', 'name mobileNumber')
      .sort({ gatePassNo: -1, date: -1 })
      .limit(GRADING_GATE_PASS_SEARCH_RESULT_LIMIT)
      .lean();

    logger?.info(
      { coldStorageId, number, count: gradingGatePasses.length },
      'Searched grading gate passes by number'
    );

    return {
      gradingGatePasses: gradingGatePasses.map((gp) =>
        formatGradingGatePassWithIncomingSummaries(
          gp as unknown as Record<string, unknown>
        )
      ),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId, number },
      'Error searching grading gate passes by number'
    );

    throw new AppError(
      'Failed to search grading gate passes',
      500,
      'SEARCH_GRADING_GATE_PASSES_ERROR'
    );
  }
}

async function getFarmerStorageLinkIdsForColdStorage(
  coldStorageId: string
): Promise<mongoose.Types.ObjectId[]> {
  const FarmerStorageLink = mongoose.model('FarmerStorageLink');
  return FarmerStorageLink.find({
    coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
  })
    .distinct('_id')
    .lean();
}

async function findGradingGatePassInColdStorage(
  gradingGatePassId: string,
  coldStorageId: string
) {
  if (!mongoose.Types.ObjectId.isValid(gradingGatePassId)) {
    throw new ValidationError(
      'Invalid grading gate pass ID format',
      'INVALID_ID'
    );
  }

  const farmerStorageLinkIds =
    await getFarmerStorageLinkIdsForColdStorage(coldStorageId);

  const gradingGatePass = await GradingGatePass.findOne({
    _id: new mongoose.Types.ObjectId(gradingGatePassId),
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
  }).lean();

  if (!gradingGatePass) {
    throw new NotFoundError(
      'Grading gate pass not found',
      'GRADING_GATE_PASS_NOT_FOUND'
    );
  }

  return gradingGatePass;
}

/**
 * Updates a grading gate pass. Allowed fields: variety, date, manualGatePassNumber, orderDetails, remarks.
 */
export async function updateGradingGatePass(
  gradingGatePassId: string,
  coldStorageId: string,
  payload: UpdateGradingGatePassInput,
  logger?: FastifyBaseLogger,
  editedById?: string,
  requestMetadata?: { ipAddress?: string; userAgent?: string }
): Promise<Record<string, unknown>> {
  try {
    const existing = await findGradingGatePassInColdStorage(
      gradingGatePassId,
      coldStorageId
    );

    const { previousState, modifiedState } = buildGradingGatePassAuditDiff(
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

    const updatedGradingGatePass = await GradingGatePass.findByIdAndUpdate(
      gradingGatePassId,
      updateQuery,
      { new: true, runValidators: true }
    )
      .populate({
        path: 'farmerStorageLinkId',
        select: 'accountNumber',
        populate: { path: 'farmerId', select: 'name' },
      })
      .populate({
        path: 'incomingGatePassIds',
        select: INCOMING_GATE_PASS_POPULATE_SELECT,
      })
      .populate('createdBy', 'name mobileNumber')
      .lean();

    if (!updatedGradingGatePass) {
      throw new NotFoundError(
        'Grading gate pass not found',
        'GRADING_GATE_PASS_NOT_FOUND'
      );
    }

    if (hasAuditChanges) {
      await persistGradingGatePassAudit(
        existing._id as mongoose.Types.ObjectId,
        previousState,
        modifiedState,
        {
          editedById,
          requestMetadata,
          logger,
          logMessage: 'Audit record created for grading gate pass update',
        }
      );
    }

    logger?.info(
      { gradingGatePassId, fieldsUpdated: Object.keys(payload) },
      'Grading gate pass updated successfully'
    );

    return formatGradingGatePassWithIncomingSummaries(
      updatedGradingGatePass as unknown as Record<string, unknown>
    );
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

    logger?.error(
      { error, gradingGatePassId, payload },
      'Error updating grading gate pass'
    );

    throw new AppError(
      'Failed to update grading gate pass',
      500,
      'UPDATE_GRADING_GATE_PASS_ERROR'
    );
  }
}

/**
 * Retrieves grading gate pass audit records for a cold storage.
 */
export async function getGradingGatePassAuditsByColdStorage(
  coldStorageId: string,
  options: { limit?: number; page?: number } = {},
  logger?: FastifyBaseLogger
): Promise<{
  audits: Array<Record<string, unknown>>;
  pagination: GradingGatePassesPagination;
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

    const farmerStorageLinkIds =
      await getFarmerStorageLinkIdsForColdStorage(coldStorageId);

    const emptyPagination = { page, limit, total: 0, totalPages: 0 };

    if (farmerStorageLinkIds.length === 0) {
      return { audits: [], pagination: emptyPagination };
    }

    const gradingGatePassIds = await GradingGatePass.find({
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
    })
      .distinct('_id')
      .lean();

    if (gradingGatePassIds.length === 0) {
      return { audits: [], pagination: emptyPagination };
    }

    const filter = {
      gradingGatePassId: { $in: gradingGatePassIds },
    };

    const [total, audits] = await Promise.all([
      GradingGatePassAudit.countDocuments(filter),
      GradingGatePassAudit.find(filter)
        .populate('editedById', 'name mobileNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit);
    const formattedAudits = formatGradingGatePassAuditsForResponse(
      audits as unknown as Array<Record<string, unknown>>
    );

    logger?.info(
      { coldStorageId, count: formattedAudits.length, total, page, limit },
      'Retrieved grading gate pass audits by cold storage'
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
      'Error retrieving grading gate pass audits by cold storage'
    );

    throw new AppError(
      'Failed to retrieve grading gate pass audits',
      500,
      'GET_GRADING_GATE_PASS_AUDITS_ERROR'
    );
  }
}

/**
 * Links an incoming gate pass to a grading gate pass and marks it GRADED.
 */
export async function linkIncomingGatePassToGradingGatePass(
  gradingGatePassId: string,
  incomingGatePassId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
  editedById?: string,
  requestMetadata?: GradingGatePassAuditMetadata
) {
  try {
    const gradingGatePass = await findGradingGatePassInColdStorage(
      gradingGatePassId,
      coldStorageId
    );

    if (!mongoose.Types.ObjectId.isValid(incomingGatePassId)) {
      throw new ValidationError(
        'Invalid incoming gate pass ID format',
        'INVALID_INCOMING_GATE_PASS_ID'
      );
    }

    const incomingObjectId = new mongoose.Types.ObjectId(incomingGatePassId);
    const alreadyLinked = (gradingGatePass.incomingGatePassIds ?? []).some(
      (id) => id.toString() === incomingGatePassId
    );
    if (alreadyLinked) {
      throw new ConflictError(
        'Incoming gate pass is already linked to this grading gate pass',
        'INCOMING_GATE_PASS_ALREADY_LINKED'
      );
    }

    const incomingGatePass =
      await IncomingGatePass.findById(incomingObjectId).lean();

    if (!incomingGatePass) {
      throw new NotFoundError(
        'Incoming gate pass not found',
        'INCOMING_GATE_PASS_NOT_FOUND'
      );
    }

    if (incomingGatePass.status === GatePassStatus.GRADED) {
      throw new ConflictError(
        `Incoming gate pass ${incomingGatePass.gatePassNo} is already graded and linked elsewhere`,
        'INCOMING_GATE_PASS_ALREADY_GRADED'
      );
    }

    const gradingFarmerLinkId = gradingGatePass.farmerStorageLinkId.toString();
    if (
      incomingGatePass.farmerStorageLinkId.toString() !== gradingFarmerLinkId
    ) {
      throw new ValidationError(
        'Incoming gate pass must belong to the same farmer storage link as the grading gate pass',
        'FARMER_STORAGE_LINK_MISMATCH'
      );
    }

    const linkedElsewhere = await GradingGatePass.findOne({
      incomingGatePassIds: incomingObjectId,
      _id: { $ne: gradingGatePass._id },
    }).lean();

    if (linkedElsewhere) {
      throw new ConflictError(
        'Incoming gate pass is already linked to another grading gate pass',
        'INCOMING_GATE_PASS_ALREADY_GRADED'
      );
    }

    if (!Array.isArray(gradingGatePass.incomingGatePassIds)) {
      await GradingGatePass.updateOne(
        { _id: gradingGatePass._id },
        { $set: { incomingGatePassIds: [] } }
      );
    }

    const updatedGradingGatePass = await GradingGatePass.findByIdAndUpdate(
      gradingGatePassId,
      { $addToSet: { incomingGatePassIds: incomingObjectId } },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedGradingGatePass) {
      throw new NotFoundError(
        'Grading gate pass not found',
        'GRADING_GATE_PASS_NOT_FOUND'
      );
    }

    const statusUpdate = await IncomingGatePass.updateOne(
      { _id: incomingObjectId, status: GatePassStatus.NOT_GRADED },
      { $set: { status: GatePassStatus.GRADED } }
    );

    if (statusUpdate.matchedCount === 0) {
      await GradingGatePass.findByIdAndUpdate(gradingGatePassId, {
        $pull: { incomingGatePassIds: incomingObjectId },
      });
      throw new ConflictError(
        'Incoming gate pass is already graded. Each incoming gate pass can only be graded once.',
        'INCOMING_GATE_PASS_ALREADY_GRADED'
      );
    }

    const { previousState, modifiedState } =
      buildIncomingGatePassIdsLinkDelinkAudit(
        gradingGatePass.incomingGatePassIds ?? [],
        updatedGradingGatePass.incomingGatePassIds ?? []
      );

    await persistGradingGatePassAudit(
      gradingGatePass._id as mongoose.Types.ObjectId,
      previousState,
      modifiedState,
      {
        editedById,
        requestMetadata,
        logger,
        logMessage: 'Audit record created for grading gate pass link',
        logContext: { incomingGatePassId, action: 'LINK' },
      }
    );

    logger?.info(
      { gradingGatePassId, incomingGatePassId },
      'Incoming gate pass linked to grading gate pass'
    );

    return updatedGradingGatePass;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError
    ) {
      throw error;
    }

    logger?.error(
      { error, gradingGatePassId, incomingGatePassId },
      'Error linking incoming gate pass to grading gate pass'
    );

    throw new AppError(
      'Failed to link incoming gate pass',
      500,
      'LINK_INCOMING_GATE_PASS_ERROR'
    );
  }
}

/**
 * Delinks an incoming gate pass from a grading gate pass and marks it NOT_GRADED.
 */
export async function delinkIncomingGatePassFromGradingGatePass(
  gradingGatePassId: string,
  incomingGatePassId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
  editedById?: string,
  requestMetadata?: GradingGatePassAuditMetadata
) {
  try {
    const gradingGatePass = await findGradingGatePassInColdStorage(
      gradingGatePassId,
      coldStorageId
    );

    if (!mongoose.Types.ObjectId.isValid(incomingGatePassId)) {
      throw new ValidationError(
        'Invalid incoming gate pass ID format',
        'INVALID_INCOMING_GATE_PASS_ID'
      );
    }

    const incomingIds = (gradingGatePass.incomingGatePassIds ?? []).map((id) =>
      id.toString()
    );

    if (!incomingIds.includes(incomingGatePassId)) {
      throw new NotFoundError(
        'Incoming gate pass is not linked to this grading gate pass',
        'INCOMING_GATE_PASS_NOT_LINKED'
      );
    }

    const incomingObjectId = new mongoose.Types.ObjectId(incomingGatePassId);

    const updatedGradingGatePass = await GradingGatePass.findByIdAndUpdate(
      gradingGatePassId,
      { $pull: { incomingGatePassIds: incomingObjectId } },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedGradingGatePass) {
      throw new NotFoundError(
        'Grading gate pass not found',
        'GRADING_GATE_PASS_NOT_FOUND'
      );
    }

    await IncomingGatePass.updateOne(
      { _id: incomingObjectId },
      { $set: { status: GatePassStatus.NOT_GRADED } }
    );

    const { previousState, modifiedState } =
      buildIncomingGatePassIdsLinkDelinkAudit(
        gradingGatePass.incomingGatePassIds ?? [],
        updatedGradingGatePass.incomingGatePassIds ?? []
      );

    await persistGradingGatePassAudit(
      gradingGatePass._id as mongoose.Types.ObjectId,
      previousState,
      modifiedState,
      {
        editedById,
        requestMetadata,
        logger,
        logMessage: 'Audit record created for grading gate pass delink',
        logContext: { incomingGatePassId, action: 'DELINK' },
      }
    );

    logger?.info(
      { gradingGatePassId, incomingGatePassId },
      'Incoming gate pass delinked from grading gate pass'
    );

    return updatedGradingGatePass;
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

    logger?.error(
      { error, gradingGatePassId, incomingGatePassId },
      'Error delinking incoming gate pass from grading gate pass'
    );

    throw new AppError(
      'Failed to delink incoming gate pass',
      500,
      'DELINK_INCOMING_GATE_PASS_ERROR'
    );
  }
}
