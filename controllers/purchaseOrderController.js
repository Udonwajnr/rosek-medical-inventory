const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const PurchaseOrder = require("../model/purchaseOrder");
const Medication = require("../model/medication");
const Supplier = require("../model/supplier");
const stockService = require("../services/stockService");

// Generate the next order number for a hospital, e.g. PO-2026-0007
async function nextOrderNumber(hospitalId) {
  const year = new Date().getFullYear();
  const count = await PurchaseOrder.countDocuments({ hospital: hospitalId });
  return `PO-${year}-${String(count + 1).padStart(4, "0")}`;
}

// @desc  Medications at or below their reorder level (source for a new PO)
// @route GET /api/purchase-order/:hospitalId/low-stock
const getLowStockItems = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;

  const medications = await Medication.find({ hospital: hospitalId }).select(
    "nameOfDrugs dosage dosageForm quantityInStock reorderLevel price barcode"
  );

  const lowStock = medications.filter(
    (m) => (m.quantityInStock || 0) <= (m.reorderLevel || 10)
  );

  return res.status(200).json(lowStock);
});

// @desc  List purchase orders (?status=)
// @route GET /api/purchase-order/:hospitalId
const getPurchaseOrders = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { status } = req.query;

  const query = { hospital: hospitalId };
  if (status) query.status = status;

  const orders = await PurchaseOrder.find(query)
    .sort({ createdAt: -1 })
    .populate("supplier", "name contactPerson phone")
    .populate("items.medication", "nameOfDrugs dosage dosageForm");

  return res.status(200).json(orders);
});

// @desc  Get one purchase order
// @route GET /api/purchase-order/:hospitalId/:id
const getPurchaseOrder = asyncHandler(async (req, res) => {
  const { hospitalId, id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Purchase Order ID format" });
  }

  const order = await PurchaseOrder.findOne({ _id: id, hospital: hospitalId })
    .populate("supplier", "name contactPerson phone email address")
    .populate("items.medication", "nameOfDrugs dosage dosageForm quantityInStock reorderLevel")
    .populate("items.batch", "batchNumber expiryDate quantityRemaining");

  if (!order) {
    return res.status(404).json({ message: "Purchase order not found" });
  }

  return res.status(200).json(order);
});

// @desc  Create a purchase order
// @route POST /api/purchase-order/:hospitalId
// body: { supplierId, items: [{ medication, quantityOrdered, costPrice }], notes, expectedDate, status }
const createPurchaseOrder = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { supplierId, items, notes, expectedDate, status, createdBy } = req.body;

  if (!mongoose.Types.ObjectId.isValid(supplierId || "")) {
    return res.status(400).json({ message: "A valid supplier is required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required" });
  }

  const supplier = await Supplier.findOne({ _id: supplierId, hospital: hospitalId });
  if (!supplier) {
    return res.status(404).json({ message: "Supplier not found in this hospital" });
  }

  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.medication || "")) {
      return res.status(400).json({ message: "Every item needs a valid medication" });
    }
    if (!item.quantityOrdered || item.quantityOrdered < 1) {
      return res.status(400).json({ message: "Every item needs a quantity of at least 1" });
    }
    const med = await Medication.findOne({ _id: item.medication, hospital: hospitalId });
    if (!med) {
      return res.status(404).json({ message: `Medication ${item.medication} not found in this hospital` });
    }
  }

  const order = await PurchaseOrder.create({
    orderNumber: await nextOrderNumber(hospitalId),
    hospital: hospitalId,
    supplier: supplierId,
    items: items.map((i) => ({
      medication: i.medication,
      quantityOrdered: i.quantityOrdered,
      costPrice: i.costPrice || 0,
    })),
    status: status === "ordered" ? "ordered" : "draft",
    notes,
    expectedDate,
    createdBy,
  });

  const populated = await PurchaseOrder.findById(order._id)
    .populate("supplier", "name")
    .populate("items.medication", "nameOfDrugs dosage dosageForm");

  return res.status(201).json(populated);
});

// @desc  Update a purchase order (draft/ordered only)
// @route PUT /api/purchase-order/:hospitalId/:id
const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const { hospitalId, id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Purchase Order ID format" });
  }

  const order = await PurchaseOrder.findOne({ _id: id, hospital: hospitalId });
  if (!order) {
    return res.status(404).json({ message: "Purchase order not found" });
  }
  if (["received", "cancelled"].includes(order.status)) {
    return res.status(400).json({ message: `A ${order.status} order can no longer be edited` });
  }

  const { supplierId, items, notes, expectedDate, status } = req.body;

  if (supplierId) {
    const supplier = await Supplier.findOne({ _id: supplierId, hospital: hospitalId });
    if (!supplier) return res.status(404).json({ message: "Supplier not found in this hospital" });
    order.supplier = supplierId;
  }
  if (Array.isArray(items) && items.length > 0) {
    order.items = items.map((i) => ({
      medication: i.medication,
      quantityOrdered: i.quantityOrdered,
      costPrice: i.costPrice || 0,
    }));
  }
  if (notes !== undefined) order.notes = notes;
  if (expectedDate !== undefined) order.expectedDate = expectedDate;
  if (status && ["draft", "ordered", "cancelled"].includes(status)) order.status = status;

  await order.save();

  const populated = await PurchaseOrder.findById(order._id)
    .populate("supplier", "name")
    .populate("items.medication", "nameOfDrugs dosage dosageForm");

  return res.status(200).json(populated);
});

// @desc  Receive a purchase order: creates a batch per item and increments stock
// @route POST /api/purchase-order/:hospitalId/:id/receive
// body: { items: [{ itemId, quantityReceived, batchNumber, expiryDate, costPrice }], performedBy }
const receivePurchaseOrder = asyncHandler(async (req, res) => {
  const { hospitalId, id } = req.params;
  const { items, performedBy } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Purchase Order ID format" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Receiving details for at least one item are required" });
  }

  const order = await PurchaseOrder.findOne({ _id: id, hospital: hospitalId });
  if (!order) {
    return res.status(404).json({ message: "Purchase order not found" });
  }
  if (order.status === "received") {
    return res.status(400).json({ message: "This order has already been received" });
  }
  if (order.status === "cancelled") {
    return res.status(400).json({ message: "A cancelled order cannot be received" });
  }

  // Validate everything before touching stock
  for (const r of items) {
    const orderItem = order.items.id(r.itemId);
    if (!orderItem) {
      return res.status(400).json({ message: `Order item ${r.itemId} not found on this order` });
    }
    if (!r.quantityReceived || r.quantityReceived < 1) {
      return res.status(400).json({ message: "Each received item needs a quantity of at least 1" });
    }
    if (!r.batchNumber || !r.expiryDate) {
      return res.status(400).json({ message: "Each received item needs a batch number and expiry date" });
    }
  }

  const results = [];
  for (const r of items) {
    const orderItem = order.items.id(r.itemId);
    const { batch } = await stockService.receiveStock({
      medicationId: orderItem.medication,
      hospitalId,
      supplierId: order.supplier,
      batchNumber: r.batchNumber,
      quantity: r.quantityReceived,
      costPrice: r.costPrice !== undefined ? r.costPrice : orderItem.costPrice,
      expiryDate: r.expiryDate,
      notes: `Received via ${order.orderNumber}`,
      performedBy,
      reference: { kind: "PurchaseOrder", id: order._id },
    });

    orderItem.quantityReceived = r.quantityReceived;
    orderItem.batch = batch._id;
    results.push({ itemId: r.itemId, batchId: batch._id });
  }

  order.status = "received";
  order.receivedAt = new Date();
  await order.save();

  return res.status(200).json({ order, received: results });
});

// @desc  Delete a purchase order (drafts only)
// @route DELETE /api/purchase-order/:hospitalId/:id
const deletePurchaseOrder = asyncHandler(async (req, res) => {
  const { hospitalId, id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Purchase Order ID format" });
  }

  const order = await PurchaseOrder.findOne({ _id: id, hospital: hospitalId });
  if (!order) {
    return res.status(404).json({ message: "Purchase order not found" });
  }
  if (order.status !== "draft" && order.status !== "cancelled") {
    return res.status(400).json({ message: "Only draft or cancelled orders can be deleted" });
  }

  await PurchaseOrder.findByIdAndDelete(id);
  return res.status(200).json({ msg: `Purchase order ${order.orderNumber} has been deleted` });
});

module.exports = {
  getLowStockItems,
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  deletePurchaseOrder,
};
