const asyncHandler = require("express-async-handler");
const Medication = require("../model/medication");
const User = require("../model/user");
const mongoose = require("mongoose");
const Hospital = require("../model/hospital");

// Get all medications across all hospitals
const getAllMedicationsAcrossHospitals = asyncHandler(async (req, res) => {
    const medications = await Medication.find().populate("user").populate("hospital");
    return res.status(200).json(medications);
});

// Get all medications of a specific hospital
const getAllMedicationsOfHospital = asyncHandler(async (req, res) => {
    const { hospitalId } = req.params;
    const medications = await Medication.find({ hospital: hospitalId }).populate("user").populate("hospital");
    return res.status(200).json(medications);
});

// Get a specific medication by ID within a specific hospital
const getMedicationOfHospital = asyncHandler(async (req, res) => {
    const { hospitalId, id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid Medication ID format' });
    }

    const medication = await Medication.findOne({ _id: id, hospital: hospitalId }).populate("user").populate("hospital");

    if (!medication) {
        return res.status(404).json({ message: 'Medication not found in the specified hospital' });
    }

    return res.status(200).json(medication);
});

// Create a new medication for a specific hospital
const createMedicationForHospital = asyncHandler(async (req, res) => {
    const { hospitalId } = req.params;
    const { 
        nameOfDrugs, 
        dosage, 
        dosageForm, // New field
        dosageAmount, // New field
        frequency, 
        duration, // New field { value, unit }
        notes, 
        reminderSent, 
        expiryDate, 
        price, 
        quantityInStock, 
        barcode,
        preferredSupplier,
        numberOfUnits // New field
    } = req.body;

    // Validate the ObjectID for hospital
    if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
        return res.status(400).json({ message: 'Invalid Hospital ID format' });
    }

    // Check if the hospital exists
    const hospitalDoc = await Hospital.findById(hospitalId);
    if (!hospitalDoc) {
        return res.status(404).json({ message: 'Hospital not found' });
    }

    // Create the new medication
    const medication = new Medication({
        nameOfDrugs,
        dosage,
        dosageForm, // New field
        dosageAmount, // New field
        frequency,
        duration, // New field: { value, unit }
        notes,
        reminderSent,
        expiryDate,
        price,
        quantityInStock,
        barcode,
        preferredSupplier: preferredSupplier || undefined,
        numberOfUnits, // New field
        hospital: hospitalId
    });

    // Save the medication
    await medication.save();

    // Add the medication to the hospital's medication list
    hospitalDoc.medication.push(medication._id);

    // Save the updated hospital document
    await hospitalDoc.save();

    // Return the newly created Medication
    res.status(201).json(medication);
});

// Update a medication by ID within a specific hospital
const updateMedicationOfHospital = asyncHandler(async (req, res) => {
    const { hospitalId, id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid Medication ID format' });
    }

    // if (req.body.hospital && !mongoose.Types.ObjectId.isValid(req.body.hospital)) {
    //     return res.status(400).json({ message: 'Invalid Hospital ID format' });
    // }

    const medication = await Medication.findOne({ _id: id, hospital: hospitalId });
    if (!medication) {
        return res.status(404).json({ message: 'Medication not found in the specified hospital' });
    }

    const updatedMedication = await Medication.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
        .populate("user")
        .populate("hospital");

    // Update the hospital's medication list if necessary
    const hospital = await Hospital.findById(hospitalId);
    if (hospital && !hospital.medication.includes(updatedMedication._id)) {
        hospital.medication.push(updatedMedication._id);
        await hospital.save();
    }

    return res.status(200).json(updatedMedication);
});

// Delete a medication by ID within a specific hospital
const deleteMedicationOfHospital = asyncHandler(async (req, res) => {
    const { hospitalId, id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid Medication ID format' });
    }

    const medication = await Medication.findOne({ _id: id, hospital: hospitalId });
    if (!medication) {
        return res.status(404).json({ message: 'Medication not found in the specified hospital' });
    }

    // Remove the medication from the hospital's medication list
    const hospital = await Hospital.findById(hospitalId);
    if (hospital) {
        hospital.medication.pull(medication._id);
        await hospital.save();
    }

    await Medication.findByIdAndDelete(id);
    return res.status(200).json({ msg: `Medication with ID ${id} has been deleted from hospital ${hospitalId,hospital.name}` });
});

// Get all medications for a specific user within a specific hospital
const getUserMedicationDataOfHospital = asyncHandler(async (req, res) => {
    const { hospitalId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid User ID format' });
    }

    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const medications = await Medication.find({ user: userId, hospital: hospitalId }).populate("hospital");

    res.status(200).json({ user, medications });
});

// Search medications by name or barcode within a specific hospital
const searchMedicationsOfHospital = asyncHandler(async (req, res) => {
    const { hospitalId } = req.params;
    const { query } = req.query;

    const medications = await Medication.find({
        hospital: hospitalId,
        $or: [
            { nameOfDrugs: { $regex: query, $options: 'i' } },
            { barcode: { $regex: query, $options: 'i' } },
        ],
    });

    res.status(200).json(medications);
});

module.exports = {
    getAllMedicationsAcrossHospitals,
    getAllMedicationsOfHospital,
    getMedicationOfHospital,
    createMedicationForHospital,
    updateMedicationOfHospital,
    deleteMedicationOfHospital,
    getUserMedicationDataOfHospital,
    searchMedicationsOfHospital,
};
