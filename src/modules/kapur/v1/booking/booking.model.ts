import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   ENUMS
======================= */

/* =======================
   INTERFACES
======================= */

interface IBagSize {
  size: string;
  variety: string;
  currentQuantity: number;
  initialQuantity: number;
}

interface IEditHistory {
  editedById?: Types.ObjectId;
  editedAt: Date;
  field: string;
  oldValue: any;
  newValue: any;
  reason?: string;
}

export interface IBooking extends Document {
  dispatchLedgerId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  gatePassNo: number;
  manualGatePassNumber?: number;

  date: Date;

  bagSizes: IBagSize[];

  editHistory: IEditHistory[];

  remarks?: string;

  /** Idempotency key for create; sparse unique index */
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const BagSizeSchema = new Schema<IBagSize>(
  {
    size: {
      type: String,
      required: true,
      trim: true,
    },

    variety: {
      type: String,
      required: true,
      trim: true,
    },

    currentQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    initialQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const EditHistorySchema = new Schema<IEditHistory>(
  {
    editedById: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },

    editedAt: {
      type: Date,
      default: Date.now,
    },

    field: {
      type: String,
      required: true,
    },

    oldValue: {
      type: Schema.Types.Mixed,
    },

    newValue: {
      type: Schema.Types.Mixed,
    },

    reason: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

/* =======================
   MAIN SCHEMA
======================= */

const BookingSchema = new Schema<IBooking>(
  {
    dispatchLedgerId: {
      type: Schema.Types.ObjectId,
      ref: 'DispatchLedger',
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
      index: true,
    },

    gatePassNo: {
      type: Number,
      required: true,
      index: true,
    },

    manualGatePassNumber: {
      type: Number,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    bagSizes: {
      type: [BagSizeSchema],
      required: true,
      validate: {
        validator: (sizes: IBagSize[]) => sizes.length > 0,
        message: 'At least one bag size is required',
      },
    },

    editHistory: {
      type: [EditHistorySchema],
      default: [],
    },

    remarks: {
      type: String,
      trim: true,
    },

    idempotencyKey: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =======================
   INDEXES
======================= */

BookingSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

BookingSchema.index({ dispatchLedgerId: 1, date: -1 });

BookingSchema.index({ dispatchLedgerId: 1, gatePassNo: 1 }, { unique: true });

BookingSchema.index({ date: -1 });

/* =======================
   MODEL
======================= */

export const Booking: Model<IBooking> =
  mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);
