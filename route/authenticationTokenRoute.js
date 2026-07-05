const express = require('express');
const { authenticateToken } = require('../middleware/authenticationToken');

const router = express.Router();

router.get('/protected-route', authenticateToken, (req, res) => {
    // Handle protected route
    res.status(200).json({ msg: 'Access granted', hospitalId: req.hospitalId });
});

module.exports = router;