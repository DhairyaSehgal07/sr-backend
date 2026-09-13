import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Preferences document linked to a ColdStorage.
 * Contains bag sizes, report format, and extensible custom key-value settings.
 */
export interface IPreferences extends Document {
  coldStorageId: Types.ObjectId;
  /** Array of bag sizes (e.g. [10, 25, 50] for kg, or ["10kg", "25kg"]) */
  bagSizes: (number | string)[];
  /** Report format identifier (e.g. "pdf", "excel", "default") */
  reportFormat: string;
  /** Custom key-value pairs for future settings */
  custom: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PreferencesSchema = new Schema<IPreferences>(
  {
    coldStorageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
      unique: true, // unique implies an index; do not also use index: true or schema.index()
    },
    bagSizes: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    reportFormat: {
      type: String,
      default: 'default',
      trim: true,
    },
    custom: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const Preferences = mongoose.model<IPreferences>(
  'Preferences',
  PreferencesSchema
);
