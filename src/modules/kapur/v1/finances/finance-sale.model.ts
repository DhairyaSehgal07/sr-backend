import mongoose, { Schema, Document, Types, Model } from 'mongoose';
import type { FinanceSaleStatus } from './money.js';

export type { FinanceSaleStatus };

export interface IFinanceSale extends Document {
  coldStorageId: Types.ObjectId;
  dispatchId: Types.ObjectId;
  date: Date;
  gatePassNo: number;
  billBookId: Types.ObjectId;
  billBookName: string;
  billNumber?: number;
  dispatchLedgerId: Types.ObjectId;
  dispatchLedgerName: string;
  bags: number;
  netWeight?: number;
  amountPaise: number;
  recoveredPaise: number;
  outstandingPaise: number;
  status: FinanceSaleStatus;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceSaleSchema = new Schema<IFinanceSale>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
      index: true,
    },
    dispatchId: {
      type: Schema.Types.ObjectId,
      ref: 'NikasiGatePass',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    gatePassNo: {
      type: Number,
      required: true,
    },
    billBookId: {
      type: Schema.Types.ObjectId,
      ref: 'BillBook',
      required: true,
    },
    billBookName: {
      type: String,
      required: true,
      trim: true,
    },
    billNumber: {
      type: Number,
    },
    dispatchLedgerId: {
      type: Schema.Types.ObjectId,
      ref: 'DispatchLedger',
      required: true,
    },
    dispatchLedgerName: {
      type: String,
      required: true,
      trim: true,
    },
    bags: {
      type: Number,
      required: true,
      min: 0,
    },
    netWeight: {
      type: Number,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    recoveredPaise: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    outstandingPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['open', 'partial', 'settled'],
      required: true,
      default: 'open',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },
  },
  {
    timestamps: true,
    collection: 'finance_sales',
  }
);

FinanceSaleSchema.index({ coldStorageId: 1, dispatchId: 1 }, { unique: true });
FinanceSaleSchema.index({ coldStorageId: 1, billBookId: 1, date: -1 });
FinanceSaleSchema.index({
  coldStorageId: 1,
  dispatchLedgerId: 1,
  billBookId: 1,
});

export const FinanceSale: Model<IFinanceSale> =
  mongoose.models.FinanceSale ||
  mongoose.model<IFinanceSale>('FinanceSale', FinanceSaleSchema);
