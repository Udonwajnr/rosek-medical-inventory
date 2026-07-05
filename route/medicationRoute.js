const express = require("express");
const router = express.Router();
const {
    getAllMedicationsAcrossHospitals,
    getAllMedicationsOfHospital,
    getMedicationOfHospital,
    createMedicationForHospital,
    updateMedicationOfHospital,
    deleteMedicationOfHospital,
    getUserMedicationDataOfHospital,
    searchMedicationsOfHospital
} = require("../controllers/medicationController");
const { authenticateToken } = require("../middleware/authenticationToken");

// Route to get all medications across all hospitals (public route)
router.get("/all", getAllMedicationsAcrossHospitals);

// Route to search medications within a specific hospital (protected route)
router.get("/:hospitalId/search", authenticateToken, searchMedicationsOfHospital);

// Route to get all medications for a specific hospital (protected route)
router.get("/:hospitalId/medications", authenticateToken, getAllMedicationsOfHospital);

// Route to get a specific medication by ID within a specific hospital (protected route)
router.get("/:hospitalId/medications/:id", authenticateToken, getMedicationOfHospital);

// Route to get all medications for a specific user within a specific hospital (protected route)
router.get("/:hospitalId/user/:userId/medications", authenticateToken, getUserMedicationDataOfHospital);

// Route to create a new medication for a specific hospital (protected route)
router.post("/:hospitalId/medications", authenticateToken, createMedicationForHospital);

// Route to update a medication by ID within a specific hospital (protected route)
router.put("/:hospitalId/medications/:id", authenticateToken, updateMedicationOfHospital);

// Route to delete a medication by ID within a specific hospital (protected route)
router.delete("/:hospitalId/medications/:id", authenticateToken, deleteMedicationOfHospital);

module.exports = router;
