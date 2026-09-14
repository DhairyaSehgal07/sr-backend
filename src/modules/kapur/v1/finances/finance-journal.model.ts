import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export type FinanceJournalVoucherType = 'sale' | 'recovery';
export type FinanceJournalAccount = 'dispatch_ledger' | 'sales' | 'cash';
export type FinanceJournalSourceCollection =
  'finance_sales' | 'finance_recoveries';

export interface IFinanceJournalLine {
  account: FinanceJournalAccount;
  dispatchLedgerId?: Types.ObjectId;
  debitPaise: number;
  creditPaise: number;
}

export interface IFinanceJournal extends Document {
  coldStorageId: Types.ObjectId;
  date: Date;
  voucherType: FinanceJournalVoucherType;
  source: {
    collection: FinanceJournalSourceCollection;
    id: Types.ObjectId;
  };
  narration: string;
  lines: IFinanceJournalLine[];
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const FinanceJournalLineSchema = new Schema<IFinanceJournalLine>(
  {
    account: {
      type: String,
      enum: ['dispatch_ledger', 'sales', 'cash'],
      required: true,
    },
    dispatchLedgerId: {
      type: Schema.Types.ObjectId,
      ref: 'DispatchLedger',
    },
    debitPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    creditPaise: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const FinanceJournalSchema = new Schema<IFinanceJournal>(
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
    voucherType: {
      type: String,
      enum: ['sale', 'recovery'],
      required: true,
    },
    source: {
      collection: {
        type: String,
        enum: ['finance_sales', 'finance_recoveries'],
        required: true,
      },
      id: {
        type: Schema.Types.ObjectId,
        required: true,
      },
    },
    narration: {
      type: String,
      required: true,
      trim: true,
    },
    lines: {
      type: [FinanceJournalLineSchema],
      required: true,
      validate: {
        validator: (lines: IFinanceJournalLine[]) => lines.length >= 2,
        message: 'At least two journal lines are required',
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'finance_journals',
  }
);

FinanceJournalSchema.index(
  { coldStorageId: 1, 'source.collection': 1, 'source.id': 1 },
  { unique: true }
);

export const FinanceJournal: Model<IFinanceJournal> =
  mongoose.models.FinanceJournal ||
  mongoose.model<IFinanceJournal>('FinanceJournal', FinanceJournalSchema);
