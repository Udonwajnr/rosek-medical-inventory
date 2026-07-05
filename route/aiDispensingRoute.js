const express = require("express");
const router = express.Router();
const {
    checkInteraction,
    dispensingChat,
    getInteractionLogs,
} = require("../controllers/aiDispensingController");
const { authenticateToken } = require("../middleware/authenticationToken");

// AI endpoints cost money per call and expose patient context — always authenticated.
router.use(authenticateToken);

// Live typing trigger: debounced interaction check
router.post("/check-interaction", checkInteraction);

// Sidebar clinical chat
router.post("/chat", dispensingChat);

// Review silently-logged interactions (audit trail)
router.get("/interaction-logs/:hospitalId", getInteractionLogs);

module.exports = router;