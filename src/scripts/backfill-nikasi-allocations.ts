/**
 * Replay existing nikasi gate passes against opening shed and booking stock
 * and store the exact lines each pass deducted.
 *
 * Run with: pnpm backfill:nikasi-allocations
 * Requires MONGO_URI in env (for example from .env).
 * Writes nothing when the replay does not match live quantities.
 */
import { config } from 'dotenv';
config();

import mongoose, { Types } from 'mongoose';
import { connectDB } from '../config/database.js';
import { Booking } from '../modules/kapur/v1/booking/booking.model.js';
import { DispatchLedger } from '../modules/kapur/v1/dispatch-ledger/dispatch-ledger.model.js';
import { FarmerStorageLink } from '../modules/kapur/v1/farmer-storage-link/farmer-storage-link.model.js';
import {
  NikasiGatePass,
  NikasiGatePassStatus,
  type INikasiBookingDeduction,
  type INikasiShedDeduction,
} from '../modules/kapur/v1/nikasi-gate-pass/nikasi-gate-pass.model.js';
import {
  computeFifoBookingDeductions,
  computeFifoShedDeductions,
  type BookingLean,
  type RequestedBagLine,
  type ShedPassLean,
} from '../modules/kapur/v1/nikasi-gate-pass/nikasi-gate-pass.service.js';
import {
  OutgoingGatePass,
  OutgoingGatePassStatus,
} from '../modules/kapur/v1/outgoing-gate-pass/outgoing-gate-pass.model.js';
import { OUTGOING_TO_SHED_CATEGORY } from '../modules/kapur/v1/outgoing-gate-pass/outgoing-gate-pass.service.js';
import { ValidationError } from '../utils/errors.js';

type ShedDeduction = ReturnType<typeof computeFifoShedDeductions>[number];
type BookingDeduction = ReturnType<typeof computeFifoBookingDeductions>[number];

interface ReplayUpdate {
  id: Types.ObjectId;
  set: {
    shedDeductions?: INikasiShedDeduction[];
    bookingDeductions?: INikasiBookingDeduction[];
    status?: NikasiGatePassStatus;
  };
}

function locationKey(parts: {
  size: string;
  bagType: string;
  chamber: string;
  floor: string;
  row: string;
}): string {
  return [
    parts.size,
    parts.bagType,
    parts.chamber,
    parts.floor,
    parts.row,
  ].join('\0');
}

function storedShedFromReplay(
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

function storedBookingFromReplay(
  deductions: BookingDeduction[]
): INikasiBookingDeduction[] {
  return deductions.map((deduction) => ({
    bookingId: deduction.bookingId,
    size: deduction.size,
    variety: deduction.variety,
    quantity: deduction.deductAmount,
  }));
}

function deductionSignature(
  deductions: Array<{
    outgoingGatePassId?: Types.ObjectId;
    bookingId?: Types.ObjectId;
    size: string;
    bagType?: string;
    variety?: string;
    chamber?: string;
    floor?: string;
    row?: string;
    quantity: number;
  }>
): string {
  return deductions
    .map((deduction) =>
      [
        deduction.outgoingGatePassId?.toString() ??
          deduction.bookingId?.toString() ??
          '',
        deduction.size,
        deduction.bagType ?? deduction.variety ?? '',
        deduction.chamber ?? '',
        deduction.floor ?? '',
        deduction.row ?? '',
        deduction.quantity,
      ].join('|')
    )
    .sort()
    .join(';');
}

function applyShedDeductions(
  working: ShedPassLean[],
  deductions: ShedDeduction[]
): void {
  for (const deduction of deductions) {
    const pass = working.find((entry) =>
      entry._id.equals(deduction.outgoingGatePassId)
    );
    if (!pass) {
      throw new ValidationError(
        `Replay deduction targets missing outgoing pass ${deduction.outgoingGatePassId.toString()}`,
        'REPLAY_OUTGOING_MISSING'
      );
    }

    const matches = pass.orderDetails.filter(
      (detail) =>
        detail.size === deduction.size &&
        detail.bagType === deduction.bagType &&
        detail.chamber === deduction.chamber &&
        detail.floor === deduction.floor &&
        detail.row === deduction.row
    );
    if (matches.length !== 1) {
      throw new ValidationError(
        `Replay expected 1 shed line, found ${matches.length}`,
        'REPLAY_SHED_LINE'
      );
    }

    const line = matches[0];
    if (!line || line.quantityIssued < deduction.deductAmount) {
      throw new ValidationError(
        'Replay shed line does not have the deducted quantity',
        'REPLAY_SHED_QUANTITY'
      );
    }
    line.quantityIssued -= deduction.deductAmount;
  }
}

function applyBookingDeductions(
  working: BookingLean[],
  deductions: BookingDeduction[]
): void {
  for (const deduction of deductions) {
    const booking = working.find((entry) =>
      entry._id.equals(deduction.bookingId)
    );
    if (!booking) {
      throw new ValidationError(
        `Replay deduction targets missing booking ${deduction.bookingId.toString()}`,
        'REPLAY_BOOKING_MISSING'
      );
    }

    const matches = booking.bagSizes.filter(
      (line) =>
        line.size === deduction.size && line.variety === deduction.variety
    );
    if (matches.length !== 1) {
      throw new ValidationError(
        `Replay expected 1 booking line, found ${matches.length}`,
        'REPLAY_BOOKING_LINE'
      );
    }

    const line = matches[0];
    if (!line || line.currentQuantity < deduction.deductAmount) {
      throw new ValidationError(
        'Replay booking line does not have the deducted quantity',
        'REPLAY_BOOKING_QUANTITY'
      );
    }
    line.currentQuantity -= deduction.deductAmount;
  }
}

interface ReplayPass {
  _id: Types.ObjectId;
  date: Date;
  createdAt: Date;
  gatePassNo: number;
  isBooked?: boolean;
  status?: string;
  dispatchLedgerId: Types.ObjectId;
  bagSize?: RequestedBagLine[];
  shedDeductions?: INikasiShedDeduction[];
  bookingDeductions?: INikasiBookingDeduction[];
}

interface ReplayOutgoing {
  _id: Types.ObjectId;
  date: Date;
  createdAt: Date;
  gatePassNo: number;
  variety: string;
  orderDetails: ShedPassLean['orderDetails'];
  storageGatePassSnapshots?: Array<{
    bagSizes?: Array<{
      size: string;
      bagType: string;
      chamber: string;
      floor: string;
      row: string;
      quantityIssued: number;
    }>;
  }>;
}

function compareByDate(
  left: ReplayPass | ReplayOutgoing,
  right: ReplayPass | ReplayOutgoing
) {
  const dateDiff =
    new Date(left.date).getTime() - new Date(right.date).getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }
  const createdDiff =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return left.gatePassNo - right.gatePassNo;
}

function compareByCreatedAt(
  left: ReplayPass | ReplayOutgoing,
  right: ReplayPass | ReplayOutgoing
) {
  const createdDiff =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return left.gatePassNo - right.gatePassNo;
}

function openingShed(outgoingPasses: ReplayOutgoing[]): ShedPassLean[] {
  const workingShed: ShedPassLean[] = [];
  for (const outgoing of outgoingPasses) {
    const opening = new Map<string, number>();
    for (const snapshot of outgoing.storageGatePassSnapshots ?? []) {
      for (const bag of snapshot.bagSizes ?? []) {
        const key = locationKey(bag);
        opening.set(key, (opening.get(key) ?? 0) + bag.quantityIssued);
      }
    }

    const seen = new Set<string>();
    const orderDetails: ShedPassLean['orderDetails'] = [];
    for (const detail of outgoing.orderDetails ?? []) {
      const key = locationKey(detail);
      if (seen.has(key)) {
        throw new ValidationError(
          `Outgoing ${outgoing._id.toString()} has duplicate order detail ${key}`,
          'DUPLICATE_ORDER_DETAIL'
        );
      }
      seen.add(key);
      const quantityIssued = opening.get(key);
      if (quantityIssued === undefined) {
        throw new ValidationError(
          `Outgoing ${outgoing._id.toString()} has no snapshot opening for ${key}`,
          'MISSING_SNAPSHOT_OPENING'
        );
      }
      orderDetails.push({
        size: detail.size,
        bagType: detail.bagType,
        quantityIssued,
        chamber: detail.chamber,
        floor: detail.floor,
        row: detail.row,
      });
    }

    workingShed.push({
      _id: outgoing._id,
      variety: outgoing.variety,
      orderDetails,
    });
  }
  return workingShed;
}

function remainderMismatches(
  outgoingPasses: ReplayOutgoing[],
  workingShed: ShedPassLean[]
): string[] {
  const mismatches: string[] = [];
  for (const outgoing of outgoingPasses) {
    const working = workingShed.find((entry) => entry._id.equals(outgoing._id));
    for (const detail of outgoing.orderDetails ?? []) {
      const replayed = working?.orderDetails.find(
        (line) => locationKey(line) === locationKey(detail)
      );
      if (!replayed || replayed.quantityIssued !== detail.quantityIssued) {
        mismatches.push(
          `Shed remainder mismatch on outgoing ${outgoing._id.toString()} ${locationKey(detail)}: replayed ${replayed?.quantityIssued ?? 'missing'}, live ${detail.quantityIssued}`
        );
      }
    }
  }
  return mismatches;
}

function replayShed(
  outgoingPasses: ReplayOutgoing[],
  passes: ReplayPass[],
  compare: (
    left: ReplayPass | ReplayOutgoing,
    right: ReplayPass | ReplayOutgoing
  ) => number
): {
  replayed: Map<string, INikasiShedDeduction[]>;
  skipped: string[];
  mismatches: string[];
} {
  const orderedOutgoing = [...outgoingPasses].sort(compare);
  const orderedPasses = [...passes].sort(compare);
  const working = openingShed(orderedOutgoing);
  const replayed = new Map<string, INikasiShedDeduction[]>();
  const skipped: string[] = [];

  for (const pass of orderedPasses) {
    const lines: RequestedBagLine[] = (pass.bagSize ?? []).map((line) => ({
      size: line.size,
      variety: line.variety,
      quantityIssued: line.quantityIssued,
    }));

    try {
      const deductions = computeFifoShedDeductions(working, lines);
      applyShedDeductions(working, deductions);
      replayed.set(pass._id.toString(), storedShedFromReplay(deductions));
    } catch (error) {
      if (
        error instanceof ValidationError &&
        (error.code === 'INSUFFICIENT_SHED_STOCK' ||
          error.code === 'REPLAY_SHED_QUANTITY')
      ) {
        skipped.push(
          `Nikasi ${pass._id.toString()} gate pass ${pass.gatePassNo}: ${error.message}`
        );
        continue;
      }
      throw error;
    }
  }

  return {
    replayed,
    skipped,
    mismatches: remainderMismatches(orderedOutgoing, working),
  };
}

export async function backfillNikasiAllocations(): Promise<{
  updated: number;
  mismatches: string[];
  skipped: string[];
}> {
  const mismatches: string[] = [];
  const skipped: string[] = [];
  const pending: ReplayUpdate[] = [];

  const ledgers = await DispatchLedger.find()
    .select('_id coldStorageId')
    .lean();
  const ledgerColdStorage = new Map(
    ledgers.map((ledger) => [
      ledger._id.toString(),
      ledger.coldStorageId.toString(),
    ])
  );

  const nikasiPasses = await NikasiGatePass.find({
    status: { $ne: NikasiGatePassStatus.NULL },
  })
    .sort({ date: 1, createdAt: 1, gatePassNo: 1 })
    .lean();

  const passesByColdStorage = new Map<string, typeof nikasiPasses>();
  for (const pass of nikasiPasses) {
    const coldStorageId = ledgerColdStorage.get(
      pass.dispatchLedgerId.toString()
    );
    if (!coldStorageId) {
      mismatches.push(
        `Nikasi ${pass._id.toString()} gate pass ${pass.gatePassNo} has no dispatch ledger`
      );
      continue;
    }
    const group = passesByColdStorage.get(coldStorageId) ?? [];
    group.push(pass);
    passesByColdStorage.set(coldStorageId, group);
  }

  for (const [coldStorageId, passes] of passesByColdStorage) {
    try {
      const linkIds = await FarmerStorageLink.find({
        coldStorageId: new Types.ObjectId(coldStorageId),
      }).distinct('_id');

      const outgoingPasses =
        linkIds.length === 0
          ? []
          : await OutgoingGatePass.find({
              farmerStorageLinkId: { $in: linkIds },
              category: OUTGOING_TO_SHED_CATEGORY,
              status: OutgoingGatePassStatus.ACTIVE,
            })
              .select(
                'variety date createdAt gatePassNo orderDetails storageGatePassSnapshots'
              )
              .lean();

      const byDate = replayShed(outgoingPasses, passes, compareByDate);
      const chosen =
        byDate.mismatches.length === 0
          ? byDate
          : replayShed(outgoingPasses, passes, compareByCreatedAt);

      if (chosen.mismatches.length > 0) {
        mismatches.push(
          `Cold storage ${coldStorageId} shed replay did not match live quantities`,
          ...byDate.mismatches,
          ...chosen.mismatches
        );
        continue;
      }

      skipped.push(...chosen.skipped);
      const replayedShed = chosen.replayed;
      const orderedPasses = [...passes].sort(
        byDate.mismatches.length === 0 ? compareByDate : compareByCreatedAt
      );

      const passesByLedger = new Map<string, typeof orderedPasses>();
      for (const pass of orderedPasses) {
        const ledgerId = pass.dispatchLedgerId.toString();
        const group = passesByLedger.get(ledgerId) ?? [];
        group.push(pass);
        passesByLedger.set(ledgerId, group);
      }

      const replayedBooking = new Map<string, INikasiBookingDeduction[]>();
      for (const [ledgerId, ledgerPasses] of passesByLedger) {
        const bookings = await Booking.find({
          dispatchLedgerId: new Types.ObjectId(ledgerId),
        })
          .sort({ date: 1, gatePassNo: 1 })
          .select('bagSizes')
          .lean();

        const workingBookings: BookingLean[] = bookings.map((booking) => ({
          _id: booking._id,
          bagSizes: (booking.bagSizes ?? []).map((line) => ({
            size: line.size,
            variety: line.variety,
            currentQuantity: line.initialQuantity,
          })),
        }));

        for (const pass of ledgerPasses) {
          if (!replayedShed.has(pass._id.toString())) {
            continue;
          }
          if (!pass.isBooked) {
            replayedBooking.set(pass._id.toString(), []);
            continue;
          }

          const lines: RequestedBagLine[] = (pass.bagSize ?? []).map(
            (line) => ({
              size: line.size,
              variety: line.variety,
              quantityIssued: line.quantityIssued,
            })
          );
          const deductions = computeFifoBookingDeductions(
            workingBookings,
            lines
          );
          applyBookingDeductions(workingBookings, deductions);
          replayedBooking.set(
            pass._id.toString(),
            storedBookingFromReplay(deductions)
          );
        }

        for (const booking of bookings) {
          const working = workingBookings.find((entry) =>
            entry._id.equals(booking._id)
          );
          for (const line of booking.bagSizes ?? []) {
            const replayed = working?.bagSizes.find(
              (entry) =>
                entry.size === line.size && entry.variety === line.variety
            );
            if (
              !replayed ||
              replayed.currentQuantity !== line.currentQuantity
            ) {
              mismatches.push(
                `Booking remainder mismatch on ${booking._id.toString()} ${line.size}/${line.variety}: replayed ${replayed?.currentQuantity ?? 'missing'}, live ${line.currentQuantity}`
              );
            }
          }
        }
      }

      for (const pass of orderedPasses) {
        if (!replayedShed.has(pass._id.toString())) {
          continue;
        }
        const shed = replayedShed.get(pass._id.toString()) ?? [];
        const booking = replayedBooking.get(pass._id.toString()) ?? [];
        const set: ReplayUpdate['set'] = {};

        const issuedBags = (pass.bagSize ?? []).some(
          (line) => line.quantityIssued > 0
        );
        const existingShed = (pass.shedDeductions ?? []).map((deduction) => ({
          outgoingGatePassId: deduction.outgoingGatePassId,
          size: deduction.size,
          bagType: deduction.bagType,
          chamber: deduction.chamber,
          floor: deduction.floor,
          row: deduction.row,
          quantity: deduction.quantity,
        }));

        if (issuedBags && shed.length === 0) {
          mismatches.push(
            `Nikasi ${pass._id.toString()} gate pass ${pass.gatePassNo} replayed no shed deductions`
          );
        } else if (existingShed.length === 0) {
          set.shedDeductions = shed;
        } else if (
          deductionSignature(existingShed) !== deductionSignature(shed)
        ) {
          mismatches.push(
            `Nikasi ${pass._id.toString()} gate pass ${pass.gatePassNo} stored shed deductions do not match replay`
          );
        }

        const existingBooking = (pass.bookingDeductions ?? []).map(
          (deduction) => ({
            bookingId: deduction.bookingId,
            size: deduction.size,
            variety: deduction.variety,
            quantity: deduction.quantity,
          })
        );

        if (!pass.bookingDeductions) {
          set.bookingDeductions = booking;
        } else if (
          deductionSignature(existingBooking) !== deductionSignature(booking)
        ) {
          mismatches.push(
            `Nikasi ${pass._id.toString()} gate pass ${pass.gatePassNo} stored booking deductions do not match replay`
          );
        }

        if (pass.status !== NikasiGatePassStatus.ACTIVE) {
          set.status = NikasiGatePassStatus.ACTIVE;
        }

        if (Object.keys(set).length > 0) {
          pending.push({ id: pass._id, set });
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown replay error';
      mismatches.push(`Cold storage ${coldStorageId}: ${message}`);
    }
  }

  if (mismatches.length > 0) {
    return { updated: 0, mismatches, skipped };
  }

  if (pending.length === 0) {
    return { updated: 0, mismatches: [], skipped };
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const update of pending) {
      await NikasiGatePass.updateOne(
        { _id: update.id, status: { $ne: NikasiGatePassStatus.NULL } },
        { $set: update.set },
        { session }
      );
    }
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }

  return { updated: pending.length, mismatches: [], skipped };
}

const isDirectRun = process.argv[1]?.includes('backfill-nikasi-allocations');

if (isDirectRun) {
  connectDB()
    .then(() => backfillNikasiAllocations())
    .then(async (result) => {
      if (result.mismatches.length > 0) {
        console.error('Nikasi allocation backfill wrote nothing:');
        for (const mismatch of result.mismatches) {
          console.error(`- ${mismatch}`);
        }
        await mongoose.disconnect();
        process.exit(1);
      }

      if (result.skipped.length > 0) {
        console.warn(
          'Skipped nikasi gate passes with no remaining shed stock:'
        );
        for (const message of result.skipped) {
          console.warn(`- ${message}`);
        }
      }

      console.log(
        'Nikasi allocation backfill updated %d gate pass(es)',
        result.updated
      );
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error('Fatal:', error);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
}
