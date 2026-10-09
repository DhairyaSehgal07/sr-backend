import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   ENUMS
======================= */

export enum SandhuDispatchAuditAction {
  CREATE = 'CREATE',
  EDIT = 'EDIT',
  CANCEL = 'CANCEL',
}

/* =======================
   INTERFACES
======================= */

/** Snapshot of only the fields relevant to a create/edit/cancel audit event */
export type SandhuDispatchAuditState = Record<string, unknown>;

export interface ISandhuDispatchAudit extends Document {
  sandhuDispatchId: Types.ObjectId;
  action: SandhuDispatchAuditAction;
  performedById?: Types.ObjectId;

  /** Field values before the event (empty on create) */
  previousState: SandhuDispatchAuditState;
  /** Field values after the event */
  modifiedState: SandhuDispatchAuditState;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
}

/* =======================
   SCHEMA
======================= */

const SandhuDispatchAuditSchema = new Schema<ISandhuDispatchAudit>(
  {
    sandhuDispatchId: {
      type: Schema.Types.ObjectId,
      ref: 'SandhuDispatch',
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: Object.values(SandhuDispatchAuditAction),
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
    collection: 'sandhu-dispatch-audits',
  }
);

/* =======================
   INDEXES
======================= */

SandhuDispatchAuditSchema.index({ sandhuDispatchId: 1, createdAt: -1 });
SandhuDispatchAuditSchema.index({ performedById: 1, createdAt: -1 });
SandhuDispatchAuditSchema.index({ createdAt: -1 });

/* =======================
   MODEL
======================= */

export const SandhuDispatchAudit: Model<ISandhuDispatchAudit> =
  mongoose.models.SandhuDispatchAudit ||
  mongoose.model<ISandhuDispatchAudit>(
    'SandhuDispatchAudit',
    SandhuDispatchAuditSchema,
    'sandhu-dispatch-audits'
  );
