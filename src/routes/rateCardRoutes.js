const express = require('express');
const router = express.Router();
const rateCardModel = require('../models/rateCardModel');
const { authMiddleware, vendorOnly } = require('../middleware/auth');

/**
 * GET /api/rate-cards
 * Get all rate cards for the logged-in vendor
 */
router.get('/', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const rateCards = await rateCardModel.getVendorRateCards(req.user.id);
        res.json({
            success: true,
            data: rateCards
        });
    } catch (error) {
        console.error('Get rate cards error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/rate-cards
 * Create a new rate card
 */
router.post('/', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { name, vehicleType, tripType, rates } = req.body;
        
        if (!name || !vehicleType || !tripType || !rates) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const rateCard = await rateCardModel.createRateCard({
            vendorId: req.user.id,
            name,
            vehicleType,
            tripType,
            rates
        });

        res.json({
            success: true,
            message: 'Rate card created successfully',
            data: rateCard
        });
    } catch (error) {
        console.error('Create rate card error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * PUT /api/rate-cards/:id
 * Update a rate card
 */
router.put('/:id', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Ensure ownership
        const card = await rateCardModel.getRateCardById(id);
        if (!card) {
            return res.status(404).json({ success: false, message: 'Rate card not found' });
        }
        if (card.vendorId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const updatedCard = await rateCardModel.updateRateCard(id, updates);

        res.json({
            success: true,
            message: 'Rate card updated successfully',
            data: updatedCard
        });
    } catch (error) {
        console.error('Update rate card error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * DELETE /api/rate-cards/:id
 * Delete a rate card
 */
router.delete('/:id', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Ensure ownership
        const card = await rateCardModel.getRateCardById(id);
        if (!card) {
            return res.status(404).json({ success: false, message: 'Rate card not found' });
        }
        if (card.vendorId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        await rateCardModel.deleteRateCard(id);

        res.json({
            success: true,
            message: 'Rate card deleted successfully'
        });
    } catch (error) {
        console.error('Delete rate card error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
