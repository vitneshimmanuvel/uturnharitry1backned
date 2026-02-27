const express = require('express');
const router = express.Router();
const notificationModel = require('../models/notificationModel');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/notifications
 * Get all notifications for current user
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const notifications = await notificationModel.getNotificationsByUserId(req.user.id);
        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', authMiddleware, async (req, res) => {
    try {
        await notificationModel.markAsRead(req.params.id);
        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
