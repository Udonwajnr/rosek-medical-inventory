const mongoose = require("mongoose");
const schema = mongoose.Schema;

const userSchema = new schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
    },
    email: {
      type: String,
    },
    // Linking medication details
    medications: [
      {
        medication: {
          type: mongoose.Types.ObjectId,
          ref: "Medication",
          required: true,
        },
        quantity: {
          type: Number,
          default: 1, // Default value is 1 if not specified
        },
        startDate: {
          type: Date,
          required: true,
          default: Date.now, // Start of the medication
        },
        endDate: {
          type: Date,
        },
        current: {
          // Track whether the medication is currently active
          type: Boolean,
          default: true,
        },
        remove: { 
          // New field for marking removal
          type: Boolean,
          default: false,
        },
        custom:{
          type:Boolean,
          default:false
        },
        customDosage: {
          type: Number,
           },
          customFrequency: {
            value: { 
              type: Number,
              // required: true,
            },
            unit: { 
              type: String,
              enum: ['hours', 'days'], // Adjust the units as needed
              // required: true,
            },
          },
          customDuration: {
            value: { 
              type: Number, 
              // required: true, // e.g., 7 or 4
            },
            unit: { 
              type: String, 
              enum: ['days', 'weeks'], 
              // required: true, // e.g., 'days' or 'weeks'
            },
          },
      },
    ],

    newMedications: [
      {
        medication: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication' },
        quantity: { type: Number, default: 1 },
        startDate: { type: Date, default: Date.now },
        endDate: Date,
        current: { type: Boolean, default: true },
      },
    ],
    hospital: [
      {
        type: mongoose.Types.ObjectId,
        ref: "Hospital",
      },
    ],
    userSpecificMedicationRegimen: [
      {
        type: mongoose.Types.ObjectId,
        ref: "UserSpecificMedicationRegimen",
      },
    ],
    purchases: [
      {
        type: mongoose.Types.ObjectId,
        ref: "Purchase",
      },
    ],
  },
  { timestamps: true }
);

// Middleware to calculate endDate and update current status
userSchema.pre("save", async function (next) {
  try {
    const Medication = mongoose.model("Medication");

    for (let med of this.medications) {
      // If endDate is not set, calculate it based on the medication's duration
      if (!med.endDate) {
        const medicationDetails = await Medication.findById(med.medication);

        if (medicationDetails && medicationDetails.duration) {
          const { value, unit } = medicationDetails.duration;
          const startDate = med.startDate || new Date();
          let endDate = new Date(startDate);

          if (unit === "days") {
            endDate.setDate(endDate.getDate() + value);
          } else if (unit === "weeks") {
            endDate.setDate(endDate.getDate() + value * 7);
          }

          med.endDate = endDate;
        }
      }
      // Update current status based on endDate
      if (med.endDate && med.endDate < Date.now()) {
        med.current = false;
      } else {
        med.current = true;
      }
    }
  } catch (error) {
    next(error); // Pass any errors to the error handler
  }

  next();
});

module.exports = mongoose.model("User", userSchema);
