const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Batch = require("../model/batch");
const StockMovement = require("../model/stockMovement");
const Medication = require("../model/medication");
const stockService = require("../services/stockService");

// @desc  Receive stock into a new batch for a medication
// @route POST /api/stock/:hospitalId/receive
// body: { medicationId, supplierId, batchNumber, quantity, costPrice, expiryDate, notes, performedBy }
const receiveStock = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { medicationId, supplierId, batchNumber, quantity, costPrice, expiryDate, notes, performedBy } = req.body;

  if (!mongoose.Types.ObjectId.isValid(medicationId || "")) {
    return res.status(400).json({ message: "Invalid Medication ID format" });
  }

  try {
    const result = await stockService.receiveStock({
      medicationId,
      hospitalId,
      supplierId,
      batchNumber,
      quantity,
      costPrice,
      expiryDate,
      notes,
      performedBy,
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

// @desc  All batches of a hospital (optionally ?medicationId= & ?status=)
// @route GET /api/stock/:hospitalId/batches
const getBatches = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { medicationId, status } = req.query;

  const query = { hospital: hospitalId };
  if (medicationId) query.medication = medicationId;
  if (status) query.status = status;

  const batches = await Batch.find(query)
    .sort({ expiryDate: 1 })
    .populate("medication", "nameOfDrugs dosage dosageForm")
    .populate("supplier", "name");

  return res.status(200).json(batches);
});

// @desc  Stock movement ledger (filters: medicationId, type, from, to; paginated)
// @route GET /api/stock/:hospitalId/movements
const getMovements = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { medicationId, type, from, to, page = 1, limit = 50 } = req.query;

  const query = { hospital: hospitalId };
  if (medicationId) query.medication = medicationId;
  if (type) query.type = type;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate("medication", "nameOfDrugs dosage dosageForm")
      .populate("batch", "batchNumber expiryDate"),
    StockMovement.countDocuments(query),
  ]);

  return res.status(200).json({
    movements,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
  });
});

// @desc  Expiry overview: expired + expiring within 30/60/90 days
// @route GET /api/stock/:hospitalId/expiry
const getExpiryBuckets = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const batches = await Batch.find({
    hospital: hospitalId,
    quantityRemaining: { $gt: 0 },
    status: { $in: ["active", "expired"] },
    expiryDate: { $lte: in90 },
  })
    .sort({ expiryDate: 1 })
    .populate("medication", "nameOfDrugs dosage dosageForm price")
    .populate("supplier", "name");

  const buckets = { expired: [], within30: [], within60: [], within90: [] };
  for (const b of batches) {
    if (b.expiryDate <= now) buckets.expired.push(b);
    else if (b.expiryDate <= in30) buckets.within30.push(b);
    else if (b.expiryDate <= in60) buckets.within60.push(b);
    else buckets.within90.push(b);
  }

  // Legacy items: medications with stock, an expiry date in range, and no batches at all
  const medIdsWithBatches = await Batch.distinct("medication", { hospital: hospitalId });
  const legacyMeds = await Medication.find({
    hospital: hospitalId,
    _id: { $nin: medIdsWithBatches },
    quantityInStock: { $gt: 0 },
    expiryDate: { $lte: in90 },
  }).select("nameOfDrugs dosage dosageForm quantityInStock expiryDate price");

  const legacy = { expired: [], within30: [], within60: [], within90: [] };
  for (const m of legacyMeds) {
    if (m.expiryDate <= now) legacy.expired.push(m);
    else if (m.expiryDate <= in30) legacy.within30.push(m);
    else if (m.expiryDate <= in60) legacy.within60.push(m);
    else legacy.within90.push(m);
  }

  return res.status(200).json({ batches: buckets, legacyMedications: legacy });
});

// @desc  Write off a batch (expired / damaged)
// @route POST /api/stock/:hospitalId/batches/:batchId/write-off
// body: { reason, type: "expired" | "damaged", performedBy }
const writeOffBatch = asyncHandler(async (req, res) => {
  const { hospitalId, batchId } = req.params;
  const { reason, type, performedBy } = req.body;

  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    return res.status(400).json({ message: "Invalid Batch ID format" });
  }

  try {
    const result = await stockService.writeOffBatch({
      batchId,
      hospitalId,
      reason,
      type: type || "expired",
      performedBy,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

// @desc  Manual stock adjustment with mandatory reason
// @route POST /api/stock/:hospitalId/adjust
// body: { medicationId, batchId (optional), quantityChange, type, reason, performedBy }
const adjustStock = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { medicationId, batchId, quantityChange, type, reason, performedBy } = req.body;

  if (!mongoose.Types.ObjectId.isValid(medicationId || "")) {
    return res.status(400).json({ message: "Invalid Medication ID format" });
  }

  try {
    const result = await stockService.adjustStock({
      medicationId,
      hospitalId,
      batchId,
      quantityChange,
      type,
      reason,
      performedBy,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

module.exports = {
  receiveStock,
  getBatches,
  getMovements,
  getExpiryBuckets,
  writeOffBatch,
  adjustStock,
};
