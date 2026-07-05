const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Medication = require("../model/medication");
const Batch = require("../model/batch");
const StockMovement = require("../model/stockMovement");

// Build a CSV string by hand — no extra packages needed.
function toCSV(headers, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n");
}

function sendCSV(res, filename, csv) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
}

// @desc  Stock valuation: quantity and value per medication, batch-aware
// @route GET /api/report/:hospitalId/valuation   (?format=csv to download)
const getStockValuation = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { format } = req.query;

  const medications = await Medication.find({ hospital: hospitalId }).select(
    "nameOfDrugs dosage dosageForm quantityInStock price reorderLevel"
  );

  // Cost value from batches (what the stock cost you)
  const batchCost = await Batch.aggregate([
    {
      $match: {
        hospital: new mongoose.Types.ObjectId(hospitalId),
        quantityRemaining: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: "$medication",
        costValue: { $sum: { $multiply: ["$quantityRemaining", "$costPrice"] } },
        batchedQuantity: { $sum: "$quantityRemaining" },
      },
    },
  ]);
  const costByMed = {};
  for (const b of batchCost) costByMed[b._id.toString()] = b;

  const rows = medications.map((m) => {
    const cost = costByMed[m._id.toString()];
    const quantity = m.quantityInStock || 0;
    return {
      medicationId: m._id,
      nameOfDrugs: m.nameOfDrugs,
      dosage: m.dosage,
      dosageForm: m.dosageForm,
      quantityInStock: quantity,
      sellingPrice: m.price || 0,
      retailValue: quantity * (m.price || 0),
      costValue: cost ? cost.costValue : 0,
      reorderLevel: m.reorderLevel || 10,
      lowStock: quantity <= (m.reorderLevel || 10),
    };
  });

  const totals = {
    totalItems: rows.length,
    totalUnits: rows.reduce((s, r) => s + r.quantityInStock, 0),
    totalRetailValue: rows.reduce((s, r) => s + r.retailValue, 0),
    totalCostValue: rows.reduce((s, r) => s + r.costValue, 0),
    lowStockCount: rows.filter((r) => r.lowStock).length,
  };

  if (format === "csv") {
    const csv = toCSV(
      ["Drug", "Dosage", "Form", "Quantity", "Selling Price", "Retail Value", "Cost Value", "Reorder Level", "Low Stock"],
      rows.map((r) => [
        r.nameOfDrugs,
        r.dosage,
        r.dosageForm,
        r.quantityInStock,
        r.sellingPrice,
        r.retailValue,
        r.costValue,
        r.reorderLevel,
        r.lowStock ? "YES" : "",
      ])
    );
    return sendCSV(res, "stock-valuation.csv", csv);
  }

  return res.status(200).json({ rows, totals });
});

// @desc  Fastest-moving drugs by units dispensed (?days=30, ?format=csv)
// @route GET /api/report/:hospitalId/fast-moving
const getFastMoving = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { days = 30, format } = req.query;

  const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

  const agg = await StockMovement.aggregate([
    {
      $match: {
        hospital: new mongoose.Types.ObjectId(hospitalId),
        type: "dispensed",
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: "$medication",
        unitsDispensed: { $sum: { $abs: "$quantityChange" } },
        movements: { $sum: 1 },
        lastDispensed: { $max: "$createdAt" },
      },
    },
    { $sort: { unitsDispensed: -1 } },
    { $limit: 50 },
  ]);

  const medIds = agg.map((a) => a._id);
  const meds = await Medication.find({ _id: { $in: medIds } }).select(
    "nameOfDrugs dosage dosageForm quantityInStock price"
  );
  const medById = {};
  for (const m of meds) medById[m._id.toString()] = m;

  const rows = agg.map((a) => {
    const m = medById[a._id.toString()];
    return {
      medicationId: a._id,
      nameOfDrugs: m ? m.nameOfDrugs : "(deleted)",
      dosage: m ? m.dosage : "",
      dosageForm: m ? m.dosageForm : "",
      unitsDispensed: a.unitsDispensed,
      dispenseEvents: a.movements,
      currentStock: m ? m.quantityInStock : 0,
      revenue: m ? a.unitsDispensed * (m.price || 0) : 0,
      lastDispensed: a.lastDispensed,
    };
  });

  if (format === "csv") {
    const csv = toCSV(
      ["Drug", "Dosage", "Form", "Units Dispensed", "Dispense Events", "Current Stock", "Revenue", "Last Dispensed"],
      rows.map((r) => [
        r.nameOfDrugs,
        r.dosage,
        r.dosageForm,
        r.unitsDispensed,
        r.dispenseEvents,
        r.currentStock,
        r.revenue,
        r.lastDispensed ? new Date(r.lastDispensed).toISOString().slice(0, 10) : "",
      ])
    );
    return sendCSV(res, `fast-moving-${days}d.csv`, csv);
  }

  return res.status(200).json({ days: Number(days), rows });
});

// @desc  Dispense history from the ledger (?medicationId=, ?from=, ?to=, ?format=csv)
// @route GET /api/report/:hospitalId/dispense-history
const getDispenseHistory = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { medicationId, from, to, format, page = 1, limit = 100 } = req.query;

  const query = { hospital: hospitalId, type: "dispensed" };
  if (medicationId) query.medication = medicationId;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .sort({ createdAt: -1 })
      .skip(format === "csv" ? 0 : (pageNum - 1) * limitNum)
      .limit(format === "csv" ? 5000 : limitNum)
      .populate("medication", "nameOfDrugs dosage dosageForm")
      .populate("batch", "batchNumber"),
    StockMovement.countDocuments(query),
  ]);

  if (format === "csv") {
    const csv = toCSV(
      ["Date", "Drug", "Dosage", "Quantity", "Batch", "Reason", "Performed By", "Balance After"],
      movements.map((m) => [
        new Date(m.createdAt).toISOString().replace("T", " ").slice(0, 16),
        m.medication ? m.medication.nameOfDrugs : "(deleted)",
        m.medication ? m.medication.dosage : "",
        Math.abs(m.quantityChange),
        m.batch ? m.batch.batchNumber : "",
        m.reason || "",
        m.performedBy || "",
        m.balanceAfter,
      ])
    );
    return sendCSV(res, "dispense-history.csv", csv);
  }

  return res.status(200).json({
    movements,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
  });
});

module.exports = {
  getStockValuation,
  getFastMoving,
  getDispenseHistory,
};
