import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IBillBook extends Document {
  coldStorageId: Types.ObjectId;
  name: string;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BillBookSchema = new Schema<IBillBook>(
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

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'bill_books',
  }
);

BillBookSchema.index({ coldStorageId: 1, name: 1 }, { unique: true });

export const BillBook: Model<IBillBook> =
  mongoose.models.BillBook ||
  mongoose.model<IBillBook>('BillBook', BillBookSchema);
