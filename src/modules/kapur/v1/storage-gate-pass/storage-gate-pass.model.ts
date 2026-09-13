import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   ENUMS
======================= */

export enum BagType {
  JUTE = 'JUTE',
  LENO = 'LENO',
}

/* =======================
   INTERFACES
======================= */

interface IBagSize {
  size: string;
  currentQuantity: number;
  initialQuantity: number;
  bagType: BagType;
  chamber: string;
  floor: string;
  row: string;
}

interface IEditHistory {
  editedById?: Types.ObjectId;
  editedAt: Date;
  field: string;
  oldValue: any;
  newValue: any;
  reason?: string;
}

export interface IStorageGatePass extends Document {
  farmerStorageLinkId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  gatePassNo: number;
  manualGatePassNumber?: number;

  date: Date;
  variety: string;
  storageCategory: string;
  stage?: string;

  bagSizes: IBagSize[];

  editHistory: IEditHistory[];

  remarks?: string;

  /** Idempotency key for create; sparse unique index */
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const BagSizeSchema = new Schema<IBagSize>(
  {
    size: {
      type: String,
      required: true,
      trim: true,
    },

    currentQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    initialQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    bagType: {
      type: String,
      enum: Object.values(BagType),
      required: true,
    },

    chamber: {
      type: String,
      required: true,
      trim: true,
    },

    floor: {
      type: String,
      required: true,
      trim: true,
    },

    row: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const EditHistorySchema = new Schema<IEditHistory>(
  {
    editedById: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },

    editedAt: {
      type: Date,
      default: Date.now,
    },

    field: {
      type: String,
      required: true,
    },

    oldValue: {
      type: Schema.Types.Mixed,
    },

    newValue: {
      type: Schema.Types.Mixed,
    },

    reason: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

/* =======================
   MAIN SCHEMA
======================= */

const StorageGatePassSchema = new Schema<IStorageGatePass>(
  {
    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmerStorageLink',
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

    date: {
      type: Date,
      required: true,
      index: true,
    },

    variety: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    storageCategory: {
      type: String,
      required: true,
      trim: true,
    },

    stage: {
      type: String,
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

    editHistory: {
      type: [EditHistorySchema],
      default: [],
    },

    remarks: {
      type: String,
      trim: true,
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

// Idempotency: sparse unique so multiple nulls allowed
StorageGatePassSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
);

// Created by user lookup
// createdBy is indexed via field-level index: true

// Farmer storage link lookup
StorageGatePassSchema.index({ farmerStorageLinkId: 1, date: -1 });

// Daybook: sort by createdAt within a farmer link
StorageGatePassSchema.index({ farmerStorageLinkId: 1, createdAt: -1 });

// Voucher number unique per farmer-storage link (same voucher can exist for different cold storages)
StorageGatePassSchema.index(
  { farmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true }
);

// Gate passes by date for reporting
StorageGatePassSchema.index({ date: -1 });

/* =======================
   MODEL
======================= */

export const StorageGatePass: Model<IStorageGatePass> =
  mongoose.models.StorageGatePass ||
  mongoose.model<IStorageGatePass>('StorageGatePass', StorageGatePassSchema);
