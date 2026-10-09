import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

export enum NikasiGatePassStatus {
  ACTIVE = 'ACTIVE',
  NULL = 'NULL',
}

interface INikasiBagSize {
  size: string;
  variety: string;
  quantityIssued: number;
  costPerBag: number;
}

/** Exact outgoing-to-shed line reduced when this pass was created */
export interface INikasiShedDeduction {
  outgoingGatePassId: Types.ObjectId;
  size: string;
  bagType: string;
  chamber: string;
  floor: string;
  row: string;
  quantity: number;
}

/** Exact booking line reduced when this pass was created with isBooked */
export interface INikasiBookingDeduction {
  bookingId: Types.ObjectId;
  size: string;
  variety: string;
  quantity: number;
}

export interface INikasiGatePass extends Document {
  dispatchLedgerId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  gatePassNo: number;
  manualGatePassNumber?: number;
  isBooked?: boolean;
  status: NikasiGatePassStatus;
  nulledAt?: Date;
  nulledBy?: Types.ObjectId;
  shedDeductions: INikasiShedDeduction[];
  bookingDeductions: INikasiBookingDeduction[];

  billNumber?: number;
  bitliNumber?: number;
  billBookId: Types.ObjectId;
  billBook?: string;
  biltiBook?: string;
  category: string;

  date: Date;

  from?: string;
  to?: string;

  truckNumber?: string;
  transportCompany?: string;
  LSNumber?: string;
  driverName?: string;
  driverMobile?: string;
  owner?: string;

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

const NikasiShedDeductionSchema = new Schema<INikasiShedDeduction>(
  {
    outgoingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'OutgoingGatePass',
      required: true,
    },
    size: { type: String, required: true, trim: true },
    bagType: { type: String, required: true, trim: true },
    chamber: { type: String, required: true, trim: true },
    floor: { type: String, required: true, trim: true },
    row: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const NikasiBookingDeductionSchema = new Schema<INikasiBookingDeduction>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    size: { type: String, required: true, trim: true },
    variety: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

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

    costPerBag: {
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

    status: {
      type: String,
      enum: Object.values(NikasiGatePassStatus),
      default: NikasiGatePassStatus.ACTIVE,
      required: true,
    },

    nulledAt: {
      type: Date,
    },

    nulledBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },

    shedDeductions: {
      type: [NikasiShedDeductionSchema],
      default: [],
    },

    bookingDeductions: {
      type: [NikasiBookingDeductionSchema],
      default: [],
    },

    billNumber: {
      type: Number,
    },

    bitliNumber: {
      type: Number,
    },

    billBookId: {
      type: Schema.Types.ObjectId,
      ref: 'BillBook',
      required: true,
      index: true,
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

    transportCompany: {
      type: String,
      trim: true,
    },

    LSNumber: {
      type: String,
      trim: true,
    },

    driverName: {
      type: String,
      trim: true,
    },

    driverMobile: {
      type: String,
      trim: true,
    },

    owner: {
      type: String,
      trim: true,
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
