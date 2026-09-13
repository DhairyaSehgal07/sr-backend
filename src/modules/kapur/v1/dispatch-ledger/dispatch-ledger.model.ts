import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDispatchLedger extends Document {
  coldStorageId: Types.ObjectId;

  name: string;
  address: string;
  mobileNumber?: string;

  createdAt: Date;
  updatedAt: Date;
}

const DispatchLedgerSchema = new Schema<IDispatchLedger>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: false,
      sparse: true, // allows multiple nulls but enforces uniqueness when present
    },
  },
  {
    timestamps: true,
  }
);

/* -------------------- INDEXES -------------------- */

// Optional: prevent duplicate entries for same person in same storage
DispatchLedgerSchema.index(
  { coldStorageId: 1, name: 1, address: 1 },
  { unique: true }
);

export const DispatchLedger =
  mongoose.models.DispatchLedger ||
  mongoose.model<IDispatchLedger>('DispatchLedger', DispatchLedgerSchema);
