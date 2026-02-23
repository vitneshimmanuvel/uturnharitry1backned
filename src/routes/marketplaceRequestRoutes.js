const express = require('express');
const router = express.Router();
const marketplaceRequestModel = require('../models/marketplaceRequestModel');
const { authMiddleware } = require('../middleware/auth');

// Public read (Drivers/Vendors)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const requests = await marketplaceRequestModel.getAllRequests();
        res.json({ success: true, data: requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { query } = req.query;
        const requests = await marketplaceRequestModel.searchRequests(query);
        res.json({ success: true, data: requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create
router.post('/', authMiddleware, async (req, res) => {
    try {
        const request = await marketplaceRequestModel.createRequest({
            ...req.body,
            userId: req.user.id,
            userType: req.user.type || 'driver' // Default to driver if not specified
        });
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await marketplaceRequestModel.deleteRequest(req.params.id);
        res.json({ success: true, message: 'Request deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
