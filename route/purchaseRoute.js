const express = require("express");
const router = express.Router();
const {
    purchaseMedication,
    getAllPurchasesFromHospital,
    getUserPurchasesFromHospital,
    getPurchaseById,
} = require("../controllers/purchaseController");
const { authenticateToken } = require("../middleware/authenticationToken");

// Purchases create financial + medical records — must be authenticated.
router.use(authenticateToken);

router.post("/", purchaseMedication);
router.get("/hospital/:hospitalId", getAllPurchasesFromHospital);
router.get("/hospital/:hospitalId/user/:userId", getUserPurchasesFromHospital);
router.get("/:purchaseId", getPurchaseById);

module.exports = router;
