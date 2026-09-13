import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

/** Snapshot of only the gate pass fields that changed in an edit */
export type StorageGatePassAuditState = Record<string, unknown>;

export interface IStorageGatePassAudit extends Document {
  storageGatePassId: Types.ObjectId;
  editedById?: Types.ObjectId;

  /** Field values before the edit (only modified fields) */
  previousState: StorageGatePassAuditState;
  /** Field values after the edit (only modified fields) */
  modifiedState: StorageGatePassAuditState;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
}

/* =======================
   SCHEMA
======================= */

const StorageGatePassAuditSchema = new Schema<IStorageGatePassAudit>(
  {
    storageGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'StorageGatePass',
      required: true,
      index: true,
    },

    editedById: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
      index: true,
    },

    previousState: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },

    modifiedState: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },

    ipAddress: {
      type: String,
    },

    userAgent: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

/* =======================
   INDEXES
======================= */

StorageGatePassAuditSchema.index({ storageGatePassId: 1, createdAt: -1 });
StorageGatePassAuditSchema.index({ editedById: 1, createdAt: -1 });
StorageGatePassAuditSchema.index({ createdAt: -1 });

/* =======================
   MODEL
======================= */

export const StorageGatePassAudit: Model<IStorageGatePassAudit> =
  mongoose.models.StorageGatePassAudit ||
  mongoose.model<IStorageGatePassAudit>(
    'StorageGatePassAudit',
    StorageGatePassAuditSchema
  );
