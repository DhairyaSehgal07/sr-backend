import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   ENUMS
======================= */

export enum OutgoingGatePassAuditAction {
  CREATE = 'CREATE',
  EDIT = 'EDIT',
  CANCEL = 'CANCEL',
}

/* =======================
   INTERFACES
======================= */

/** Snapshot of only the fields relevant to a create/cancel audit event */
export type OutgoingGatePassAuditState = Record<string, unknown>;

export interface IOutgoingGatePassAudit extends Document {
  outgoingGatePassId: Types.ObjectId;
  action: OutgoingGatePassAuditAction;
  performedById?: Types.ObjectId;

  /** Field values before the event (empty on create) */
  previousState: OutgoingGatePassAuditState;
  /** Field values after the event */
  modifiedState: OutgoingGatePassAuditState;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
}

/* =======================
   SCHEMA
======================= */

const OutgoingGatePassAuditSchema = new Schema<IOutgoingGatePassAudit>(
  {
    outgoingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'OutgoingGatePass',
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: Object.values(OutgoingGatePassAuditAction),
      required: true,
    },

    performedById: {
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

OutgoingGatePassAuditSchema.index({ outgoingGatePassId: 1, createdAt: -1 });
OutgoingGatePassAuditSchema.index({ performedById: 1, createdAt: -1 });
OutgoingGatePassAuditSchema.index({ createdAt: -1 });

/* =======================
   MODEL
======================= */

export const OutgoingGatePassAudit: Model<IOutgoingGatePassAudit> =
  mongoose.models.OutgoingGatePassAudit ||
  mongoose.model<IOutgoingGatePassAudit>(
    'OutgoingGatePassAudit',
    OutgoingGatePassAuditSchema
  );
