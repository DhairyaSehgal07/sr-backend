import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IColdStoreStockSize {
  name: string;
  currentQuantity: number;
  initialQuantity: number;
}

export interface IColdStoreStock extends Document {
  coldStorageId: Types.ObjectId;
  variety: string;
  size: IColdStoreStockSize;
  stockFilter?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdStoreStockSizeSchema = new Schema<IColdStoreStockSize>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    currentQuantity: {
      type: Number,
      required: true,
    },
    initialQuantity: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const ColdStoreStockSchema = new Schema<IColdStoreStock>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
      index: true,
    },
    variety: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: ColdStoreStockSizeSchema,
      required: true,
    },
    stockFilter: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'cold-store-stock',
  }
);

ColdStoreStockSchema.index(
  { coldStorageId: 1, variety: 1, 'size.name': 1, stockFilter: 1 },
  { unique: true }
);

export const ColdStoreStock: Model<IColdStoreStock> =
  mongoose.models.ColdStoreStock ||
  mongoose.model<IColdStoreStock>(
    'ColdStoreStock',
    ColdStoreStockSchema,
    'cold-store-stock'
  );
