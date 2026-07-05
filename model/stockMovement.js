const mongoose = require("mongoose");

/**
 * Append-only stock ledger.
 * Every change to stock — received, dispensed, adjusted, expired, damaged —
 * is recorded here so the current quantity of any medication is always
 * explainable from its movement history. Documents are never updated
 * or deleted.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    medication: {
      type: mongoose.Types.ObjectId,
      ref: "Medication",
      required: true,
      index: true,
    },
    batch: {
      type: mongoose.Types.ObjectId,
      ref: "Batch",
    },
    type: {
      type: String,
      enum: ["received", "dispensed", "adjusted", "expired", "damaged", "returned"],
      required: true,
      index: true,
    },
    // Signed change: positive for stock in, negative for stock out
    quantityChange: {
      type: Number,
      required: true,
    },
    // Medication.quantityInStock after this movement was applied
    balanceAfter: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    performedBy: {
      type: String,
      trim: true,
      default: "system",
    },
    // What triggered the movement, e.g. { kind: "Purchase", id: ... }
    reference: {
      kind: { type: String, trim: true },
      id: { type: mongoose.Types.ObjectId },
    },
  },
  { timestamps: true }
);

stockMovementSchema.index({ hospital: 1, createdAt: -1 });
stockMovementSchema.index({ hospital: 1, medication: 1, createdAt: -1 });

// Enforce append-only at the model level
stockMovementSchema.pre("findOneAndUpdate", function (next) {
  next(new Error("Stock movements are immutable and cannot be updated"));
});
stockMovementSchema.pre("updateOne", function (next) {
  next(new Error("Stock movements are immutable and cannot be updated"));
});
stockMovementSchema.pre("deleteOne", { document: false, query: true }, function (next) {
  next(new Error("Stock movements are immutable and cannot be deleted"));
});
stockMovementSchema.pre("findOneAndDelete", function (next) {
  next(new Error("Stock movements are immutable and cannot be deleted"));
});

module.exports = mongoose.model("StockMovement", stockMovementSchema);
