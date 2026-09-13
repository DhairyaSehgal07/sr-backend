import mongoose, { Schema, Document, Types, Model } from 'mongoose';
import { BagType } from '../storage-gate-pass/storage-gate-pass.model.js';

/* =======================
   ENUMS
======================= */

const twoDecimalFloat = (value: number) => {
  if (typeof value !== 'number') return value;
  return Math.round(value * 100) / 100;
};

export enum OutgoingGatePassStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
}

/* =======================
   INTERFACES
======================= */

/** Aggregated issuance line for display/reporting (keyed by size + bagType + location) */
export interface IOutgoingOrderDetail {
  size: string;
  bagType: BagType;
  quantityIssued: number;
  quantityAvailable: number;
  weightInKg: number;
  chamber: string;
  floor: string;
  row: string;
}

/** Allocated bag line within a storage gate pass snapshot */
export interface IOutgoingStorageGatePassSnapshotBagSize {
  size: string;
  bagType: BagType;
  chamber: string;
  floor: string;
  row: string;
  initialQuantity: number;
  currentQuantity: number;
  /** Bags deducted from this line; authoritative for cancel stock restore */
  quantityIssued: number;
}

/** Point-in-time snapshot of each storage gate pass touched by this outgoing pass */
export interface IOutgoingStorageGatePassSnapshot {
  _id: Types.ObjectId;
  gatePassNo: number;
  variety: string;
  storageCategory: string;
  bagSizes: IOutgoingStorageGatePassSnapshotBagSize[];
}

export interface IOutgoingGatePass extends Document {
  farmerStorageLinkId: Types.ObjectId;
  createdBy?: Types.ObjectId;

  gatePassNo: number;
  manualGatePassNumber?: number;

  date: Date;
  variety: string;

  from: string;
  to: string;
  truckNumber: string;

  billNumber?: number;
  biltiNumber?: number;
  billBook?: string;
  biltiBook?: string;
  category?: string;

  orderDetails: IOutgoingOrderDetail[];
  storageGatePassSnapshots: IOutgoingStorageGatePassSnapshot[];

  remarks?: string;

  status: OutgoingGatePassStatus;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  /** Required when status is CANCELLED; enforced at service layer */
  cancellationRemarks?: string;

  /** Set at create when correcting a previously cancelled pass */
  replacesOutgoingGatePassId?: Types.ObjectId;

  /** Idempotency key for create; sparse unique index */
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const OutgoingOrderDetailSchema = new Schema<IOutgoingOrderDetail>(
  {
    size: {
      type: String,
      required: true,
      trim: true,
    },

    bagType: {
      type: String,
      enum: Object.values(BagType),
      required: true,
    },

    quantityIssued: {
      type: Number,
      required: true,
      min: 0,
    },

    quantityAvailable: {
      type: Number,
      required: true,
      min: 0,
    },

    weightInKg: {
      type: Number,
      required: true,
      min: 0,
      set: twoDecimalFloat,
    },

    chamber: {
      type: String,
      required: true,
      trim: true,
    },

    floor: {
      type: String,
      required: true,
      trim: true,
    },

    row: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const OutgoingStorageGatePassSnapshotBagSizeSchema =
  new Schema<IOutgoingStorageGatePassSnapshotBagSize>(
    {
      size: {
        type: String,
        required: true,
        trim: true,
      },

      bagType: {
        type: String,
        enum: Object.values(BagType),
        required: true,
      },

      chamber: {
        type: String,
        required: true,
        trim: true,
      },

      floor: {
        type: String,
        required: true,
        trim: true,
      },

      row: {
        type: String,
        required: true,
        trim: true,
      },

      initialQuantity: {
        type: Number,
        required: true,
        min: 0,
      },

      currentQuantity: {
        type: Number,
        required: true,
        min: 0,
      },

      quantityIssued: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    { _id: false }
  );

const OutgoingStorageGatePassSnapshotSchema =
  new Schema<IOutgoingStorageGatePassSnapshot>(
    {
      _id: {
        type: Schema.Types.ObjectId,
        ref: 'StorageGatePass',
        required: true,
      },

      gatePassNo: {
        type: Number,
        required: true,
      },

      variety: {
        type: String,
        required: true,
        trim: true,
      },

      storageCategory: {
        type: String,
        required: true,
        trim: true,
      },

      bagSizes: {
        type: [OutgoingStorageGatePassSnapshotBagSizeSchema],
        required: true,
        validate: {
          validator: (sizes: IOutgoingStorageGatePassSnapshotBagSize[]) =>
            sizes.length > 0,
          message: 'At least one bag size is required in snapshot',
        },
      },
    },
    { _id: false }
  );

/* =======================
   MAIN SCHEMA
======================= */

const OutgoingGatePassSchema = new Schema<IOutgoingGatePass>(
  {
    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmerStorageLink',
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },

    gatePassNo: {
      type: Number,
      required: true,
    },

    manualGatePassNumber: {
      type: Number,
    },

    date: {
      type: Date,
      required: true,
    },

    variety: {
      type: String,
      required: true,
      trim: true,
    },

    from: {
      type: String,
      required: true,
      trim: true,
    },

    to: {
      type: String,
      required: true,
      trim: true,
    },

    truckNumber: {
      type: String,
      trim: true,
      default: '',
    },

    billNumber: {
      type: Number,
    },

    biltiNumber: {
      type: Number,
    },

    billBook: {
      type: String,
      trim: true,
    },

    biltiBook: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      trim: true,
    },

    orderDetails: {
      type: [OutgoingOrderDetailSchema],
      required: true,
      validate: {
        validator: (details: IOutgoingOrderDetail[]) => details.length > 0,
        message: 'At least one order detail is required',
      },
    },

    storageGatePassSnapshots: {
      type: [OutgoingStorageGatePassSnapshotSchema],
      required: true,
      validate: {
        validator: (snapshots: IOutgoingStorageGatePassSnapshot[]) =>
          snapshots.length > 0,
        message: 'At least one storage gate pass snapshot is required',
      },
    },

    remarks: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: Object.values(OutgoingGatePassStatus),
      default: OutgoingGatePassStatus.ACTIVE,
      required: true,
    },

    cancelledAt: {
      type: Date,
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
    },

    cancellationRemarks: {
      type: String,
      trim: true,
    },

    replacesOutgoingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: 'OutgoingGatePass',
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

// Idempotency: sparse unique so multiple nulls allowed
OutgoingGatePassSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
);

// Farmer storage link lookup
OutgoingGatePassSchema.index({ farmerStorageLinkId: 1, date: -1 });

// Active/cancelled filtering within a farmer link
OutgoingGatePassSchema.index({ farmerStorageLinkId: 1, status: 1, date: -1 });

// Daybook: active passes sorted by createdAt within a farmer link
OutgoingGatePassSchema.index({
  farmerStorageLinkId: 1,
  status: 1,
  createdAt: -1,
});

// Voucher number unique per farmer-storage link (same voucher can exist for different cold storages)
OutgoingGatePassSchema.index(
  { farmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true }
);

// Find outgoing passes that drew from a given storage gate pass
OutgoingGatePassSchema.index({
  'storageGatePassSnapshots._id': 1,
  createdAt: -1,
});

// Gate passes by date for reporting
OutgoingGatePassSchema.index({ date: -1 });

/* =======================
   MODEL
======================= */

export const OutgoingGatePass: Model<IOutgoingGatePass> =
  mongoose.models.OutgoingGatePass ||
  mongoose.model<IOutgoingGatePass>('OutgoingGatePass', OutgoingGatePassSchema);
