import mongoose, { Schema, Document, Types } from 'mongoose';
import { Role } from '../store-admin/store-admin.model.js';

/* -------------------------------------------------
   ResourcePermission type
   (adjust if you already have a richer structure)
-------------------------------------------------- */

export interface ResourcePermission {
  resource: string; // e.g. "incomingOrder", "outgoingOrder"
  actions: string[]; // e.g. ["create", "read", "approve"]
}

/* -------------------- INTERFACE -------------------- */

export interface IRolePermission extends Document {
  coldStorageId: Types.ObjectId;

  role: Role;
  permissions: ResourcePermission[];

  createdById: Types.ObjectId;
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/* -------------------- SCHEMA -------------------- */

const ResourcePermissionSchema = new Schema<ResourcePermission>(
  {
    resource: {
      type: String,
      required: true,
    },
    actions: {
      type: [String],
      required: true,
      default: [],
    },
  },
  { _id: false } // embedded, no ObjectId needed
);

const RolePermissionSchema = new Schema<IRolePermission>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
    },

    role: {
      type: String,
      enum: Object.values(Role),
      required: true,
    },

    permissions: {
      type: [ResourcePermissionSchema],
      default: [],
    },

    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'StoreAdmin',
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

/* -------------------- INDEXES -------------------- */

// Prisma: @@unique([coldStorageId, role])
RolePermissionSchema.index({ coldStorageId: 1, role: 1 }, { unique: true });

// Prisma: @@index([coldStorageId])
RolePermissionSchema.index({ coldStorageId: 1 });

// Prisma: @@index([createdAt])
RolePermissionSchema.index({ createdAt: 1 });

/* -------------------- EXPORT -------------------- */

export const RolePermission =
  mongoose.models.RolePermission ||
  mongoose.model<IRolePermission>('RolePermission', RolePermissionSchema);
