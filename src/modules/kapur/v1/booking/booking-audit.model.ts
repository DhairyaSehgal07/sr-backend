import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

/** Snapshot of only the booking fields that changed in an edit */
export type BookingAuditState = Record<string, unknown>;

export interface IBookingAudit extends Document {
  bookingId: Types.ObjectId;
  editedById?: Types.ObjectId;

  /** Field values before the edit (only modified fields) */
  previousState: BookingAuditState;
  /** Field values after the edit (only modified fields) */
  modifiedState: BookingAuditState;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
}

/* =======================
   SCHEMA
======================= */

const BookingAuditSchema = new Schema<IBookingAudit>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
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

BookingAuditSchema.index({ bookingId: 1, createdAt: -1 });
BookingAuditSchema.index({ editedById: 1, createdAt: -1 });
BookingAuditSchema.index({ createdAt: -1 });

/* =======================
   MODEL
======================= */

export const BookingAudit: Model<IBookingAudit> =
  mongoose.models.BookingAudit ||
  mongoose.model<IBookingAudit>('BookingAudit', BookingAuditSchema);
