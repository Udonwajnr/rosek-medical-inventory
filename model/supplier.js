const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    hospital: {
      type: mongoose.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// A hospital should not have two suppliers with the same name
supplierSchema.index({ hospital: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Supplier", supplierSchema);
