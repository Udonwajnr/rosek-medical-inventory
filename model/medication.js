const mongoose = require("mongoose");
const schema = mongoose.Schema;

const medicationSchema = new schema({
  nameOfDrugs: {
    type: String,
    required: true,
  },
  dosage: {
    type: String,
    required: true,
  },
  dosageForm: {
    type: String,
    required: true,
  },
  dosageAmount: {
    type: Number,  // Number of tablets/doses per intake
    required: true,
  },
  frequency: {
    value: { 
      type: Number,
      required: true,
    },
    unit: { 
      type: String,
      enum: ['hours', 'days'], // Adjust the units as needed
      required: true,
    },
  },
  duration: {
    value: { 
      type: Number, 
      required: true, // e.g., 7 or 4
    },
    unit: { 
      type: String, 
      enum: ['days', 'weeks'], 
      required: true, // e.g., 'days' or 'weeks'
    },
  },
  numberOfUnits: {
    type: Number,
    required: true,
  },
  notes: {
    type: String,
  },
  quantityInStock: {
    type: Number,
    required: true,
  },
  barcode: {
    type: String,
  },
  preferredSupplier: {
    type: mongoose.Types.ObjectId,
    ref: "Supplier",
  },
  price: {
    type: Number,
    required: true,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  inStock: {
    type: Boolean,
    default: true,
  },
  reorderLevel: {
    type: Number,
    default: 10,
  },
  user: [{
    type: mongoose.Types.ObjectId,
    ref: "User",
  }],
  hospital: [{
    type: mongoose.Types.ObjectId,
    ref: "Hospital",
    required: true,
  }],
  userSpecificMedicationRegimen: [{
    type: mongoose.Types.ObjectId,
    ref: "UserSpecificMedicationRegimen",
  }],
  reminderSent: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

medicationSchema.pre('save', function (next) {
  if (this.quantityInStock === 0) {
    this.inStock = false;
  } else {
    this.inStock = true;
  }
  next();
});

module.exports = mongoose.model("Medication", medicationSchema);
