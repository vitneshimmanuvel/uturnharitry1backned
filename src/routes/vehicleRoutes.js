const express = require('express');
const router = express.Router();
const vehicleModel = require('../models/vehicleModel');
const { authMiddleware } = require('../middleware/auth');

// Public read (Drivers/Vendors)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const vehicles = await vehicleModel.getAllVehicles();
        res.json({ success: true, data: vehicles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { query } = req.query;
        const vehicles = await vehicleModel.searchVehicles(query);
        res.json({ success: true, data: vehicles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create (Vendors only - logic can be refined if needed)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const vehicle = await vehicleModel.createVehicle({
            ...req.body,
            vendorId: req.user.id // Track who posted it
        });
        res.status(201).json({ success: true, data: vehicle });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await vehicleModel.deleteVehicle(req.params.id);
        res.json({ success: true, message: 'Vehicle deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
