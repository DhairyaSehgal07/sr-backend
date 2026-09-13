import mongoose, { Schema, Document, Types, Model } from 'mongoose';

/* =======================
   INTERFACES
======================= */

export interface ITemperatureReading {
  chamber: string;
  value: number;
}

export interface ITemperature extends Document {
  coldStorageId: Types.ObjectId;
  date: Date;
  temperatureReading: ITemperatureReading[];

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SCHEMA
======================= */

const TemperatureReadingSchema = new Schema<ITemperatureReading>(
  {
    chamber: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const TemperatureSchema = new Schema<ITemperature>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: 'ColdStorage',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    temperatureReading: {
      type: [TemperatureReadingSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

/* =======================
   INDEXES
======================= */

TemperatureSchema.index({ coldStorageId: 1, date: -1 });

/* =======================
   MODEL
======================= */

export const Temperature: Model<ITemperature> =
  mongoose.models.Temperature ||
  mongoose.model<ITemperature>('Temperature', TemperatureSchema);
