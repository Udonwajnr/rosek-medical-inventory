const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: true, // Ensures the purchase is associated with a user
    },
    medications: [{
        medication: {
            type: mongoose.Types.ObjectId,
            ref: 'Medication',
            required: true, // Ensures each item in the purchase has a medication reference
        },
        quantity: {
            type: Number,
            default: 1, // Default value of 1 for quantity
            required: true, // Quantity is required
            min: [1, 'Quantity must be at least 1'] // Ensure quantity is at least 1
        },
        startTime: {
            type: Date,
            default: Date.now, // Set default value to the current date and time
            // required: true, // Ensure start time is provided
        },
    }],
    hospital: {
        type: mongoose.Types.ObjectId,
        ref: 'Hospital',
        required: true, // Ensures the purchase is associated with a hospital
    },
    totalPurchase: { type: Number, required: true }, // Add this field to store total cost
    icsEmail: {
        status: {
            type: String,
            enum: ["sent", "failed", "no_email"],
            default: "no_email",
        },
        sentAt: {
            type: Date,
        },
        error: {
            type: String,
        },
    },
    createdAt: {
        type: Date,
        default: Date.now, // Automatically sets the created date
    },
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('Purchase', purchaseSchema);