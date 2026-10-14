import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

interface ISandhuBagSize {
  size: string;
  variety: string;
  quantityIssued: number;
  costPerBag: number;
}

export interface ISandhuDispatch extends Document {
  dispatchLedgerId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  gatePassNo: number;
  manualGatePassNumber?: number;

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

  bagSize: ISandhuBagSize[];

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

const SandhuBagSizeSchema = new Schema<ISandhuBagSize>(
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

const SandhuDispatchSchema = new Schema<ISandhuDispatch>(
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
      type: [SandhuBagSizeSchema],
      required: true,
      validate: {
        validator: (details: ISandhuBagSize[]) => details.length > 0,
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
    collection: 'sandhu-dispatch',
  }
);

/* =======================
   INDEXES
======================= */

SandhuDispatchSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
);

// Dispatch ledger lookup by date
SandhuDispatchSchema.index({ dispatchLedgerId: 1, date: -1 });

// Voucher number unique per dispatch ledger
SandhuDispatchSchema.index(
  { dispatchLedgerId: 1, gatePassNo: 1 },
  { unique: true }
);

// Gate passes by date for reporting
SandhuDispatchSchema.index({ date: -1 });

/* =======================
   MODEL
======================= */

export const SandhuDispatch: Model<ISandhuDispatch> =
  mongoose.models.SandhuDispatch ||
  mongoose.model<ISandhuDispatch>(
    'SandhuDispatch',
    SandhuDispatchSchema,
    'sandhu-dispatch'
  );
