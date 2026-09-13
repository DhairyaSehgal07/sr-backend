import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

/** Snapshot of only the gate pass fields that changed in an edit */
export type GradingGatePassAuditState = Record<string, unknown>;

export interface IGradingGatePassAudit extends Document {
  gradingGatePassId: Types.ObjectId;
  editedById?: Types.ObjectId;

  /** Field values before the edit (only modified fields) */
  previousState: GradingGatePassAuditState;
  /** Field values after the edit (only modified fields) */
  modifiedState: GradingGatePassAuditState;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
}

/* =======================
   SCHEMA
======================= */

const GradingGatePassAuditSchema = new Schema<IGradingGatePassAudit>(
  {
    gradingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'GradingGatePass',
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

GradingGatePassAuditSchema.index({ gradingGatePassId: 1, createdAt: -1 });
GradingGatePassAuditSchema.index({ editedById: 1, createdAt: -1 });
GradingGatePassAuditSchema.index({ createdAt: -1 });

/* =======================
   MODEL
======================= */

export const GradingGatePassAudit: Model<IGradingGatePassAudit> =
  mongoose.models.GradingGatePassAudit ||
  mongoose.model<IGradingGatePassAudit>(
    'GradingGatePassAudit',
    GradingGatePassAuditSchema
  );
