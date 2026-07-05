const express = require("express");
const router = express.Router();
const {
    createHospital,
    verifyEmail,
    loginHospital,
    forgotPassword,
    resetPassword,
    resendVerificationLink,
    updateHospital,
    getHospitalById,
    deleteHospital,
    searchHospitals,
    getAllHospitals,
    refreshAccessToken,
    logoutHospital,
} = require("../controllers/HospitalAuthenticationController");
const { authenticateToken } = require("../middleware/authenticationToken");

// Authentication routes
router.post('/register', createHospital);
router.post('/login', loginHospital);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationLink);
// Route for refreshing the access token
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logoutHospital);
// Routes that require authentication
router.get('/search', authenticateToken, searchHospitals);
router.put('/:id', authenticateToken, updateHospital);
router.get('/:id', getHospitalById);
router.delete('/:id', authenticateToken, deleteHospital);

// Public route to get all hospitals (assuming this doesn't need authentication)
router.get('/', getAllHospitals);

module.exports = router;
