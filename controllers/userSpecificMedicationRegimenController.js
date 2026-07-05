const asyncHandler = require("express-async-handler");
const UserSpecificMedicationRegimen = require("../model/userSpecificMedicationRegimen");
const User = require("../model/user");
const Medication = require("../model/medication");
const Hospital = require("../model/hospital");

// Get all medication regimens for a specific hospital
const getAllRegimensForHospital = asyncHandler(async (req, res) => {
    const hospitalId = req.params.hospitalId;
    // Validate hospital ID
    const hospitalExists = await Hospital.findById(hospitalId);
    if (!hospitalExists) {
        return res.status(404).json({ message: "Hospital not found" });
    }
    // Find all regimens for the specific hospital
    const regimens = await UserSpecificMedicationRegimen.find({ hospital: hospitalId })
        .populate("user")
        .populate("medication")
        .populate("hospital");
    return res.status(200).json(regimens);
});

// Create a new user-specific medication regimen
const createRegimen = asyncHandler(async (req, res) => {
    const { user, medication, hospital, customDosage, customFrequency, duration, startDate, notes } = req.body;

    // hospital,medication and user are foreign keys
    // Validate references
    const userExists = await User.findById(user);
    const medicationExists = await Medication.findById(medication);
    const hospitalExists = await Hospital.findById(hospital);

    if (!userExists || !medicationExists || !hospitalExists) {
        return res.status(400).json({ message: "Invalid references provided" });
    }

    // Create and save new regimen
    const newRegimen = new UserSpecificMedicationRegimen({
        user,
        medication,
        hospital,
        customDosage,
        customFrequency,
        duration,
        startDate,
        notes
    });

    const savedRegimen = await newRegimen.save();

    // Update references in User, Medication, and Hospital
    await User.findByIdAndUpdate(user, { $push: { userSpecificMedicationRegimen: savedRegimen._id } });
    await Medication.findByIdAndUpdate(medication, { $push: { userSpecificMedicationRegimen: savedRegimen._id } });
    await Hospital.findByIdAndUpdate(hospital, { $push: { userSpecificMedicationRegimen: savedRegimen._id } });

    res.status(201).json(savedRegimen);
});

// Update an existing user-specific medication regimen
const updateRegimen = asyncHandler(async (req, res) => {
    const { regimenId } = req.params;
    const updateData = req.body;

    // Validate references if included in update
    if (updateData.user) {
        const userExists = await User.findById(updateData.user);
        if (!userExists) {
            return res.status(400).json({ message: "Invalid user reference provided" });
        }
    }

    if (updateData.medication) {
        const medicationExists = await Medication.findById(updateData.medication);
        if (!medicationExists) {
            return res.status(400).json({ message: "Invalid medication reference provided" });
        }
    }

    if (updateData.hospital) {
        const hospitalExists = await Hospital.findById(updateData.hospital);
        if (!hospitalExists) {
            return res.status(400).json({ message: "Invalid hospital reference provided" });
        }
    }

    // Find and update regimen
    const updatedRegimen = await UserSpecificMedicationRegimen.findByIdAndUpdate(
        regimenId,
        { $set: updateData },
        { new: true }
    );

    if (!updatedRegimen) {
        return res.status(404).json({ message: "Regimen not found" });
    }

    // If references are updated, ensure they are reflected in User, Medication, and Hospital
    if (updateData.user || updateData.medication || updateData.hospital) {
        // Remove the regimen ID from previous references
        const oldRegimen = await UserSpecificMedicationRegimen.findById(regimenId);
        if (oldRegimen) {
            await User.findByIdAndUpdate(oldRegimen.user, { $pull: { regimens: regimenId } });
            await Medication.findByIdAndUpdate(oldRegimen.medication, { $pull: { regimens: regimenId } });
            await Hospital.findByIdAndUpdate(oldRegimen.hospital, { $pull: { regimens: regimenId } });
        }

        // Add the regimen ID to new references
        if (updateData.user) {
            await User.findByIdAndUpdate(updateData.user, { $push: { regimens: regimenId } });
        }
        if (updateData.medication) {
            await Medication.findByIdAndUpdate(updateData.medication, { $push: { regimens: regimenId } });
        }
        if (updateData.hospital) {
            await Hospital.findByIdAndUpdate(updateData.hospital, { $push: { regimens: regimenId } });
        }
    }

    res.status(200).json(updatedRegimen);
});

// Delete a user-specific medication regimen
const deleteRegimen = asyncHandler(async (req, res) => {
    const { regimenId } = req.params;

    // Find and delete regimen
    const deletedRegimen = await UserSpecificMedicationRegimen.findByIdAndDelete(regimenId);

    if (!deletedRegimen) {
        return res.status(404).json({ message: "Regimen not found" });
    }

    // Remove the regimen ID from User, Medication, and Hospital references
    await User.findByIdAndUpdate(deletedRegimen.user, { $pull: { regimens: regimenId } });
    await Medication.findByIdAndUpdate(deletedRegimen.medication, { $pull: { regimens: regimenId } });
    await Hospital.findByIdAndUpdate(deletedRegimen.hospital, { $pull: { regimens: regimenId } });

    res.status(200).json({ message: "Regimen deleted successfully" });
});

module.exports = {
    getAllRegimensForHospital,
    createRegimen,
    updateRegimen,
    deleteRegimen
};
