const express = require("express");
const router = express.Router();
const {
    checkBasket,
    dispensingChat,
    getInteractionLogs,
} = require("../controllers/aiDispensingController");
const { authenticateToken } = require("../middleware/authenticationToken");

router.use(authenticateToken);

// Full basket analysis — called when a drug is added/removed
router.post("/check-basket", checkBasket);

// Sidebar clinical chat
router.post("/chat", dispensingChat);

// Review silently-logged interactions (audit trail)
router.get("/interaction-logs/:hospitalId", getInteractionLogs);

module.exports = router;