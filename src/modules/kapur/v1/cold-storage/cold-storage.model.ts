import mongoose, { Schema, Document, Types } from 'mongoose';

// Enum for Plan
export enum Plan {
  Premium = 'Premium',
  Enterprise = 'Enterprise',
}

// Interface for ColdStorage document
export interface IColdStorage extends Document {
  name: string;
  address: string;
  mobileNumber: string;
  capacity: number;
  imageUrl?: string;
  isPaid: boolean;
  isActive: boolean;
  plan: Plan;
  createdAt: Date;
  updatedAt: Date;

  preferencesId?: Types.ObjectId;
  // preferences?: Preferences; // You can populate this if you have Preferences model
  admins: Types.ObjectId[]; // StoreAdmin references
}

// Mongoose schema
const ColdStorageSchema = new Schema<IColdStorage>(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobileNumber: { type: String, required: true, unique: true },
    capacity: { type: Number, required: true },
    imageUrl: { type: String, default: '' },
    isPaid: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    plan: { type: String, enum: Object.values(Plan), default: Plan.Enterprise },
    preferencesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Preferences',
      index: true,
      // One-to-one is enforced by Preferences.coldStorageId (unique)
    },
    admins: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'StoreAdmin', default: [] },
    ],
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// List cold storages sorted by creation
ColdStorageSchema.index({ createdAt: 1 });

// Export model
export const ColdStorage = mongoose.model<IColdStorage>(
  'ColdStorage',
  ColdStorageSchema
);
