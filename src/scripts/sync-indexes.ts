/**
 * Sync MongoDB indexes to match Mongoose schema definitions.
 * Run with: npm run sync-indexes
 * Requires MONGO_URI in env (e.g. from .env).
 *
 * - Creates any indexes defined in schemas that are missing in the DB.
 * - Drops indexes that exist in the DB but are no longer in the schema.
 */
import { config } from 'dotenv';
config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';

// Import all models so they are registered with mongoose
import { ColdStorage } from '../modules/kapur/v1/cold-storage/cold-storage.model.js';
import { Farmer } from '../modules/kapur/v1/farmer/farmer.model.js';
import { FarmerStorageLink } from '../modules/kapur/v1/farmer-storage-link/farmer-storage-link.model.js';
import { GradingGatePass } from '../modules/kapur/v1/grading-gate-pass/grading-gate-pass.model.js';
import { GradingGatePassAudit } from '../modules/kapur/v1/grading-gate-pass/grading-gate-pass-audit.model.js';
import { IncomingGatePass } from '../modules/kapur/v1/incoming-gate-pass/incoming-gate-pass.model.js';
import { IncomingGatePassAudit } from '../modules/kapur/v1/incoming-gate-pass/incoming-gate-pass-audit.model.js';
import { NikasiGatePass } from '../modules/kapur/v1/nikasi-gate-pass/nikasi-gate-pass.model.js';
import { Preferences } from '../modules/kapur/v1/preferences/preferences.model.js';
import { RolePermission } from '../modules/kapur/v1/role-permission/role-permission.model.js';
import { StorageGatePass } from '../modules/kapur/v1/storage-gate-pass/storage-gate-pass.model.js';
import { EditHistory } from '../modules/kapur/v1/storage-gate-pass/edit-history.model.js';
import { StoreAdmin } from '../modules/kapur/v1/store-admin/store-admin.model.js';
import { Temperature } from '../modules/kapur/v1/temperature/temperature.model.js';
import { DispatchLedger } from '../modules/kapur/v1/dispatch-ledger/dispatch-ledger.model.js';
import { Booking } from '../modules/kapur/v1/booking/booking.model.js';
import { BookingAudit } from '../modules/kapur/v1/booking/booking-audit.model.js';
import { OutgoingGatePass } from '../modules/kapur/v1/outgoing-gate-pass/outgoing-gate-pass.model.js';
import { OutgoingGatePassAudit } from '../modules/kapur/v1/outgoing-gate-pass/outgoing-gate-pass-audit.model.js';
import { TransferStockGatePass } from '../modules/kapur/v1/transfer-stock/transfer-stock.model.js';

const MODELS = [
  ColdStorage,
  Farmer,
  FarmerStorageLink,
  GradingGatePass,
  GradingGatePassAudit,
  IncomingGatePass,
  IncomingGatePassAudit,
  NikasiGatePass,
  Preferences,
  RolePermission,
  StorageGatePass,
  EditHistory,
  StoreAdmin,
  Temperature,
  DispatchLedger,
  Booking,
  BookingAudit,
  OutgoingGatePass,
  OutgoingGatePassAudit,
  TransferStockGatePass,
] as const;

async function syncIndexes(): Promise<void> {
  await connectDB();

  console.log('Syncing indexes for %d model(s)...\n', MODELS.length);

  for (const model of MODELS) {
    const name = model.modelName;
    try {
      const result = await model.syncIndexes();
      const dropped =
        typeof result === 'object' && result !== null && 'dropped' in result
          ? (result as { dropped?: string[] }).dropped
          : Array.isArray(result)
            ? result
            : [];
      if (dropped && dropped.length > 0) {
        console.log('[%s] Dropped index(es): %s', name, dropped.join(', '));
      }
      console.log('[%s] Indexes synced.', name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[%s] Error syncing indexes: %s', name, msg);
      throw err;
    }
  }

  console.log('\nDone.');
  await mongoose.disconnect();
  process.exit(0);
}

syncIndexes().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
