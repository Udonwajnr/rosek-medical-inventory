const express = require("express");
const router = express.Router();
const {
  getStockValuation,
  getFastMoving,
  getDispenseHistory,
} = require("../controllers/reportController");
const { authenticateToken } = require("../middleware/authenticationToken");

router.use(authenticateToken);

router.get("/:hospitalId/valuation", getStockValuation);
router.get("/:hospitalId/fast-moving", getFastMoving);
router.get("/:hospitalId/dispense-history", getDispenseHistory);

module.exports = router;
