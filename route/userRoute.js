const express = require("express");
const router = express.Router();
const {
    getUsersByHospital,
    getUserInHospital,
    createUserInHospital,
    updateUserInHospital,
    deleteUserInHospital,
    addMedicationToUserInHospital,
    removeMedicationFromUserInHospital,
    getUsersWithMedicationInHospital,
    searchUsersInHospital,
} = require("../controllers/userController");
const { authenticateToken } = require("../middleware/authenticationToken");

// All patient data is hospital-scoped and sensitive — every route requires a valid token.
router.use(authenticateToken);

// Search users within a hospital (must come before the :userId route)
router.get("/hospital/:hospitalId/users/search", searchUsersInHospital);

// Get all users for a specific hospital
router.get("/hospital/:hospitalId/users", getUsersByHospital);

// Get a single user in a specific hospital
router.get("/hospital/:hospitalId/users/:userId", getUserInHospital);

// Create a new user in a hospital
router.post("/hospital/:hospitalId/users", createUserInHospital);

// Update a user in a hospital
router.put("/hospital/:hospitalId/users/:userId", updateUserInHospital);

// Delete a user from a hospital
router.delete("/hospital/:hospitalId/users/:userId", deleteUserInHospital);

// Add a medication to a user
router.post("/hospital/:hospitalId/users/:userId/medication/:medicationId", addMedicationToUserInHospital);

// Remove a medication from a user
router.delete("/hospital/:hospitalId/users/:userId/medication/:medicationId", removeMedicationFromUserInHospital);

// Get all users on a specific medication
router.get("/hospital/:hospitalId/medication/:medicationId/users", getUsersWithMedicationInHospital);

module.exports = router;
