const express = require("express");
const router = express.Router();
const {
  receiveStock,
  getBatches,
  getMovements,
  getExpiryBuckets,
  writeOffBatch,
  adjustStock,
} = require("../controllers/stockController");
const { authenticateToken } = require("../middleware/authenticationToken");

router.use(authenticateToken);

router.post("/:hospitalId/receive", receiveStock);
router.get("/:hospitalId/batches", getBatches);
router.get("/:hospitalId/movements", getMovements);
router.get("/:hospitalId/expiry", getExpiryBuckets);
router.post("/:hospitalId/batches/:batchId/write-off", writeOffBatch);
router.post("/:hospitalId/adjust", adjustStock);

module.exports = router;
