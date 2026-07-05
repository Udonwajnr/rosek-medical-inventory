const asyncHandler = require("express-async-handler");
const Medication = require("../model/medication");
const User = require("../model/user");
const mongoose = require("mongoose");
const Hospital = require("../model/hospital")
// Get all medications with populated user and hospital fields
const getAllMedications = asyncHandler(async (req, res) => {
    const medications = await Medication.find()
        .populate("user")
        .populate("hospital");
    return res.status(200).json(medications);
});

// Get a single medication by ID with populated user and hospital fields
const getMedication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid Medication ID format' });
    }

    const medication = await Medication.findById(id)
        .populate("user")
        .populate("hospital");

    if (!medication) {
        return res.status(404).json({ message: 'Medication not found' });
    }

    return res.status(200).json(medication);
});

// Create a new medication for a specific hospital
// Create a new medication for a specific hospital
// const createMedication = asyncHandler(async (req, res) => {
//   const { nameOfDrugs, dosage, frequency, time, hospital, notes, reminderSent, expiryDate, price, quantityInStock,barcode } = req.body;

//   // Validate the ObjectID for hospital
//   if (!mongoose.Types.ObjectId.isValid(hospital)) {
//       return res.status(400).json({ message: 'Invalid Hospital ID format' });
//   }

//   // Check if the hospital exists
//   const hospitalDoc = await Hospital.findById(hospital);
//   if (!hospitalDoc) {
//       return res.status(404).json({ message: 'Hospital not found' });
//   }

//   // Create the new medication
//   const medication = new Medication({ 
//       nameOfDrugs, 
//       dosage, 
//       frequency, 
//       time, 
//       hospital, 
//       notes, 
//       reminderSent, 
//       expiryDate, 
//       price, 
//       quantityInStock ,
//       barcode
//   });

//   await medication.save();

//   // Add the medication to the hospital's medication list
//   hospitalDoc.medication.push(medication._id);

//   // Save the updated hospital document
//   await hospitalDoc.save();

//   // Return the newly created Medication
//   res.status(201).json(medication);
// });


// Update a medication by ID

const updateMedication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid Medication ID format' });
    }

    if (req.body.hospital && !mongoose.Types.ObjectId.isValid(req.body.hospital)) {
        return res.status(400).json({ message: 'Invalid Hospital ID format' });
    }

    const medication = await Medication.findById(id);
    if (!medication) {
        return res.status(404).json({ message: 'Medication not found' });
    }

    const updatedMedication = await Medication.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
        .populate("user")
        .populate("hospital");

    return res.status(200).json(updatedMedication);
});

// Delete a medication by ID
const deleteMedication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid Medication ID format' });
    }

    const medication = await Medication.findById(id);
    if (!medication) {
        return res.status(404).json({ message: 'Medication not found' });
    }

    await Medication.findByIdAndDelete(id);
    return res.status(200).json({ msg: `Medication with ID ${id} has been deleted` });
});

// Get medications for a specific user
const getUserMedicationData = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid User ID format' });
    }

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const medications = await Medication.find({ user: id })
        .populate("hospital");

    res.status(200).json({ user, medications });
});

// Search medications by name or barcode
const searchMedications = asyncHandler(async (req, res) => {
    const { query } = req.query;

    const medications = await Medication.find({
        $or: [
            { nameOfDrugs: { $regex: query, $options: 'i' } },
            { barcode: { $regex: query, $options: 'i' } },
        ],
    });

    res.status(200).json(medications);
});

// Check inventory levels for medications
const checkInventoryLevels = asyncHandler(async (req, res) => {
    const lowStockMedications = await Medication.find({ quantityInStock: { $lte: 10 } });

    res.status(200).json(lowStockMedications);
});

// Generate inventory report (e.g., expired and low-stock medications)
const generateInventoryReport = asyncHandler(async (req, res) => {
    const expiredMedications = await Medication.find({ expiryDate: { $lte: new Date() } });
    const lowStockMedications = await Medication.find({ quantityInStock: { $lte: 10 } });

    res.status(200).json({ expiredMedications, lowStockMedications });
});

// Record a medication transaction (e.g., purchase or sale)
const recordTransaction = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid Medication ID format' });
    }

    const medication = await Medication.findById(id);
    if (!medication) {
        return res.status(404).json({ message: 'Medication not found' });
    }

    medication.quantityInStock -= quantity;
    if (medication.quantityInStock < 0) {
        medication.quantityInStock = 0;
    }

    await medication.save();
    return res.status(200).json(medication);
});

module.exports = {
    getAllMedications,
    getMedication,
    createMedication,
    updateMedication,
    deleteMedication,
    getUserMedicationData,
    searchMedications,
    checkInventoryLevels,
    generateInventoryReport,
    recordTransaction
};
