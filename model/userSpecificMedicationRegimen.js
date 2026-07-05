const mongoose = require("mongoose");
const Schema = mongoose.Schema; // Ensure Schema is imported correctly

const userSpecificMedicationRegimenSchema = new Schema({
    user: {
        type: mongoose.Types.ObjectId,
        ref: "User",
        required: true
    },
    medication: {
        type: mongoose.Types.ObjectId,
        ref: "Medication",
        required: true
    },
    hospital: {
        type: mongoose.Types.ObjectId,
        ref: "Hospital",
        required: true
    },
    customDosage: {
        type: String,
        required: true
    },
    customFrequency: {
        type: String,
        required: true
    },
    duration: {
        type: Number, // Duration in days
        required: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model("UserSpecificMedicationRegimen", userSpecificMedicationRegimenSchema);
