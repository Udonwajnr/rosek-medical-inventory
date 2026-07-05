const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Supplier = require("../model/supplier");
const Batch = require("../model/batch");
const PurchaseOrder = require("../model/purchaseOrder");

// @desc  Get all suppliers of a hospital (optional ?search= & ?active=true)
// @route GET /api/supplier/:hospitalId
const getSuppliers = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { search, active } = req.query;

  const query = { hospital: hospitalId };
  if (active === "true") query.isActive = true;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { contactPerson: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const suppliers = await Supplier.find(query).sort({ name: 1 });
  return res.status(200).json(suppliers);
});

// @desc  Get one supplier, with a small activity summary
// @route GET /api/supplier/:hospitalId/:id
const getSupplier = asyncHandler(async (req, res) => {
  const { hospitalId, id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Supplier ID format" });
  }

  const supplier = await Supplier.findOne({ _id: id, hospital: hospitalId });
  if (!supplier) {
    return res.status(404).json({ message: "Supplier not found" });
  }

  const [batchCount, orderCount, recentBatches] = await Promise.all([
    Batch.countDocuments({ supplier: id, hospital: hospitalId }),
    PurchaseOrder.countDocuments({ supplier: id, hospital: hospitalId }),
    Batch.find({ supplier: id, hospital: hospitalId })
      .sort({ receivedDate: -1 })
      .limit(10)
      .populate("medication", "nameOfDrugs dosage dosageForm"),
  ]);

  return res.status(200).json({ supplier, batchCount, orderCount, recentBatches });
});

// @desc  Create a supplier
// @route POST /api/supplier/:hospitalId
const createSupplier = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { name, contactPerson, phone, email, address, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Supplier name is required" });
  }

  const existing = await Supplier.findOne({ hospital: hospitalId, name: name.trim() });
  if (existing) {
    return res.status(400).json({ message: "A supplier with this name already exists" });
  }

  const supplier = await Supplier.create({
    name: name.trim(),
    contactPerson,
    phone,
    email,
    address,
    notes,
    hospital: hospitalId,
  });

  return res.status(201).json(supplier);
});

// @desc  Update a supplier
// @route PUT /api/supplier/:hospitalId/:id
const updateSupplier = asyncHandler(async (req, res) => {
  const { hospitalId, id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Supplier ID format" });
  }

  const supplier = await Supplier.findOne({ _id: id, hospital: hospitalId });
  if (!supplier) {
    return res.status(404).json({ message: "Supplier not found" });
  }

  const allowed = ["name", "contactPerson", "phone", "email", "address", "notes", "isActive"];
  for (const field of allowed) {
    if (req.body[field] !== undefined) supplier[field] = req.body[field];
  }
  await supplier.save();

  return res.status(200).json(supplier);
});

// @desc  Delete a supplier (blocked if it has batches or orders — deactivate instead)
// @route DELETE /api/supplier/:hospitalId/:id
const deleteSupplier = asyncHandler(async (req, res) => {
  const { hospitalId, id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Supplier ID format" });
  }

  const supplier = await Supplier.findOne({ _id: id, hospital: hospitalId });
  if (!supplier) {
    return res.status(404).json({ message: "Supplier not found" });
  }

  const [batchCount, orderCount] = await Promise.all([
    Batch.countDocuments({ supplier: id, hospital: hospitalId }),
    PurchaseOrder.countDocuments({ supplier: id, hospital: hospitalId }),
  ]);

  if (batchCount > 0 || orderCount > 0) {
    return res.status(400).json({
      message:
        "This supplier has stock or purchase-order history and cannot be deleted. Deactivate it instead.",
    });
  }

  await Supplier.findByIdAndDelete(id);
  return res.status(200).json({ msg: `Supplier ${supplier.name} has been deleted` });
});

module.exports = {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
