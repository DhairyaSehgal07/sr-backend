/**
 * Backfill missing orderDetails.weightInKg on outgoing gate passes to 50 kg.
 * Run with: npm run backfill:outgoing-weight
 * Requires MONGO_URI in env (e.g. from .env).
 */
import { config } from 'dotenv';
config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import { OutgoingGatePass } from '../modules/kapur/v1/outgoing-gate-pass/outgoing-gate-pass.model.js';

const DEFAULT_WEIGHT_KG = 50;

async function backfillOutgoingOrderDetailWeight(): Promise<void> {
  await connectDB();

  const result = await OutgoingGatePass.updateMany(
    { 'orderDetails.weightInKg': { $exists: false } },
    { $set: { 'orderDetails.$[elem].weightInKg': DEFAULT_WEIGHT_KG } },
    { arrayFilters: [{ 'elem.weightInKg': { $exists: false } }] }
  );

  console.log(
    'Outgoing orderDetails weightInKg backfill: matched=%d modified=%d',
    result.matchedCount,
    result.modifiedCount
  );

  await mongoose.disconnect();
  process.exit(0);
}

backfillOutgoingOrderDetailWeight().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
