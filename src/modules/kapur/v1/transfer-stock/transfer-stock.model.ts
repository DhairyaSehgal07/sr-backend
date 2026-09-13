import mongoose, { Schema, Document, Types, Model } from 'mongoose';
import { BagType } from '../storage-gate-pass/storage-gate-pass.model.js';

/* =======================
   INTERFACES
======================= */

export interface ITransferStockItem {
  storageGatePassId: Types.ObjectId;
  gatePassNo: number;
  size: string;
  bagType: BagType;
  quantity: number;
  chamber: string;
  floor: string;
  row: string;
}

export interface ITransferStockGatePass extends Document {
  fromFarmerStorageLinkId: Types.ObjectId;
  toFarmerStorageLinkId: Types.ObjectId;

  createdBy?: Types.ObjectId;

  gatePassNo: number;
  date: Date;
  variety: string;

  truckNumber?: string;

  items: ITransferStockItem[];

  remarks?: string;

  createdStorageGatePassId: Types.ObjectId;
  /** Present for transfers created after outgoing gate pass was added for the from farmer */
  createdOutgoingGatePassId?: Types.ObjectId;

  /** Idempotency key for create; sparse unique index */
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const TransferStockItemSchema = new Schema<ITransferStockItem>(
  {
    storageGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'StorageGatePass',
      required: true,
    },

    gatePassNo: {
      type: Number,
      required: true,
    },

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
      min: 1,
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

/* =======================
   MAIN SCHEMA
======================= */

const TransferStockGatePassSchema = new Schema<ITransferStockGatePass>(
  {
    fromFarmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmerStorageLink',
      required: true,
    },

    toFarmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmerStorageLink',
      required: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },

    gatePassNo: {
      type: Number,
      required: true,
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

    truckNumber: {
      type: String,
      trim: true,
    },

    items: {
      type: [TransferStockItemSchema],
      required: true,
      validate: {
        validator: (items: ITransferStockItem[]) =>
          Array.isArray(items) && items.length > 0,
        message: 'At least one item is required',
      },
    },

    remarks: {
      type: String,
      trim: true,
    },

    createdStorageGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'StorageGatePass',
      required: true,
    },

    createdOutgoingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'OutgoingGatePass',
    },

    idempotencyKey: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* =======================
   INDEXES
======================= */

TransferStockGatePassSchema.index({
  fromFarmerStorageLinkId: 1,
  createdAt: -1,
});

TransferStockGatePassSchema.index({
  toFarmerStorageLinkId: 1,
  createdAt: -1,
});

TransferStockGatePassSchema.index(
  { fromFarmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true }
);

TransferStockGatePassSchema.index({
  'items.storageGatePassId': 1,
  createdAt: -1,
});

TransferStockGatePassSchema.index(
  { createdStorageGatePassId: 1 },
  { sparse: true }
);

TransferStockGatePassSchema.index(
  { createdOutgoingGatePassId: 1 },
  { sparse: true }
);

TransferStockGatePassSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
);

TransferStockGatePassSchema.index({ date: -1 });

/* =======================
   MODEL
======================= */

export const TransferStockGatePass: Model<ITransferStockGatePass> =
  mongoose.models.TransferStockGatePass ||
  mongoose.model<ITransferStockGatePass>(
    'TransferStockGatePass',
    TransferStockGatePassSchema
  );
