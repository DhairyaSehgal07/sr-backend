import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

interface INikasiBagSize {
  size: string;
  variety: string;
  quantityIssued: number;
}

export interface INikasiGatePass extends Document {
  dispatchLedgerId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  gatePassNo: number;
  manualGatePassNumber?: number;
  isBooked?: boolean;

  billNumber?: number;
  bitliNumber?: number;
  billBook?: string;
  biltiBook?: string;
  category: string;

  date: Date;

  from: string;
  to?: string;

  truckNumber?: string;

  bagSize: INikasiBagSize[];

  remarks?: string;

  netWeight?: number;
  averageWeightPerBag?: number;

  /** Idempotency key for create; sparse unique index */
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const NikasiBagSizeSchema = new Schema<INikasiBagSize>(
  {
    size: {
      type: String,
      required: true,
      trim: true,
    },

    variety: {
      type: String,
      required: true,
      trim: true,
    },

    quantityIssued: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

/* =======================
   MAIN SCHEMA
======================= */

const NikasiGatePassSchema = new Schema<INikasiGatePass>(
  {
    dispatchLedgerId: {
      type: Schema.Types.ObjectId,
      ref: 'DispatchLedger',
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
      index: true,
    },

    gatePassNo: {
      type: Number,
      required: true,
      index: true,
    },

    manualGatePassNumber: {
      type: Number,
    },

    isBooked: {
      type: Boolean,
      default: false,
    },

    billNumber: {
      type: Number,
    },

    bitliNumber: {
      type: Number,
    },

    billBook: {
      type: String,
      trim: true,
    },

    biltiBook: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    from: {
      type: String,
      required: true,
      trim: true,
    },

    to: {
      type: String,
      trim: true,
    },

    truckNumber: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    bagSize: {
      type: [NikasiBagSizeSchema],
      required: true,
      validate: {
        validator: (details: INikasiBagSize[]) => details.length > 0,
        message: 'At least one bag size is required',
      },
    },

    remarks: {
      type: String,
      trim: true,
    },

    netWeight: {
      type: Number,
    },

    averageWeightPerBag: {
      type: Number,
    },

    idempotencyKey: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =======================
   INDEXES
======================= */

NikasiGatePassSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
);

// Created by user lookup
// createdBy is indexed via field-level index: true

// Dispatch ledger lookup by date
NikasiGatePassSchema.index({ dispatchLedgerId: 1, date: -1 });

// Voucher number unique per dispatch ledger
NikasiGatePassSchema.index(
  { dispatchLedgerId: 1, gatePassNo: 1 },
  { unique: true }
);

// Gate passes by date for reporting
NikasiGatePassSchema.index({ date: -1 });

/* =======================
   MODEL
======================= */

export const NikasiGatePass: Model<INikasiGatePass> =
  mongoose.models.NikasiGatePass ||
  mongoose.model<INikasiGatePass>('NikasiGatePass', NikasiGatePassSchema);
