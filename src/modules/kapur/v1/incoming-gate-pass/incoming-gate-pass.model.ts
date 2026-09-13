import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   ENUMS
======================= */

export enum GatePassStatus {
  GRADED = 'GRADED',
  NOT_GRADED = 'NOT_GRADED',
}

export enum IncomingGatePassCategory {
  OWN_STOCK = 'Own Stock',
  CONTRACT_FARMING = 'Contract Farming',
  FAZALPUR = 'Fazalpur',
  PURCHASES_APR = 'Purchases-Apr',
  CONVERSION = 'Conversion',
  TRANSFER_FROM_STORES = 'Transfer From Stores',
}

/* =======================
   INTERFACES
======================= */

interface IWeightSlip {
  slipNumber?: string;
  grossWeightKg?: number;
  tareWeightKg?: number;
}

export interface IIncomingGatePass extends Document {
  farmerStorageLinkId: Types.ObjectId;
  createdBy?: Types.ObjectId;

  gatePassNo: number;
  manualGatePassNumber?: number;
  date: Date;

  variety: string;
  category: IncomingGatePassCategory;
  truckNumber: string;

  bagsReceived: number;

  weightSlip?: IWeightSlip;

  status: GatePassStatus;

  stage?: string;

  remarks?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const WeightSlipSchema = new Schema<IWeightSlip>(
  {
    slipNumber: String,
    grossWeightKg: Number,
    tareWeightKg: Number,
  },
  { _id: false }
);

/* =======================
   MAIN SCHEMA
======================= */

const IncomingGatePassSchema = new Schema<IIncomingGatePass>(
  {
    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmerStorageLink',
      required: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
      index: true,
    },

    gatePassNo: {
      type: Number,
      required: true,
    },

    manualGatePassNumber: {
      type: Number,
    },

    date: {
      type: Date,
      required: true,
    },

    variety: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: Object.values(IncomingGatePassCategory),
      required: true,
    },

    truckNumber: {
      type: String,
      required: true,
      trim: true,
    },

    bagsReceived: {
      type: Number,
      required: true,
      min: 0,
    },

    weightSlip: {
      type: WeightSlipSchema,
    },

    status: {
      type: String,
      enum: Object.values(GatePassStatus),
      default: GatePassStatus.NOT_GRADED,
    },

    stage: {
      type: String,
      trim: true,
    },

    remarks: {
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

// Daybook/list: filter by farmer storage link, sort by date and gate pass number
IncomingGatePassSchema.index({
  farmerStorageLinkId: 1,
  date: -1,
  gatePassNo: -1,
});

// Gate passes by date for reporting
IncomingGatePassSchema.index({ date: -1 });

// Status queries
IncomingGatePassSchema.index({ status: 1, date: -1 });

// Voucher number unique per farmer-storage link (same voucher can exist for different cold storages)
IncomingGatePassSchema.index(
  { farmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true }
);

// Search by manual gate pass number within a farmer storage link (sparse: field is optional)
IncomingGatePassSchema.index(
  { farmerStorageLinkId: 1, manualGatePassNumber: 1 },
  { sparse: true }
);

/* =======================
   MODEL
======================= */

export const IncomingGatePass: Model<IIncomingGatePass> =
  mongoose.models.IncomingGatePass ||
  mongoose.model<IIncomingGatePass>('IncomingGatePass', IncomingGatePassSchema);
