import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import { IncomingGatePass } from '../incoming-gate-pass/incoming-gate-pass.model.js';
import { GradingGatePass } from '../grading-gate-pass/grading-gate-pass.model.js';
import { FarmerStorageLink } from '../farmer-storage-link/farmer-storage-link.model.js';
import { StorageGatePass } from '../storage-gate-pass/storage-gate-pass.model.js';
import { NikasiGatePass } from '../nikasi-gate-pass/nikasi-gate-pass.model.js';
import { DispatchLedger } from '../dispatch-ledger/dispatch-ledger.model.js';
import { ValidationError, AppError } from '../../../../utils/errors.js';
import { calculateGradingNetWeightKg } from '../../../../utils/calculations.js';
import { JUTE_BAG_WEIGHT } from '../../../../config/constants.js';

export interface OverviewDateFilters {
  dateFrom?: string; // ISO date YYYY-MM-DD, start of day
  dateTo?: string; // ISO date YYYY-MM-DD, end of day
}

export interface OverviewResult {
  totalIncomingBags: number;
  totalIncomingWeight: number;
  totalUngradedBags: number;
  totalUngradedWeight: number;
  totalGradingBags: number;
  totalGradingWeight: number;
  totalBagsStored: number;
  totalBagsDispatched: number;
  totalOutgoingBags: number;
}

/**
 * Get analytics overview for a cold storage with optional date filters.
 * - totalIncomingBags: sum of bags received (IncomingGatePass.bagsReceived)
 * - totalIncomingWeight: sum of (gross - tare) - (bagsReceived * JUTE_BAG_WEIGHT) per pass (net minus bardana/JUTE bag weight)
 * - totalGradingBags: sum of quantity from grading order details
 * - totalGradingWeight: sum over grading lines of (quantity * (weightPerBagKg - bagTypeWeight)), using bag weights from constants
 * - totalUngradedBags / totalUngradedWeight: incoming vouchers that have no grading voucher associated (same weight formula as incoming)
 * - totalBagsStored: sum of bagSizes[].initialQuantity across all storage gate passes
 * - totalBagsDispatched: sum of bagSize[].quantityIssued across nikasi (dispatch) gate passes
 * - totalOutgoingBags: always 0 (outgoing gate pass module removed)
 */
export async function getOverview(
  coldStorageId: string,
  filters: OverviewDateFilters,
  logger?: FastifyBaseLogger
): Promise<OverviewResult> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        'Invalid cold storage ID format',
        'INVALID_COLD_STORAGE_ID'
      );
    }

    // Scope all data to this cold storage only (caller must pass the logged-in user's coldStorageId)
    const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
    const [farmerStorageLinkIds, dispatchLedgerIds] = await Promise.all([
      FarmerStorageLink.find({
        coldStorageId: coldStorageObjectId,
      })
        .distinct('_id')
        .lean(),
      DispatchLedger.find({
        coldStorageId: coldStorageObjectId,
      })
        .distinct('_id')
        .lean(),
    ]);

    if (farmerStorageLinkIds.length === 0 && dispatchLedgerIds.length === 0) {
      return {
        totalIncomingBags: 0,
        totalIncomingWeight: 0,
        totalUngradedBags: 0,
        totalUngradedWeight: 0,
        totalGradingBags: 0,
        totalGradingWeight: 0,
        totalBagsStored: 0,
        totalBagsDispatched: 0,
        totalOutgoingBags: 0,
      };
    }

    // Incoming and grading gate passes only for farmer-storage links belonging to this cold storage
    const matchIncoming: Record<string, unknown> = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
    };
    const matchGrading: Record<string, unknown> = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
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
      matchIncoming.date = matchIncoming.date ?? {};
      (matchIncoming.date as Record<string, unknown>).$gte = start;
      matchGrading.date = matchGrading.date ?? {};
      (matchGrading.date as Record<string, unknown>).$gte = start;
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
      matchIncoming.date = matchIncoming.date ?? {};
      (matchIncoming.date as Record<string, unknown>).$lte = end;
      matchGrading.date = matchGrading.date ?? {};
      (matchGrading.date as Record<string, unknown>).$lte = end;
    }

    const matchStorage: Record<string, unknown> = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
    };
    const matchNikasi: Record<string, unknown> = {
      dispatchLedgerId: { $in: dispatchLedgerIds },
    };
    if (filters.dateFrom) {
      const start = new Date(filters.dateFrom);
      start.setUTCHours(0, 0, 0, 0);
      matchStorage.date = matchStorage.date ?? {};
      (matchStorage.date as Record<string, unknown>).$gte = start;
      matchNikasi.date = matchNikasi.date ?? {};
      (matchNikasi.date as Record<string, unknown>).$gte = start;
    }
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setUTCHours(23, 59, 59, 999);
      matchStorage.date = matchStorage.date ?? {};
      (matchStorage.date as Record<string, unknown>).$lte = end;
      matchNikasi.date = matchNikasi.date ?? {};
      (matchNikasi.date as Record<string, unknown>).$lte = end;
    }

    // Incoming: aggregate bagsReceived and net weight (gross - tare)
    const [incomingAgg] = await IncomingGatePass.aggregate<{
      totalIncomingBags: number;
      totalIncomingWeight: number;
    }>([
      { $match: matchIncoming },
      {
        $group: {
          _id: null,
          totalIncomingBags: { $sum: '$bagsReceived' },
          totalIncomingWeight: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$weightSlip.grossWeightKg', null] },
                    { $ne: ['$weightSlip.tareWeightKg', null] },
                  ],
                },
                then: {
                  $subtract: [
                    {
                      $subtract: [
                        { $ifNull: ['$weightSlip.grossWeightKg', 0] },
                        { $ifNull: ['$weightSlip.tareWeightKg', 0] },
                      ],
                    },
                    { $multiply: ['$bagsReceived', JUTE_BAG_WEIGHT] },
                  ],
                },
                else: 0,
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalIncomingBags: 1,
          totalIncomingWeight: { $round: ['$totalIncomingWeight', 2] },
        },
      },
    ]);

    const totalIncomingBags = incomingAgg?.totalIncomingBags ?? 0;
    const totalIncomingWeight = incomingAgg?.totalIncomingWeight ?? 0;

    // Ungraded incoming: incoming vouchers that have no grading voucher associated
    const gradedIncomingIds = await GradingGatePass.distinct(
      'incomingGatePassIds',
      matchGrading
    );
    const matchUngradedIncoming: Record<string, unknown> = {
      ...matchIncoming,
      _id: { $nin: gradedIncomingIds },
    };
    const [ungradedAgg] = await IncomingGatePass.aggregate<{
      totalUngradedBags: number;
      totalUngradedWeight: number;
    }>([
      { $match: matchUngradedIncoming },
      {
        $group: {
          _id: null,
          totalUngradedBags: { $sum: '$bagsReceived' },
          totalUngradedWeight: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$weightSlip.grossWeightKg', null] },
                    { $ne: ['$weightSlip.tareWeightKg', null] },
                  ],
                },
                then: {
                  $subtract: [
                    {
                      $subtract: [
                        { $ifNull: ['$weightSlip.grossWeightKg', 0] },
                        { $ifNull: ['$weightSlip.tareWeightKg', 0] },
                      ],
                    },
                    { $multiply: ['$bagsReceived', JUTE_BAG_WEIGHT] },
                  ],
                },
                else: 0,
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalUngradedBags: 1,
          totalUngradedWeight: { $round: ['$totalUngradedWeight', 2] },
        },
      },
    ]);
    const totalUngradedBags = ungradedAgg?.totalUngradedBags ?? 0;
    const totalUngradedWeight = ungradedAgg?.totalUngradedWeight ?? 0;

    // Grading: unwind orderDetails, sum quantity and weight per line
    const gradingDocs = await GradingGatePass.find(matchGrading)
      .select('orderDetails')
      .lean();

    let totalGradingBags = 0;
    let totalGradingWeight = 0;

    for (const doc of gradingDocs) {
      const details = doc.orderDetails ?? [];
      totalGradingWeight += calculateGradingNetWeightKg(details);
      for (const d of details) {
        const quantity = Number(d.quantity) || 0;
        totalGradingBags += quantity;
      }
    }

    totalGradingWeight = Math.round(totalGradingWeight * 100) / 100;

    // Storage gate pass: sum of bagSizes[].initialQuantity across all storage gate passes (bags stored)
    const [storageAgg] = await StorageGatePass.aggregate<{
      totalBagsStored: number;
    }>([
      { $match: matchStorage },
      { $unwind: '$bagSizes' },
      {
        $group: {
          _id: null,
          totalBagsStored: { $sum: '$bagSizes.initialQuantity' },
        },
      },
      { $project: { _id: 0, totalBagsStored: 1 } },
    ]);
    const totalBagsStored = storageAgg?.totalBagsStored ?? 0;

    const totalOutgoingBags = 0;

    // Nikasi gate pass: sum of bagSize[].quantityIssued (bags dispatched)
    const [nikasiAgg] = await NikasiGatePass.aggregate<{
      totalBagsDispatched: number;
    }>([
      { $match: matchNikasi },
      { $unwind: '$bagSize' },
      {
        $group: {
          _id: null,
          totalBagsDispatched: { $sum: '$bagSize.quantityIssued' },
        },
      },
      { $project: { _id: 0, totalBagsDispatched: 1 } },
    ]);
    const totalBagsDispatched = nikasiAgg?.totalBagsDispatched ?? 0;

    logger?.info(
      {
        coldStorageId,
        filters,
        totalIncomingBags,
        totalIncomingWeight,
        totalUngradedBags,
        totalUngradedWeight,
        totalGradingBags,
        totalGradingWeight,
        totalBagsStored,
        totalOutgoingBags,
        totalBagsDispatched,
      },
      'Analytics overview computed'
    );

    return {
      totalIncomingBags,
      totalIncomingWeight,
      totalUngradedBags,
      totalUngradedWeight,
      totalGradingBags,
      totalGradingWeight,
      totalBagsStored,
      totalBagsDispatched,
      totalOutgoingBags,
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger?.error(
      { error, coldStorageId, filters },
      'Error computing analytics overview'
    );
    throw new AppError(
      'Failed to compute analytics overview',
      500,
      'ANALYTICS_OVERVIEW_ERROR'
    );
  }
}

/**
 * Analytics service – placeholder for future analytics logic
 */
export function getAnalyticsMessage(): string {
  return 'Send analytics data';
}

/* =======================
   INCOMING ANALYTICS (variety distribution, daily/monthly trend)
======================= */

export interface VarietyDistributionFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface VarietyDistributionResult {
  chartData: Array<{ name: string; value: number }>;
}

/**
 * Variety distribution (total bags per variety) from incoming gate passes for a cold storage.
 * Returns chartData shaped for Recharts (e.g. PieChart: name = variety, value = bags).
 */
export async function getVarietyDistribution(
  coldStorageId: string,
  filters: VarietyDistributionFilters,
  logger?: FastifyBaseLogger
): Promise<VarietyDistributionResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return { chartData: [] };
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
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

  const chartData = await IncomingGatePass.aggregate<{
    name: string;
    value: number;
  }>([
    { $match: match },
    { $group: { _id: '$variety', totalBags: { $sum: '$bagsReceived' } } },
    { $sort: { totalBags: -1 } },
    {
      $project: {
        _id: 0,
        name: '$_id',
        value: '$totalBags',
      },
    },
  ]);

  logger?.info(
    { coldStorageId, count: chartData.length },
    'Variety distribution computed'
  );
  return { chartData };
}

export interface DailyMonthlyTrendFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface DailyMonthlyTrendResult {
  daily: { chartData: Array<{ date: string; bags: number }> };
  monthly: {
    chartData: Array<{ month: string; monthLabel: string; bags: number }>;
  };
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) return ym;
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

/**
 * Daily and monthly trend (bags received per day and per month) from incoming gate passes.
 * Returns both daily and monthly chartData for Recharts (e.g. LineChart, AreaChart).
 */
export async function getDailyMonthlyTrend(
  coldStorageId: string,
  filters: DailyMonthlyTrendFilters,
  logger?: FastifyBaseLogger
): Promise<DailyMonthlyTrendResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return {
      daily: { chartData: [] },
      monthly: { chartData: [] },
    };
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
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

  const [dailyChartData, monthlyRaw] = await Promise.all([
    IncomingGatePass.aggregate<{ date: string; bags: number }>([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          bags: { $sum: '$bagsReceived' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', bags: 1, _id: 0 } },
    ]),
    IncomingGatePass.aggregate<{ month: string; bags: number }>([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          bags: { $sum: '$bagsReceived' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { month: '$_id', bags: 1, _id: 0 } },
    ]),
  ]);

  const daily = { chartData: dailyChartData };
  const monthly = {
    chartData: monthlyRaw.map((r) => ({
      month: r.month,
      monthLabel: formatMonthLabel(r.month),
      bags: r.bags,
    })),
  };

  logger?.info(
    {
      coldStorageId,
      dailyPoints: daily.chartData.length,
      monthlyPoints: monthly.chartData.length,
    },
    'Daily/monthly trend computed'
  );
  return { daily, monthly };
}

/* =======================
   GRADING ANALYTICS (size distribution, area-wise, farmers stock by area)
======================= */

export interface GradingDateFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface SizeDistributionFromGradingResult {
  chartData: Array<{
    variety: string;
    sizes: Array<{ name: string; value: number }>;
  }>;
}

/**
 * Size-wise distribution (total bags per size) from grading gate passes, by variety.
 * Uses quantity per orderDetail. Response chartData for Recharts.
 */
export async function getSizeDistributionFromGrading(
  coldStorageId: string,
  filters: GradingDateFilters,
  logger?: FastifyBaseLogger
): Promise<SizeDistributionFromGradingResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return { chartData: [] };
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
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

  const raw = await GradingGatePass.aggregate<{
    _id: string;
    sizes: Array<{ name: string; value: number }>;
  }>([
    { $match: match },
    { $unwind: '$orderDetails' },
    {
      $group: {
        _id: { variety: '$variety', size: '$orderDetails.size' },
        total: { $sum: '$orderDetails.quantity' },
      },
    },
    { $sort: { '_id.variety': 1, total: -1 } },
    {
      $group: {
        _id: '$_id.variety',
        sizes: {
          $push: {
            name: '$_id.size',
            value: '$total',
          },
        },
      },
    },
  ]);

  const chartData = raw.map((r) => ({ variety: r._id, sizes: r.sizes }));
  logger?.info(
    { coldStorageId, varietyCount: chartData.length },
    'Size distribution from grading computed'
  );
  return { chartData };
}

export interface GradingDailyMonthlyTrendResult {
  daily: {
    chartData: Array<{
      grader: string;
      dataPoints: Array<{ date: string; bags: number }>;
    }>;
  };
  monthly: {
    chartData: Array<{
      grader: string;
      dataPoints: Array<{
        month: string;
        monthLabel: string;
        bags: number;
      }>;
    }>;
  };
}

/**
 * Daily and monthly trend (bags graded per day and per month) from grading gate passes, grouped by grader (createdBy → StoreAdmin name).
 * Returns both daily and monthly chartData for Recharts (e.g. LineChart, AreaChart), each series keyed by grader.
 */
export async function getGradingDailyMonthlyTrend(
  coldStorageId: string,
  filters: GradingDateFilters,
  logger?: FastifyBaseLogger
): Promise<GradingDailyMonthlyTrendResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return {
      daily: { chartData: [] },
      monthly: { chartData: [] },
    };
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
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

  const dailyRaw = await GradingGatePass.aggregate<{
    grader: string;
    dataPoints: Array<{ date: string; bags: number }>;
  }>([
    { $match: match },
    { $unwind: '$orderDetails' },
    {
      $group: {
        _id: {
          dateStr: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          createdBy: { $ifNull: ['$createdBy', null] },
        },
        bags: { $sum: '$orderDetails.quantity' },
      },
    },
    {
      $lookup: {
        from: 'storeadmins',
        localField: '_id.createdBy',
        foreignField: '_id',
        as: 'adminDoc',
      },
    },
    {
      $project: {
        grader: {
          $ifNull: [{ $arrayElemAt: ['$adminDoc.name', 0] }, 'Unspecified'],
        },
        date: '$_id.dateStr',
        bags: 1,
        _id: 0,
      },
    },
    { $sort: { grader: 1, date: 1 } },
    {
      $group: {
        _id: '$grader',
        dataPoints: { $push: { date: '$date', bags: '$bags' } },
      },
    },
    { $project: { grader: '$_id', dataPoints: 1, _id: 0 } },
  ]);

  const monthlyRaw = await GradingGatePass.aggregate<{
    grader: string;
    dataPoints: Array<{ month: string; bags: number }>;
  }>([
    { $match: match },
    { $unwind: '$orderDetails' },
    {
      $group: {
        _id: {
          monthStr: { $dateToString: { format: '%Y-%m', date: '$date' } },
          createdBy: { $ifNull: ['$createdBy', null] },
        },
        bags: { $sum: '$orderDetails.quantity' },
      },
    },
    {
      $lookup: {
        from: 'storeadmins',
        localField: '_id.createdBy',
        foreignField: '_id',
        as: 'adminDoc',
      },
    },
    {
      $project: {
        grader: {
          $ifNull: [{ $arrayElemAt: ['$adminDoc.name', 0] }, 'Unspecified'],
        },
        month: '$_id.monthStr',
        bags: 1,
        _id: 0,
      },
    },
    { $sort: { grader: 1, month: 1 } },
    {
      $group: {
        _id: '$grader',
        dataPoints: { $push: { month: '$month', bags: '$bags' } },
      },
    },
    { $project: { grader: '$_id', dataPoints: 1, _id: 0 } },
  ]);

  const daily = {
    chartData: dailyRaw,
  };
  const monthly = {
    chartData: monthlyRaw.map((r) => ({
      grader: r.grader,
      dataPoints: r.dataPoints.map((p) => ({
        month: p.month,
        monthLabel: formatMonthLabel(p.month),
        bags: p.bags,
      })),
    })),
  };

  logger?.info(
    {
      coldStorageId,
      dailySeries: daily.chartData.length,
      monthlySeries: monthly.chartData.length,
    },
    'Grading daily/monthly trend computed'
  );
  return { daily, monthly };
}

export interface AreaWiseSizeDistributionFromGradingResult {
  chartData: Array<{
    variety: string;
    areas: Array<{
      area: string;
      sizes: Array<{ name: string; value: number }>;
    }>;
  }>;
}

/**
 * Area-wise size distribution from grading gate passes, by variety.
 * Area = farmer address. Uses quantity per orderDetail.
 */
export async function getAreaWiseSizeDistributionFromGrading(
  coldStorageId: string,
  filters: GradingDateFilters,
  logger?: FastifyBaseLogger
): Promise<AreaWiseSizeDistributionFromGradingResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const links = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .populate<{ farmerId: { address: string } }>('farmerId', 'address')
    .lean();

  if (links.length === 0) {
    return { chartData: [] };
  }

  const linkIdToAddress = new Map<string, string>();
  const farmerStorageLinkIds: mongoose.Types.ObjectId[] = [];
  for (const link of links) {
    const linkId = (link._id as mongoose.Types.ObjectId).toString();
    const address =
      link.farmerId &&
      typeof link.farmerId === 'object' &&
      'address' in link.farmerId
        ? (link.farmerId as { address: string }).address
        : '';
    linkIdToAddress.set(linkId, address);
    farmerStorageLinkIds.push(link._id as mongoose.Types.ObjectId);
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
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

  const raw = await GradingGatePass.aggregate<{
    _id: {
      farmerStorageLinkId: mongoose.Types.ObjectId;
      variety: string;
      size: string;
    };
    total: number;
  }>([
    { $match: match },
    { $unwind: '$orderDetails' },
    {
      $group: {
        _id: {
          farmerStorageLinkId: '$farmerStorageLinkId',
          variety: '$variety',
          size: '$orderDetails.size',
        },
        total: { $sum: '$orderDetails.quantity' },
      },
    },
    { $sort: { '_id.variety': 1, '_id.farmerStorageLinkId': 1, total: -1 } },
  ]);

  const byVarietyArea = new Map<
    string,
    Map<string, Array<{ name: string; value: number }>>
  >();
  for (const r of raw) {
    const area =
      linkIdToAddress.get(r._id.farmerStorageLinkId.toString()) ?? '';
    let varietyMap = byVarietyArea.get(r._id.variety);
    if (!varietyMap) {
      varietyMap = new Map();
      byVarietyArea.set(r._id.variety, varietyMap);
    }
    let sizes = varietyMap.get(area);
    if (!sizes) {
      sizes = [];
      varietyMap.set(area, sizes);
    }
    sizes.push({ name: r._id.size, value: r.total });
  }

  const chartData: AreaWiseSizeDistributionFromGradingResult['chartData'] = [];
  for (const [variety, areaMap] of byVarietyArea) {
    const areas = Array.from(areaMap.entries()).map(([area, sizes]) => ({
      area,
      sizes,
    }));
    chartData.push({ variety, areas });
  }
  chartData.sort((a, b) => a.variety.localeCompare(b.variety));

  logger?.info(
    { coldStorageId, varietyCount: chartData.length },
    'Area-wise size distribution from grading computed'
  );
  return { chartData };
}

export interface FarmersStockByAreaResult {
  farmers: Array<{
    farmer: {
      id: string;
      name: string;
      address: string;
      mobileNumber: string;
      accountNumber: number;
    };
    varieties: Array<{
      variety: string;
      sizes: Array<{ size: string; stock: number }>;
    }>;
  }>;
}

/**
 * Farmers and stock (quantity per variety/size) for a given area.
 * Area is matched against farmer address (case-insensitive substring).
 */
export async function getFarmersStockByArea(
  coldStorageId: string,
  area: string,
  logger?: FastifyBaseLogger
): Promise<FarmersStockByAreaResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  if (!area || typeof area !== 'string' || area.trim() === '') {
    throw new ValidationError(
      'area is required and must be a non-empty string',
      'INVALID_AREA'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const areaLower = area.trim().toLowerCase();

  const links = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .populate<{
      farmerId: {
        _id: mongoose.Types.ObjectId;
        name: string;
        address: string;
        mobileNumber: string;
      };
    }>('farmerId', 'name address mobileNumber')
    .lean();

  const matchingLinks = links.filter((link) => {
    const addr =
      link.farmerId &&
      typeof link.farmerId === 'object' &&
      'address' in link.farmerId
        ? (link.farmerId as { address: string }).address
        : '';
    return addr.toLowerCase().includes(areaLower);
  });

  if (matchingLinks.length === 0) {
    return { farmers: [] };
  }

  const farmerStorageLinkIds = matchingLinks.map(
    (l) => l._id as mongoose.Types.ObjectId
  );
  const gradingDocs = await GradingGatePass.find({
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
  })
    .select('farmerStorageLinkId variety orderDetails')
    .lean();

  const byLink = new Map<string, Map<string, Map<string, number>>>();
  for (const doc of gradingDocs) {
    const linkId = doc.farmerStorageLinkId.toString();
    let varietyMap = byLink.get(linkId);
    if (!varietyMap) {
      varietyMap = new Map();
      byLink.set(linkId, varietyMap);
    }
    for (const od of doc.orderDetails) {
      let sizeMap = varietyMap.get(doc.variety);
      if (!sizeMap) {
        sizeMap = new Map();
        varietyMap.set(doc.variety, sizeMap);
      }
      const prev = sizeMap.get(od.size) ?? 0;
      sizeMap.set(od.size, prev + (Number(od.quantity) || 0));
    }
  }

  const farmers: FarmersStockByAreaResult['farmers'] = [];
  for (const link of matchingLinks) {
    const linkId = (link._id as mongoose.Types.ObjectId).toString();
    const farmerObj = link.farmerId as unknown as {
      _id: mongoose.Types.ObjectId;
      name: string;
      address: string;
      mobileNumber: string;
    };
    const varietyMap = byLink.get(linkId);
    const varieties: FarmersStockByAreaResult['farmers'][0]['varieties'] = [];
    if (varietyMap) {
      for (const [variety, sizeMap] of varietyMap) {
        const sizes = Array.from(sizeMap.entries())
          .filter(([, stock]) => stock > 0)
          .map(([size, stock]) => ({ size, stock }));
        if (sizes.length > 0) {
          varieties.push({ variety, sizes });
        }
      }
    }
    farmers.push({
      farmer: {
        id: farmerObj._id.toString(),
        name: farmerObj.name ?? '',
        address: farmerObj.address ?? '',
        mobileNumber: farmerObj.mobileNumber ?? '',
        accountNumber: link.accountNumber ?? 0,
      },
      varieties,
    });
  }

  logger?.info(
    { coldStorageId, area: area.trim(), farmerCount: farmers.length },
    'Farmers stock by area computed'
  );
  return { farmers };
}

/* =======================
   STORAGE ANALYTICS (summary, gate pass report, daily/monthly trend)
======================= */

export interface StorageSummaryDateFilters {
  dateFrom?: string;
  dateTo?: string;
  /** Storage gate passes with these storageCategory values are excluded */
  excludeStorageCategories?: string[];
}

export interface StorageSummarySizeRow {
  size: string;
  initialQuantity: number;
  currentQuantity: number;
  quantityRemoved: number;
  byBagType: Array<{
    bagType: string;
    initialQuantity: number;
    currentQuantity: number;
    quantityRemoved: number;
  }>;
}

export interface StorageSummaryVarietyRow {
  variety: string;
  initialQuantity: number;
  currentQuantity: number;
  quantityRemoved: number;
  sizes: StorageSummarySizeRow[];
}

/**
 * Per-variety storage summary with per-size and per bag-type (JUTE/LENO) breakdown.
 * Optional dateFrom/dateTo filter by gate pass date.
 */
export async function getStorageSummary(
  coldStorageId: string,
  filters: StorageSummaryDateFilters,
  logger?: FastifyBaseLogger
): Promise<StorageSummaryVarietyRow[]> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return [];
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
  };
  if (filters.excludeStorageCategories?.length) {
    match.storageCategory = { $nin: filters.excludeStorageCategories };
  }
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

  const docs = await StorageGatePass.find(match)
    .select('variety bagSizes')
    .lean();

  const byVariety = new Map<
    string,
    Map<string, Map<string, { initial: number; current: number }>>
  >();

  for (const doc of docs) {
    const variety = doc.variety?.trim() || 'Unspecified';
    for (const bs of doc.bagSizes ?? []) {
      const size = bs.size?.trim() || '';
      const bagType = bs.bagType ?? 'JUTE';
      const initial = Number(bs.initialQuantity) || 0;
      const current = Number(bs.currentQuantity) || 0;

      let varietyMap = byVariety.get(variety);
      if (!varietyMap) {
        varietyMap = new Map();
        byVariety.set(variety, varietyMap);
      }
      let sizeMap = varietyMap.get(size);
      if (!sizeMap) {
        sizeMap = new Map();
        varietyMap.set(size, sizeMap);
      }
      let bag = sizeMap.get(bagType);
      if (!bag) {
        bag = { initial: 0, current: 0 };
        sizeMap.set(bagType, bag);
      }
      bag.initial += initial;
      bag.current += current;
    }
  }

  const result: StorageSummaryVarietyRow[] = [];
  for (const [variety, sizeMap] of byVariety) {
    let varietyInitial = 0;
    let varietyCurrent = 0;
    const sizes: StorageSummarySizeRow[] = [];
    for (const [size, bagTypeMap] of sizeMap) {
      const byBagType: StorageSummarySizeRow['byBagType'] = [];
      let sizeInitial = 0;
      let sizeCurrent = 0;
      for (const [bagType, { initial, current }] of bagTypeMap) {
        const removed = initial - current;
        byBagType.push({
          bagType,
          initialQuantity: initial,
          currentQuantity: current,
          quantityRemoved: removed,
        });
        sizeInitial += initial;
        sizeCurrent += current;
      }
      sizes.push({
        size,
        initialQuantity: sizeInitial,
        currentQuantity: sizeCurrent,
        quantityRemoved: sizeInitial - sizeCurrent,
        byBagType,
      });
      varietyInitial += sizeInitial;
      varietyCurrent += sizeCurrent;
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
    'Storage summary computed'
  );
  return result;
}

export interface StorageGatePassReportFilters {
  dateFrom?: string;
  dateTo?: string;
  variety?: string;
  groupByFarmer?: boolean;
  groupByVariety?: boolean;
}

export type StorageGatePassReportData =
  | Array<Record<string, unknown>>
  | Array<{ farmer: Record<string, unknown>; gatePasses: unknown[] }>
  | Array<{
      variety: string;
      farmers: Array<{
        farmer: Record<string, unknown>;
        gatePasses: unknown[];
      }>;
    }>;

/**
 * Storage gate pass report: list of gate passes or grouped by farmer/variety.
 */
export async function getStorageGatePassReport(
  coldStorageId: string,
  filters: StorageGatePassReportFilters,
  logger?: FastifyBaseLogger
): Promise<StorageGatePassReportData> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return [];
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
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
  if (filters.variety != null && filters.variety.trim() !== '') {
    match.variety = filters.variety.trim();
  }

  const passes = await StorageGatePass.find(match)
    .populate({
      path: 'farmerStorageLinkId',
      select: 'accountNumber farmerId',
      populate: [{ path: 'farmerId', select: 'name mobileNumber address' }],
    })
    .sort({ date: -1, gatePassNo: -1 })
    .lean();

  const serializePass = (
    p: (typeof passes)[number]
  ): Record<string, unknown> => {
    const link = p.farmerStorageLinkId as unknown as {
      _id: mongoose.Types.ObjectId;
      accountNumber?: number;
      farmerId?: {
        _id: mongoose.Types.ObjectId;
        name?: string;
        mobileNumber?: string;
        address?: string;
      };
    } | null;
    return {
      _id: (p as { _id: mongoose.Types.ObjectId })._id?.toString(),
      gatePassNo: p.gatePassNo,
      manualGatePassNumber: p.manualGatePassNumber,
      date: p.date,
      variety: p.variety,
      storageCategory: p.storageCategory,
      bagSizes: p.bagSizes,
      remarks: p.remarks,
      farmer: link?.farmerId
        ? {
            id: link.farmerId._id?.toString(),
            name: link.farmerId.name,
            mobileNumber: link.farmerId.mobileNumber,
            address: link.farmerId.address,
          }
        : undefined,
      accountNumber: link?.accountNumber,
    };
  };

  const groupByFarmer = Boolean(filters.groupByFarmer);
  const groupByVariety = Boolean(filters.groupByVariety);

  if (!groupByFarmer && !groupByVariety) {
    return passes.map(serializePass) as StorageGatePassReportData;
  }

  if (groupByVariety && groupByFarmer) {
    const byVariety = new Map<
      string,
      Map<string, { farmer: Record<string, unknown>; gatePasses: unknown[] }>
    >();
    for (const p of passes) {
      const variety = (p.variety?.trim() || 'Unspecified') as string;
      const link = p.farmerStorageLinkId as unknown as {
        farmerId?: {
          _id: mongoose.Types.ObjectId;
          name?: string;
          mobileNumber?: string;
          address?: string;
        };
      } | null;
      const farmerKey = link?.farmerId?._id?.toString() ?? 'unknown';
      const farmerLabel = link?.farmerId
        ? {
            id: farmerKey,
            name: link.farmerId.name,
            mobileNumber: link.farmerId.mobileNumber,
            address: link.farmerId.address,
          }
        : { id: farmerKey, name: '', mobileNumber: '', address: '' };

      let farmerMap = byVariety.get(variety);
      if (!farmerMap) {
        farmerMap = new Map();
        byVariety.set(variety, farmerMap);
      }
      let entry = farmerMap.get(farmerKey);
      if (!entry) {
        entry = { farmer: farmerLabel, gatePasses: [] };
        farmerMap.set(farmerKey, entry);
      }
      entry.gatePasses.push(serializePass(p));
    }
    const result: Array<{
      variety: string;
      farmers: Array<{
        farmer: Record<string, unknown>;
        gatePasses: unknown[];
      }>;
    }> = [];
    for (const [variety, farmerMap] of byVariety) {
      result.push({
        variety,
        farmers: Array.from(farmerMap.values()),
      });
    }
    result.sort((a, b) => a.variety.localeCompare(b.variety));
    logger?.info(
      { coldStorageId, varietyCount: result.length },
      'Storage gate pass report computed (grouped by variety + farmer)'
    );
    return result;
  }

  if (groupByFarmer) {
    const byFarmer = new Map<
      string,
      { farmer: Record<string, unknown>; gatePasses: unknown[] }
    >();
    for (const p of passes) {
      const link = p.farmerStorageLinkId as unknown as {
        farmerId?: {
          _id: mongoose.Types.ObjectId;
          name?: string;
          mobileNumber?: string;
          address?: string;
        };
      } | null;
      const farmerKey = link?.farmerId?._id?.toString() ?? 'unknown';
      const farmerLabel = link?.farmerId
        ? {
            id: farmerKey,
            name: link.farmerId.name,
            mobileNumber: link.farmerId.mobileNumber,
            address: link.farmerId.address,
          }
        : { id: farmerKey, name: '', mobileNumber: '', address: '' };
      if (!byFarmer.has(farmerKey)) {
        byFarmer.set(farmerKey, { farmer: farmerLabel, gatePasses: [] });
      }
      byFarmer.get(farmerKey)!.gatePasses.push(serializePass(p));
    }
    const result = Array.from(byFarmer.values());
    logger?.info(
      { coldStorageId, farmerCount: result.length },
      'Storage gate pass report computed (grouped by farmer)'
    );
    return result;
  }

  if (groupByVariety) {
    const byVariety = new Map<string, unknown[]>();
    for (const p of passes) {
      const variety = (p.variety?.trim() || 'Unspecified') as string;
      if (!byVariety.has(variety)) {
        byVariety.set(variety, []);
      }
      byVariety.get(variety)!.push(serializePass(p));
    }
    const result = Array.from(byVariety.entries()).map(
      ([variety, gatePasses]) => ({
        variety,
        gatePasses,
      })
    );
    result.sort((a, b) => a.variety.localeCompare(b.variety));
    logger?.info(
      { coldStorageId, varietyCount: result.length },
      'Storage gate pass report computed (grouped by variety)'
    );
    return result;
  }

  return passes.map(serializePass) as StorageGatePassReportData;
}

export interface StorageDailyMonthlyTrendFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface StorageDailyMonthlyTrendResult {
  daily: {
    chartData: Array<{
      variety: string;
      dataPoints: Array<{ date: string; bags: number }>;
    }>;
  };
  monthly: {
    chartData: Array<{
      variety: string;
      dataPoints: Array<{ month: string; monthLabel: string; bags: number }>;
    }>;
  };
}

/**
 * Daily and monthly trend (bags stored) from storage gate passes, grouped by variety.
 * Uses initialQuantity only. Recharts-ready (LineChart/AreaChart).
 */
export async function getStorageDailyMonthlyTrend(
  coldStorageId: string,
  filters: StorageDailyMonthlyTrendFilters,
  logger?: FastifyBaseLogger
): Promise<StorageDailyMonthlyTrendResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      'Invalid cold storage ID format',
      'INVALID_COLD_STORAGE_ID'
    );
  }
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct('_id')
    .lean();

  if (farmerStorageLinkIds.length === 0) {
    return {
      daily: { chartData: [] },
      monthly: { chartData: [] },
    };
  }

  const match: Record<string, unknown> = {
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
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

  const docs = await StorageGatePass.find(match)
    .select('date variety bagSizes')
    .lean();

  type VarietyPoints = Map<string, Map<string, number>>;
  const dailyByVariety: VarietyPoints = new Map();
  const monthlyByVariety: VarietyPoints = new Map();

  for (const doc of docs) {
    const variety = doc.variety?.trim() || 'Unspecified';
    const totalBags = (doc.bagSizes ?? []).reduce(
      (sum, bs) => sum + (Number(bs.initialQuantity) || 0),
      0
    );
    if (totalBags <= 0) continue;

    const d = doc.date instanceof Date ? doc.date : new Date(doc.date);
    const dateStr = d.toISOString().slice(0, 10);
    const monthStr = dateStr.slice(0, 7);

    if (!dailyByVariety.has(variety)) {
      dailyByVariety.set(variety, new Map());
    }
    const dailyMap = dailyByVariety.get(variety)!;
    dailyMap.set(dateStr, (dailyMap.get(dateStr) ?? 0) + totalBags);

    if (!monthlyByVariety.has(variety)) {
      monthlyByVariety.set(variety, new Map());
    }
    const monthlyMap = monthlyByVariety.get(variety)!;
    monthlyMap.set(monthStr, (monthlyMap.get(monthStr) ?? 0) + totalBags);
  }

  const dailyChartData = Array.from(dailyByVariety.entries()).map(
    ([variety, dateMap]) => ({
      variety,
      dataPoints: Array.from(dateMap.entries())
        .map(([date, bags]) => ({ date, bags }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    })
  );
  const monthlyChartData = Array.from(monthlyByVariety.entries()).map(
    ([variety, monthMap]) => ({
      variety,
      dataPoints: Array.from(monthMap.entries())
        .map(([month, bags]) => ({
          month,
          monthLabel: formatMonthLabel(month),
          bags,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    })
  );

  logger?.info(
    {
      coldStorageId,
      dailySeries: dailyChartData.length,
      monthlySeries: monthlyChartData.length,
    },
    'Storage daily/monthly trend computed'
  );
  return {
    daily: { chartData: dailyChartData },
    monthly: { chartData: monthlyChartData },
  };
}
