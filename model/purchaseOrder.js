const mongoose = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      trim: true,
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
      required: true,
    },
    items: [
      {
        medication: {
          type: mongoose.Types.ObjectId,
          ref: "Medication",
          required: true,
        },
        quantityOrdered: {
          type: Number,
          required: true,
          min: [1, "Quantity ordered must be at least 1"],
        },
        costPrice: {
          type: Number,
          default: 0,
          min: 0,
        },
        // Filled in when the order is received
        quantityReceived: {
          type: Number,
          default: 0,
          min: 0,
        },
        batch: {
          type: mongoose.Types.ObjectId,
          ref: "Batch",
        },
      },
    ],
    status: {
      type: String,
      enum: ["draft", "ordered", "received", "cancelled"],
      default: "draft",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    expectedDate: {
      type: Date,
    },
    receivedAt: {
      type: Date,
    },
    createdBy: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ hospital: 1, orderNumber: 1 }, { unique: true });

purchaseOrderSchema.virtual("totalCost").get(function () {
  return (this.items || []).reduce(
    (sum, item) => sum + (item.costPrice || 0) * (item.quantityOrdered || 0),
    0
  );
});

purchaseOrderSchema.set("toJSON", { virtuals: true });
purchaseOrderSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
