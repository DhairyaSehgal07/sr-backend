import mongoose, { Schema, Types, Model, HydratedDocument } from 'mongoose';

/* =======================
   ENUMS
======================= */

export enum EditHistoryEntityType {
  STORAGE_GATE_PASS = 'storage_gate_pass',
  INCOMING_GATE_PASS = 'incoming_gate_pass',
  OUTGOING_GATE_PASS = 'outgoing_gate_pass',
}

export enum EditHistoryAction {
  CREATE = 'create',
  UPDATE = 'update',
  QUANTITY_ADJUSTMENT = 'quantity_adjustment',
  CLOSE = 'close',
  OTHER = 'other',
}

/* =======================
   INTERFACES
======================= */

export interface IEditHistory {
  entityType: EditHistoryEntityType;
  documentId: Types.ObjectId;
  coldStorageId: Types.ObjectId;
  editedBy: Types.ObjectId;
  editedAt: Date;
  action: EditHistoryAction;
  changeSummary?: string;
  snapshotBefore?: Record<string, unknown>;
  snapshotAfter?: Record<string, unknown>;
  createdAt: Date;
}

export type EditHistoryDocument = HydratedDocument<IEditHistory>;

/* =======================
   MAIN SCHEMA
======================= */

const EditHistorySchema = new Schema<IEditHistory>(
  {
    entityType: {
      type: String,
      enum: Object.values(EditHistoryEntityType),
      required: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'StorageGatePass',
      required: true,
    },
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
    },
    editedBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
      required: true,
    },
    editedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    action: {
      type: String,
      enum: Object.values(EditHistoryAction),
      required: true,
    },
    changeSummary: {
      type: String,
      trim: true,
    },
    snapshotBefore: {
      type: Schema.Types.Mixed,
    },
    snapshotAfter: {
      type: Schema.Types.Mixed,
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

EditHistorySchema.index({ entityType: 1, documentId: 1, editedAt: -1 });
EditHistorySchema.index({ coldStorageId: 1, editedAt: -1 });

/* =======================
   MODEL EXPORT
======================= */

export const EditHistory: Model<IEditHistory> =
  mongoose.models.EditHistory ||
  mongoose.model<IEditHistory>('EditHistory', EditHistorySchema);
