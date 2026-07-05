const express = require("express");
const router = express.Router();
const {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} = require("../controllers/supplierController");
const { authenticateToken } = require("../middleware/authenticationToken");

router.use(authenticateToken);

router.get("/:hospitalId", getSuppliers);
router.get("/:hospitalId/:id", getSupplier);
router.post("/:hospitalId", createSupplier);
router.put("/:hospitalId/:id", updateSupplier);
router.delete("/:hospitalId/:id", deleteSupplier);

module.exports = router;
