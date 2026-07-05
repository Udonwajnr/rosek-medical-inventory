const express = require("express");
const router = express.Router();
const {
  getLowStockItems,
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  deletePurchaseOrder,
} = require("../controllers/purchaseOrderController");
const { authenticateToken } = require("../middleware/authenticationToken");

router.use(authenticateToken);

router.get("/:hospitalId/low-stock", getLowStockItems);
router.get("/:hospitalId", getPurchaseOrders);
router.get("/:hospitalId/:id", getPurchaseOrder);
router.post("/:hospitalId", createPurchaseOrder);
router.put("/:hospitalId/:id", updatePurchaseOrder);
router.post("/:hospitalId/:id/receive", receivePurchaseOrder);
router.delete("/:hospitalId/:id", deletePurchaseOrder);

module.exports = router;
