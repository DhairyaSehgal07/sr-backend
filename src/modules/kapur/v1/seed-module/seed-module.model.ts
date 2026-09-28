import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

interface IBagSize {
  name: string;
  quantity: number;
  rate: number;
  acres: number;
}

export interface IFarmerSeed extends Document {
  farmerStorageLinkId: Types.ObjectId;
  gatePassNo?: number;
  invoiceNumber?: string;
  date: Date;
  variety: string;
  generation: string;
  bagSizes: IBagSize[];
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const BagSizeSchema = new Schema<IBagSize>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    acres: {
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

const FarmerSeedSchema = new Schema<IFarmerSeed>(
  {
    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmerStorageLink',
      required: true,
      index: true,
    },
    gatePassNo: {
      type: Number,
      min: 0,
      default: null,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      default: null,
    },
    date: {
      type: Date,
      required: true,
    },
    variety: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    generation: {
      type: String,
      required: true,
      trim: true,
    },
    bagSizes: {
      type: [BagSizeSchema],
      required: true,
      validate: {
        validator: (sizes: IBagSize[]) => sizes.length > 0,
        message: 'At least one bag size is required',
      },
    },
    remarks: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* =======================
   INDEXES
======================= */

FarmerSeedSchema.index({ farmerStorageLinkId: 1, createdAt: -1 });

/* =======================
   MODEL
======================= */

export const FarmerSeed: Model<IFarmerSeed> =
  mongoose.models.FarmerSeed ||
  mongoose.model<IFarmerSeed>('FarmerSeed', FarmerSeedSchema);
