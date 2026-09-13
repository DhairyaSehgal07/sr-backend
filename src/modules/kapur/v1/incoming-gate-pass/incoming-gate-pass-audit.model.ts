import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

/** Snapshot of only the gate pass fields that changed in an edit */
export type IncomingGatePassAuditState = Record<string, unknown>;

export interface IIncomingGatePassAudit extends Document {
  incomingGatePassId: Types.ObjectId;
  editedById?: Types.ObjectId;

  /** Field values before the edit (only modified fields) */
  previousState: IncomingGatePassAuditState;
  /** Field values after the edit (only modified fields) */
  modifiedState: IncomingGatePassAuditState;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
}

/* =======================
   SCHEMA
======================= */

const IncomingGatePassAuditSchema = new Schema<IIncomingGatePassAudit>(
  {
    incomingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'IncomingGatePass',
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

IncomingGatePassAuditSchema.index({ incomingGatePassId: 1, createdAt: -1 });
IncomingGatePassAuditSchema.index({ editedById: 1, createdAt: -1 });
IncomingGatePassAuditSchema.index({ createdAt: -1 });

/* =======================
   MODEL
======================= */

export const IncomingGatePassAudit: Model<IIncomingGatePassAudit> =
  mongoose.models.IncomingGatePassAudit ||
  mongoose.model<IIncomingGatePassAudit>(
    'IncomingGatePassAudit',
    IncomingGatePassAuditSchema
  );
