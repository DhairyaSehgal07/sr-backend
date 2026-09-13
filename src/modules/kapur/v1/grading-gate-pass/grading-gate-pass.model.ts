import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   ENUMS
======================= */
const oneDecimalFloat = (value: number) => {
  if (typeof value !== 'number') return value;
  return Math.round(value * 10) / 10;
};

export enum BagType {
  JUTE = 'JUTE',
  LENO = 'LENO',
}

/* =======================
   INTERFACES
======================= */

interface IOrderDetail {
  size: string;
  bagType: BagType;
  quantity: number;
  weightPerBagKg: number;
}

export interface IGradingGatePass extends Document {
  farmerStorageLinkId: Types.ObjectId;
  incomingGatePassIds?: Types.ObjectId[] | null;
  createdBy?: Types.ObjectId;

  gatePassNo: number;
  manualGatePassNumber?: number;
  date: Date;
  variety: string;

  orderDetails: IOrderDetail[];

  remarks?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const OrderDetailSchema = new Schema<IOrderDetail>(
  {
    size: {
      type: String,
      required: true,
      trim: true,
    },

    bagType: {
      type: String,
      enum: Object.values(BagType),
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      set: oneDecimalFloat,
    },

    weightPerBagKg: {
      type: Number,
      required: true,
      min: 0,
      set: oneDecimalFloat,
    },
  },
  { _id: false }
);

/* =======================
   MAIN SCHEMA
======================= */

const GradingGatePassSchema = new Schema<IGradingGatePass>(
  {
    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmerStorageLink',
      required: true,
    },

    incomingGatePassIds: {
      type: [Schema.Types.ObjectId],
      ref: 'IncomingGatePass',
      required: false,
      default: null,
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

    orderDetails: {
      type: [OrderDetailSchema],
      required: true,
      validate: {
        validator: (details: IOrderDetail[]) => details.length > 0,
        message: 'At least one order detail is required',
      },
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

// Farmer storage link lookup
GradingGatePassSchema.index({ farmerStorageLinkId: 1, date: -1 });

// Incoming gate pass(es) → grading passes (chronological; multikey on array)
GradingGatePassSchema.index({ incomingGatePassIds: 1, createdAt: -1 });

// Gate passes by date for reporting
GradingGatePassSchema.index({ date: -1 });

// Voucher number unique per farmer-storage link (same voucher can exist for different cold storages)
GradingGatePassSchema.index(
  { farmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true }
);

/* =======================
   MODEL
======================= */

export const GradingGatePass: Model<IGradingGatePass> =
  mongoose.models.GradingGatePass ||
  mongoose.model<IGradingGatePass>('GradingGatePass', GradingGatePassSchema);
