import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IStockFilter extends Document {
  coldStorageId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const StockFilterSchema = new Schema<IStockFilter>(
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
  },
  {
    timestamps: true,
    collection: 'stock-filter',
  }
);

StockFilterSchema.index({ coldStorageId: 1, name: 1 }, { unique: true });

export const StockFilter: Model<IStockFilter> =
  mongoose.models.StockFilter ||
  mongoose.model<IStockFilter>(
    'StockFilter',
    StockFilterSchema,
    'stock-filter'
  );
