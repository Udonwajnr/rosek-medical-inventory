const asyncHandler = require("express-async-handler");
const User = require("../model/user");
const Medication = require("../model/medication");
const Hospital = require("../model/hospital");
const Purchase = require("../model/purchase");
const sendEmailWithICS = require("../middleware/calenderEmail");
const generateICSFile = require("../middleware/generateICSFile");
const stockService = require("../services/stockService");

// @desc  Record a medication purchase for a user
// @route POST /api/purchase
const purchaseMedication = asyncHandler(async (req, res) => {
  const { userId, medications, hospitalId } = req.body;

  if (
    !userId ||
    !hospitalId ||
    !Array.isArray(medications) ||
    medications.length === 0
  ) {
    return res
      .status(400)
      .json({
        message: "userId, hospitalId and at least one medication are required.",
      });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // 1. Validate stock and compute the real total from medication prices
  let totalPurchase = 0;
  const medicationDocs = [];

  for (const item of medications) {
    const medDoc = await Medication.findById(item.medication);
    if (!medDoc) {
      return res
        .status(404)
        .json({ message: `Medication ${item.medication} not found.` });
    }

    const quantity = item.quantity || 1;
    if (medDoc.quantityInStock < quantity) {
      return res.status(400).json({
        message: `Insufficient stock for ${medDoc.nameOfDrugs}. In stock: ${medDoc.quantityInStock}, requested: ${quantity}.`,
      });
    }

    totalPurchase += (medDoc.price || 0) * quantity;
    medicationDocs.push({ medDoc, quantity });
  }

  // 2. Create the purchase with the computed total
  const purchase = new Purchase({
    user: userId,
    medications,
    hospital: hospitalId,
    totalPurchase,
  });
  await purchase.save();

  // 3. Decrement stock FEFO through the stock service (writes the ledger)
  for (const { medDoc, quantity } of medicationDocs) {
    await stockService.dispenseStock({
      medicationId: medDoc._id,
      hospitalId,
      quantity,
      reason: `Purchase for ${user.fullName}`,
      performedBy: req.body.performedBy,
      reference: { kind: "Purchase", id: purchase._id },
    });
  }

  // 4. Link the purchase to the user and hospital records
  user.purchases.push(purchase._id);
  await user.save();

  await Hospital.findByIdAndUpdate(hospitalId, {
    $push: { purchaseHistory: purchase._id },
  });

  // 5. Send calendar email if the user has an email, and record the outcome
  if (user.email) {
    try {
      const icsFilePath = await generateICSFile(purchase._id);
      if (icsFilePath) {
        await sendEmailWithICS(user.email, icsFilePath, medications);
        purchase.icsEmail = { status: "sent", sentAt: new Date() };
      } else {
        purchase.icsEmail = {
          status: "failed",
          error: "Could not generate calendar file",
        };
      }
    } catch (err) {
      console.error("Failed to send calendar email:", err.message);
      purchase.icsEmail = { status: "failed", error: err.message };
    }
    await purchase.save();
  }

  res.status(201).json(purchase);
});

// @desc  Get all purchases for a hospital
// @route GET /api/purchase/hospital/:hospitalId
const getAllPurchasesFromHospital = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;

  const purchases = await Purchase.find({ hospital: hospitalId })
    .populate("user", "fullName email")
    .populate("medications.medication", "nameOfDrugs dosage price")
    .populate("hospital", "name")
    .sort({ createdAt: -1 });

  res.status(200).json({ purchases });
});

// @desc  Get purchases for a user at a hospital
// @route GET /api/purchase/hospital/:hospitalId/user/:userId
const getUserPurchasesFromHospital = asyncHandler(async (req, res) => {
  const { userId, hospitalId } = req.params;

  const purchases = await Purchase.find({ user: userId, hospital: hospitalId })
    .populate("medications.medication", "nameOfDrugs dosage price")
    .populate("hospital", "name")
    .sort({ createdAt: -1 });

  res.status(200).json({ purchases });
});

// @desc  Get a single purchase
// @route GET /api/purchase/:purchaseId
const getPurchaseById = asyncHandler(async (req, res) => {
  const { purchaseId } = req.params;

  const purchase = await Purchase.findById(purchaseId)
    .populate("user", "fullName email")
    .populate("medications.medication", "nameOfDrugs dosage price")
    .populate("hospital", "name");

  if (!purchase) {
    return res.status(404).json({ message: "Purchase not found." });
  }

  res.status(200).json({ purchase });
});

module.exports = {
  purchaseMedication,
  getAllPurchasesFromHospital,
  getUserPurchasesFromHospital,
  getPurchaseById,
};
