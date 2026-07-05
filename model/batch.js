const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    medication: {
      type: mongoose.Types.ObjectId,
      ref: "Medication",
      required: true,
      index: true,
    },
    hospital: {
      type: mongoose.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    supplier: {
      type: mongoose.Types.ObjectId,
      ref: "Supplier",
    },
    batchNumber: {
      type: String,
      required: true,
      trim: true,
    },
    quantityReceived: {
      type: Number,
      required: true,
      min: [1, "Quantity received must be at least 1"],
    },
    quantityRemaining: {
      type: Number,
      required: true,
      min: 0,
    },
    costPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    receivedDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "depleted", "expired", "written_off"],
      default: "active",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Keep status in sync with remaining quantity
batchSchema.pre("save", function (next) {
  if (this.status === "written_off") return next();
  if (this.quantityRemaining === 0) {
    this.status = "depleted";
  } else if (this.expiryDate && this.expiryDate < new Date()) {
    this.status = "expired";
  } else {
    this.status = "active";
  }
  next();
});

// FEFO helper: active batches for a medication, earliest expiry first
batchSchema.statics.findDispensable = function (medicationId, hospitalId) {
  return this.find({
    medication: medicationId,
    hospital: hospitalId,
    status: "active",
    quantityRemaining: { $gt: 0 },
    expiryDate: { $gt: new Date() },
  }).sort({ expiryDate: 1, receivedDate: 1 });
};

module.exports = mongoose.model("Batch", batchSchema);
