const Medication = require("../model/medication");
const Batch = require("../model/batch");
const StockMovement = require("../model/stockMovement");

/**
 * Central stock service.
 *
 * Every change to stock in the entire application goes through this file, so:
 *  - Medication.quantityInStock stays correct (it is a cached sum of batches
 *    plus any legacy stock that predates batch tracking)
 *  - The StockMovement ledger never misses an entry
 *  - Dispensing always follows FEFO (First Expiry, First Out)
 */

async function writeMovement({ hospital, medication, batch, type, quantityChange, balanceAfter, reason, performedBy, reference }) {
  return StockMovement.create({
    hospital,
    medication,
    batch,
    type,
    quantityChange,
    balanceAfter,
    reason,
    performedBy: performedBy || "system",
    reference,
  });
}

/**
 * Receive stock into a new batch.
 * Creates the Batch, increments the medication's cached quantity,
 * and writes a "received" ledger entry.
 */
async function receiveStock({
  medicationId,
  hospitalId,
  supplierId,
  batchNumber,
  quantity,
  costPrice = 0,
  expiryDate,
  notes,
  performedBy,
  reference,
}) {
  const qty = Number(quantity);
  if (!qty || qty < 1) throw new Error("Quantity must be at least 1");
  if (!batchNumber) throw new Error("Batch number is required");
  if (!expiryDate) throw new Error("Expiry date is required");

  const medication = await Medication.findOne({ _id: medicationId, hospital: hospitalId });
  if (!medication) throw new Error("Medication not found in this hospital");

  const batch = await Batch.create({
    medication: medication._id,
    hospital: hospitalId,
    supplier: supplierId || undefined,
    batchNumber,
    quantityReceived: qty,
    quantityRemaining: qty,
    costPrice: Number(costPrice) || 0,
    expiryDate,
    notes,
  });

  medication.quantityInStock = (medication.quantityInStock || 0) + qty;
  // Keep the legacy single expiryDate useful: track the earliest active expiry
  if (!medication.expiryDate || new Date(expiryDate) < new Date(medication.expiryDate)) {
    medication.expiryDate = expiryDate;
  }
  await medication.save();

  await writeMovement({
    hospital: hospitalId,
    medication: medication._id,
    batch: batch._id,
    type: "received",
    quantityChange: qty,
    balanceAfter: medication.quantityInStock,
    reason: notes || `Received batch ${batchNumber}`,
    performedBy,
    reference,
  });

  return { batch, medication };
}

/**
 * Dispense stock FEFO (earliest expiry first).
 * Falls back to legacy stock (quantity not held in any batch) when
 * batches don't cover the requested amount — so medications created
 * before batch tracking keep working.
 *
 * Writes one "dispensed" ledger entry per batch touched.
 * Throws if total available stock is insufficient.
 */
async function dispenseStock({ medicationId, hospitalId, quantity, reason, performedBy, reference }) {
  const qty = Number(quantity);
  if (!qty || qty < 1) throw new Error("Quantity must be at least 1");

  const medication = await Medication.findOne({ _id: medicationId, hospital: hospitalId });
  if (!medication) throw new Error("Medication not found in this hospital");

  if ((medication.quantityInStock || 0) < qty) {
    throw new Error(
      `Not enough stock for ${medication.nameOfDrugs}. In stock: ${medication.quantityInStock}, requested: ${qty}.`
    );
  }

  let remainingToDispense = qty;
  const touchedBatches = [];

  const batches = await Batch.findDispensable(medicationId, hospitalId);
  for (const batch of batches) {
    if (remainingToDispense <= 0) break;
    const take = Math.min(batch.quantityRemaining, remainingToDispense);
    batch.quantityRemaining -= take;
    await batch.save();
    remainingToDispense -= take;
    touchedBatches.push({ batch, take });
  }

  // Anything not covered by batches comes out of legacy (pre-batch) stock.
  const legacyTake = remainingToDispense;

  medication.quantityInStock -= qty;
  await medication.save();

  let runningBalance = medication.quantityInStock + qty;
  for (const { batch, take } of touchedBatches) {
    runningBalance -= take;
    await writeMovement({
      hospital: hospitalId,
      medication: medication._id,
      batch: batch._id,
      type: "dispensed",
      quantityChange: -take,
      balanceAfter: runningBalance,
      reason: reason || `Dispensed from batch ${batch.batchNumber}`,
      performedBy,
      reference,
    });
  }
  if (legacyTake > 0) {
    runningBalance -= legacyTake;
    await writeMovement({
      hospital: hospitalId,
      medication: medication._id,
      type: "dispensed",
      quantityChange: -legacyTake,
      balanceAfter: runningBalance,
      reason: reason || "Dispensed from unbatched stock",
      performedBy,
      reference,
    });
  }

  return { medication, batchesUsed: touchedBatches.map(({ batch, take }) => ({ batchId: batch._id, batchNumber: batch.batchNumber, quantity: take })) };
}

/**
 * Manual stock adjustment (count correction, damage, theft...).
 * quantityChange is signed: +5 adds stock, -5 removes it.
 * A reason is mandatory — this is the audit trail.
 */
async function adjustStock({ medicationId, hospitalId, batchId, quantityChange, type = "adjusted", reason, performedBy }) {
  const change = Number(quantityChange);
  if (!change) throw new Error("quantityChange must be a non-zero number");
  if (!reason || !reason.trim()) throw new Error("A reason is required for stock adjustments");
  if (!["adjusted", "damaged", "returned"].includes(type)) {
    throw new Error("Adjustment type must be adjusted, damaged, or returned");
  }

  const medication = await Medication.findOne({ _id: medicationId, hospital: hospitalId });
  if (!medication) throw new Error("Medication not found in this hospital");

  if (change < 0 && (medication.quantityInStock || 0) + change < 0) {
    throw new Error("Adjustment would make stock negative");
  }

  let batch = null;
  if (batchId) {
    batch = await Batch.findOne({ _id: batchId, medication: medicationId, hospital: hospitalId });
    if (!batch) throw new Error("Batch not found for this medication");
    if (change < 0 && batch.quantityRemaining + change < 0) {
      throw new Error("Adjustment would make batch quantity negative");
    }
    batch.quantityRemaining += change;
    if (change > 0) batch.quantityReceived += change;
    await batch.save();
  }

  medication.quantityInStock += change;
  await medication.save();

  await writeMovement({
    hospital: hospitalId,
    medication: medication._id,
    batch: batch ? batch._id : undefined,
    type,
    quantityChange: change,
    balanceAfter: medication.quantityInStock,
    reason,
    performedBy,
  });

  return { medication, batch };
}

/**
 * Write off a batch (expired or otherwise unusable).
 * Removes the batch's remaining quantity from stock and records
 * an "expired" (or "damaged") ledger entry.
 */
async function writeOffBatch({ batchId, hospitalId, reason, type = "expired", performedBy }) {
  if (!["expired", "damaged"].includes(type)) {
    throw new Error("Write-off type must be expired or damaged");
  }

  const batch = await Batch.findOne({ _id: batchId, hospital: hospitalId });
  if (!batch) throw new Error("Batch not found");
  if (batch.status === "written_off") throw new Error("Batch has already been written off");

  const qty = batch.quantityRemaining;

  const medication = await Medication.findOne({ _id: batch.medication, hospital: hospitalId });
  if (!medication) throw new Error("Medication for this batch not found");

  batch.quantityRemaining = 0;
  batch.status = "written_off";
  await batch.save();

  if (qty > 0) {
    medication.quantityInStock = Math.max(0, (medication.quantityInStock || 0) - qty);
    await medication.save();

    await writeMovement({
      hospital: hospitalId,
      medication: medication._id,
      batch: batch._id,
      type,
      quantityChange: -qty,
      balanceAfter: medication.quantityInStock,
      reason: reason || `Batch ${batch.batchNumber} written off (${type})`,
      performedBy,
    });
  }

  return { batch, medication };
}

module.exports = { receiveStock, dispenseStock, adjustStock, writeOffBatch };
