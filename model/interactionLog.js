const mongoose = require("mongoose");

// Silent audit log for drug-interaction checks.
// Minor interactions are stored here instead of interrupting the pharmacist
// (avoids alert fatigue), but remain reviewable for audits and safety reviews.
const interactionLogSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    user: {
      // The patient the dispensing session is for (optional — drug may be checked before a patient is selected)
      type: mongoose.Types.ObjectId,
      ref: "User",
    },
    sessionId: {
      // Frontend-generated ID for one dispensing session, so logs group naturally
      type: String,
      index: true,
    },
    drugChecked: {
      type: String,
      required: true,
    },
    basketSnapshot: [
      {
        name: String,
        dosage: String,
      },
    ],
    patientContext: {
      age: Number,
      gender: String,
      conditions: [String],
    },
    severity: {
      type: String,
      enum: ["none", "minor", "critical"],
      required: true,
      index: true,
    },
    advisory: {
      type: String, // The AI's one-line note (empty for "none")
    },
    interactingWith: [String], // Which basket drugs triggered the flag
    surfaced: {
      type: Boolean, // true = shown to the pharmacist, false = logged silently
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InteractionLog", interactionLogSchema);