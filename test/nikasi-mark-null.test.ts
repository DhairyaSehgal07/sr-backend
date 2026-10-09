import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../src/modules/kapur/v1/booking/booking.model.js';
import { BillBook } from '../src/modules/kapur/v1/bill-book/bill-book.model.js';
import { DispatchLedger } from '../src/modules/kapur/v1/dispatch-ledger/dispatch-ledger.model.js';
import { FarmerStorageLink } from '../src/modules/kapur/v1/farmer-storage-link/farmer-storage-link.model.js';
import { FinanceJournal } from '../src/modules/kapur/v1/finances/finance-journal.model.js';
import { FinanceSale } from '../src/modules/kapur/v1/finances/finance-sale.model.js';
import {
  getFinanceSales,
  getFinanceSummary,
} from '../src/modules/kapur/v1/finances/finances.service.js';
import { getOverview } from '../src/modules/kapur/v1/analytics/analytics.service.js';
import {
  NikasiGatePass,
  NikasiGatePassStatus,
} from '../src/modules/kapur/v1/nikasi-gate-pass/nikasi-gate-pass.model.js';
import {
  createNikasiGatePass,
  getNikasiGatePassReport,
  getPaginatedNikasiGatePassesByColdStorage,
  markNikasiGatePassNull,
  searchNikasiGatePassesByNumber,
} from '../src/modules/kapur/v1/nikasi-gate-pass/nikasi-gate-pass.service.js';
import {
  OutgoingGatePass,
  OutgoingGatePassStatus,
} from '../src/modules/kapur/v1/outgoing-gate-pass/outgoing-gate-pass.model.js';
import { BagType } from '../src/modules/kapur/v1/storage-gate-pass/storage-gate-pass.model.js';
import { backfillNikasiAllocations } from '../src/scripts/backfill-nikasi-allocations.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../src/utils/errors.js';

interface SeedLine {
  size: string;
  quantityIssued: number;
  chamber: string;
  floor?: string;
  row?: string;
}

interface SeededWorld {
  coldStorageId: string;
  dispatchLedgerId: string;
  billBookId: string;
  outgoingId: string;
  bookingId?: string;
}

const VARIETY = 'Jyoti';

async function seedWorld(options?: {
  lines?: SeedLine[];
  bookingQuantity?: number;
}): Promise<SeededWorld> {
  const lines = options?.lines ?? [
    {
      size: 'Big',
      quantityIssued: 100,
      chamber: 'C1',
      floor: 'F1',
      row: 'R1',
    },
  ];
  const coldStorageId = new Types.ObjectId();
  const dispatch = await DispatchLedger.create({
    coldStorageId,
    name: 'Dispatch Party',
    address: 'Store road',
  });
  const billBook = await BillBook.create({
    coldStorageId,
    name: 'Bill Book 1',
    isActive: true,
  });
  const link = await FarmerStorageLink.create({
    farmerId: new Types.ObjectId(),
    coldStorageId,
    accountNumber: 1,
  });

  const orderDetails = lines.map((line) => ({
    size: line.size,
    bagType: BagType.JUTE,
    quantityIssued: line.quantityIssued,
    quantityAvailable: 0,
    weightInKg: 50,
    chamber: line.chamber,
    floor: line.floor ?? 'F1',
    row: line.row ?? 'R1',
  }));

  const outgoing = await OutgoingGatePass.create({
    farmerStorageLinkId: link._id,
    gatePassNo: 1,
    date: new Date('2026-01-01T00:00:00.000Z'),
    variety: VARIETY,
    truckNumber: 'PB01AB0001',
    category: 'Outgoing to Shed',
    'pre-sowing-treatment': false,
    status: OutgoingGatePassStatus.ACTIVE,
    orderDetails,
    storageGatePassSnapshots: [
      {
        _id: new Types.ObjectId(),
        gatePassNo: 10,
        variety: VARIETY,
        storageCategory: 'Cold',
        bagSizes: orderDetails.map((detail) => ({
          size: detail.size,
          bagType: detail.bagType,
          chamber: detail.chamber,
          floor: detail.floor,
          row: detail.row,
          initialQuantity: detail.quantityIssued,
          currentQuantity: 0,
          quantityIssued: detail.quantityIssued,
        })),
      },
    ],
  });

  let bookingId: string | undefined;
  if (options?.bookingQuantity !== undefined) {
    const booking = await Booking.create({
      dispatchLedgerId: dispatch._id,
      gatePassNo: 1,
      date: new Date('2026-01-02T00:00:00.000Z'),
      bagSizes: [
        {
          size: 'Big',
          variety: VARIETY,
          currentQuantity: options.bookingQuantity,
          initialQuantity: options.bookingQuantity,
        },
      ],
    });
    bookingId = booking._id.toString();
  }

  return {
    coldStorageId: coldStorageId.toString(),
    dispatchLedgerId: dispatch._id.toString(),
    billBookId: billBook._id.toString(),
    outgoingId: outgoing._id.toString(),
    ...(bookingId ? { bookingId } : {}),
  };
}

function createInput(
  world: SeededWorld,
  gatePassNo: number,
  quantityIssued: number,
  isBooked = false
) {
  return {
    dispatchLedgerId: world.dispatchLedgerId,
    gatePassNo,
    billBookId: world.billBookId,
    category: 'Dispatch',
    date: new Date('2026-03-01T00:00:00.000Z'),
    isBooked,
    bagSize: [
      {
        size: 'Big',
        variety: VARIETY,
        quantityIssued,
        costPerBag: 10,
      },
    ],
  };
}

async function outgoingQuantities(outgoingId: string): Promise<number[]> {
  const outgoing = await OutgoingGatePass.findById(outgoingId).lean();
  assert.ok(outgoing);
  return outgoing.orderDetails.map((detail) => detail.quantityIssued);
}

async function bookingQuantity(bookingId: string): Promise<number> {
  const booking = await Booking.findById(bookingId).lean();
  assert.ok(booking);
  const line = booking.bagSizes[0];
  assert.ok(line);
  return line.currentQuantity;
}

describe('nikasi mark as null', { timeout: 180000, concurrency: 1 }, () => {
  let replSet: MongoMemoryReplSet;

  before(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000'],
      },
    });
    await mongoose.connect(replSet.getUri());
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.createIndexes())
    );
  });

  after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    await Promise.all(
      Object.values(collections).map((collection) => collection.deleteMany({}))
    );
  });

  it('stores shed lines on an unbooked create and restores them on null', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );

    assert.equal(created.status, NikasiGatePassStatus.ACTIVE);
    assert.equal(created.bookingDeductions.length, 0);
    assert.equal(created.shedDeductions.length, 1);
    assert.equal(created.shedDeductions[0]?.quantity, 40);
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [60]);

    const beforeSummary = await getFinanceSummary(world.coldStorageId, {});
    assert.equal(beforeSummary.billedPaise, 40000);
    assert.equal(beforeSummary.saleCount, 1);
    const beforeOverview = await getOverview(world.coldStorageId, {});
    assert.equal(beforeOverview.totalBagsDispatched, 40);

    const nulled = await markNikasiGatePassNull(
      world.coldStorageId,
      created._id.toString()
    );

    assert.equal(nulled.status, NikasiGatePassStatus.NULL);
    assert.ok(nulled.nulledAt);
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [100]);

    const sale = await FinanceSale.findOne({ dispatchId: created._id }).lean();
    assert.ok(sale);
    assert.equal(sale.status, 'null');
    assert.equal(sale.outstandingPaise, 0);
    assert.equal(sale.amountPaise, 40000);

    const journal = await FinanceJournal.findOne({
      'source.id': sale._id,
    }).lean();
    assert.ok(journal?.voidedAt);

    const afterSummary = await getFinanceSummary(world.coldStorageId, {});
    assert.equal(afterSummary.billedPaise, 0);
    assert.equal(afterSummary.saleCount, 0);
    assert.equal(afterSummary.outstandingPaise, 0);

    const sales = await getFinanceSales(world.coldStorageId, {});
    assert.equal(sales.length, 0);

    const list = await getPaginatedNikasiGatePassesByColdStorage(
      world.coldStorageId,
      {}
    );
    assert.equal(list.pagination.total, 0);
    assert.equal(list.nikasiGatePasses.length, 0);

    const search = await searchNikasiGatePassesByNumber(world.coldStorageId, 1);
    assert.equal(search.nikasiGatePasses.length, 0);

    const report = await getNikasiGatePassReport(world.coldStorageId, {});
    assert.equal(report.nikasiGatePasses.length, 0);

    const afterOverview = await getOverview(world.coldStorageId, {});
    assert.equal(afterOverview.totalBagsDispatched, 0);
  });

  it('restores booking quantity when the pass was booked', async () => {
    const world = await seedWorld({ bookingQuantity: 80 });
    assert.ok(world.bookingId);
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 25, true)
    );

    assert.equal(created.bookingDeductions.length, 1);
    assert.equal(created.bookingDeductions[0]?.quantity, 25);
    assert.equal(await bookingQuantity(world.bookingId), 55);
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [75]);

    await markNikasiGatePassNull(world.coldStorageId, created._id.toString());

    assert.equal(await bookingQuantity(world.bookingId), 80);
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [100]);
  });

  it('does not change a booking when the pass is not booked', async () => {
    const world = await seedWorld({ bookingQuantity: 80 });
    assert.ok(world.bookingId);
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 10, false)
    );

    assert.equal(created.bookingDeductions.length, 0);
    assert.equal(await bookingQuantity(world.bookingId), 80);

    await markNikasiGatePassNull(world.coldStorageId, created._id.toString());

    assert.equal(await bookingQuantity(world.bookingId), 80);
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [100]);
  });

  it('restores only the nulled pass when two passes share shed stock', async () => {
    const world = await seedWorld();
    const older = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );
    const newer = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 2, 30)
    );

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [30]);

    await markNikasiGatePassNull(world.coldStorageId, older._id.toString());

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [70]);
    const newerSale = await FinanceSale.findOne({
      dispatchId: newer._id,
    }).lean();
    assert.equal(newerSale?.status, 'open');
    const olderSale = await FinanceSale.findOne({
      dispatchId: older._id,
    }).lean();
    assert.equal(olderSale?.status, 'null');

    const list = await getPaginatedNikasiGatePassesByColdStorage(
      world.coldStorageId,
      {}
    );
    assert.equal(list.pagination.total, 1);
    assert.equal(list.nikasiGatePasses[0]?.gatePassNo, 2);
    const sales = await getFinanceSales(world.coldStorageId, {});
    assert.equal(sales.length, 1);
    assert.equal(sales[0]?.gatePassNo, 2);

    await markNikasiGatePassNull(world.coldStorageId, newer._id.toString());
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [100]);
  });

  it('restores each shed line when one pass spans two locations', async () => {
    const world = await seedWorld({
      lines: [
        { size: 'Big', quantityIssued: 30, chamber: 'C1' },
        { size: 'Big', quantityIssued: 40, chamber: 'C2' },
      ],
    });
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 50)
    );

    assert.equal(created.shedDeductions.length, 2);
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [0, 20]);

    await markNikasiGatePassNull(world.coldStorageId, created._id.toString());
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [30, 40]);
  });

  it('rejects a second null without restoring stock twice', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );
    await markNikasiGatePassNull(world.coldStorageId, created._id.toString());

    await assert.rejects(
      () => markNikasiGatePassNull(world.coldStorageId, created._id.toString()),
      (error: unknown) => {
        assert.ok(error instanceof ConflictError);
        assert.equal(error.code, 'NIKASI_GATE_PASS_ALREADY_NULL');
        return true;
      }
    );

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [100]);
  });

  it('rejects when the finance sale has recoveries and leaves stock unchanged', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );
    await FinanceSale.updateOne(
      { dispatchId: created._id },
      {
        $set: {
          recoveredPaise: 500,
          outstandingPaise: 39500,
          status: 'partial',
        },
      }
    );

    await assert.rejects(
      () => markNikasiGatePassNull(world.coldStorageId, created._id.toString()),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'FINANCE_SALE_HAS_RECOVERY');
        return true;
      }
    );

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [60]);
    const sale = await FinanceSale.findOne({ dispatchId: created._id }).lean();
    assert.equal(sale?.status, 'partial');
    assert.equal(sale?.recoveredPaise, 500);
    const pass = await NikasiGatePass.findById(created._id).lean();
    assert.equal(pass?.status, NikasiGatePassStatus.ACTIVE);
  });

  it('rejects a pass from another cold storage', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 15)
    );

    await assert.rejects(
      () =>
        markNikasiGatePassNull(
          new Types.ObjectId().toString(),
          created._id.toString()
        ),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundError);
        assert.equal(error.code, 'NIKASI_GATE_PASS_NOT_FOUND');
        return true;
      }
    );

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [85]);
  });

  it('rejects an invalid nikasi id', async () => {
    const world = await seedWorld();
    await assert.rejects(
      () => markNikasiGatePassNull(world.coldStorageId, 'not-an-id'),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'INVALID_NIKASI_GATE_PASS_ID');
        return true;
      }
    );
  });

  it('rejects when the outgoing pass is no longer active', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );
    await OutgoingGatePass.updateOne(
      { _id: world.outgoingId },
      { $set: { status: OutgoingGatePassStatus.CANCELLED } }
    );

    await assert.rejects(
      () => markNikasiGatePassNull(world.coldStorageId, created._id.toString()),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'OUTGOING_GATE_PASS_NOT_ACTIVE');
        return true;
      }
    );

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [60]);
    const sale = await FinanceSale.findOne({ dispatchId: created._id }).lean();
    assert.equal(sale?.status, 'open');
    const pass = await NikasiGatePass.findById(created._id).lean();
    assert.equal(pass?.status, NikasiGatePassStatus.ACTIVE);
  });

  it('rejects when stored shed deductions are missing', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );
    await NikasiGatePass.updateOne(
      { _id: created._id },
      { $set: { shedDeductions: [] } }
    );

    await assert.rejects(
      () => markNikasiGatePassNull(world.coldStorageId, created._id.toString()),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'MISSING_SHED_DEDUCTIONS');
        return true;
      }
    );

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [60]);
    const sale = await FinanceSale.findOne({ dispatchId: created._id }).lean();
    assert.equal(sale?.status, 'open');
  });

  it('rejects when the finance sale is missing', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );
    await FinanceSale.deleteOne({ dispatchId: created._id });

    await assert.rejects(
      () => markNikasiGatePassNull(world.coldStorageId, created._id.toString()),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundError);
        assert.equal(error.code, 'FINANCE_SALE_NOT_FOUND');
        return true;
      }
    );

    assert.deepEqual(await outgoingQuantities(world.outgoingId), [60]);
    const pass = await NikasiGatePass.findById(created._id).lean();
    assert.equal(pass?.status, NikasiGatePassStatus.ACTIVE);
  });

  it('rejects when the shed line no longer matches', async () => {
    const world = await seedWorld();
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 40)
    );
    await OutgoingGatePass.updateOne(
      { _id: world.outgoingId },
      { $set: { 'orderDetails.0.chamber': 'MOVED' } }
    );

    await assert.rejects(
      () => markNikasiGatePassNull(world.coldStorageId, created._id.toString()),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'SHED_LINE_NOT_FOUND');
        return true;
      }
    );

    const outgoing = await OutgoingGatePass.findById(world.outgoingId).lean();
    assert.equal(outgoing?.orderDetails[0]?.quantityIssued, 60);
    assert.equal(outgoing?.orderDetails[0]?.chamber, 'MOVED');
  });

  it('backfills allocations onto a pass that lost them, then null restores stock', async () => {
    const world = await seedWorld({ bookingQuantity: 50 });
    assert.ok(world.bookingId);
    const created = await createNikasiGatePass(
      world.coldStorageId,
      createInput(world, 1, 20, true)
    );
    await NikasiGatePass.updateOne(
      { _id: created._id },
      { $unset: { shedDeductions: 1, bookingDeductions: 1, status: 1 } }
    );

    const result = await backfillNikasiAllocations();
    assert.deepEqual(result.mismatches, []);
    assert.equal(result.updated, 1);

    const restored = await NikasiGatePass.findById(created._id).lean();
    assert.equal(restored?.status, NikasiGatePassStatus.ACTIVE);
    assert.equal(restored?.shedDeductions.length, 1);
    assert.equal(restored?.shedDeductions[0]?.quantity, 20);
    assert.equal(restored?.bookingDeductions.length, 1);
    assert.equal(restored?.bookingDeductions[0]?.quantity, 20);

    await markNikasiGatePassNull(world.coldStorageId, created._id.toString());
    assert.deepEqual(await outgoingQuantities(world.outgoingId), [100]);
    assert.equal(await bookingQuantity(world.bookingId), 50);
  });
});
