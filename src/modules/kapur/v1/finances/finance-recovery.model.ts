import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IFinanceRecoveryAllocation {
  saleId: Types.ObjectId;
  amountPaise: number;
}

export interface IFinanceRecovery extends Document {
  coldStorageId: Types.ObjectId;
  date: Date;
  dispatchLedgerId: Types.ObjectId;
  dispatchLedgerName: string;
  billBookId: Types.ObjectId;
  billBookName: string;
  amountPaise: number;
  remark?: string;
  allocations: IFinanceRecoveryAllocation[];
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceRecoveryAllocationSchema = new Schema<IFinanceRecoveryAllocation>(
  {
    saleId: {
      type: Schema.Types.ObjectId,
      ref: 'FinanceSale',
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const FinanceRecoverySchema = new Schema<IFinanceRecovery>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
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
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
    },
    remark: {
      type: String,
      trim: true,
    },
    allocations: {
      type: [FinanceRecoveryAllocationSchema],
      required: true,
      validate: {
        validator: (allocations: IFinanceRecoveryAllocation[]) =>
          allocations.length > 0,
        message: 'At least one allocation is required',
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },
  },
  {
    timestamps: true,
    collection: 'finance_recoveries',
  }
);

FinanceRecoverySchema.index({ coldStorageId: 1, billBookId: 1, date: -1 });
FinanceRecoverySchema.index({
  coldStorageId: 1,
  dispatchLedgerId: 1,
  billBookId: 1,
  date: -1,
});

export const FinanceRecovery: Model<IFinanceRecovery> =
  mongoose.models.FinanceRecovery ||
  mongoose.model<IFinanceRecovery>('FinanceRecovery', FinanceRecoverySchema);
