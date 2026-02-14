const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const bookingModel = require('../models/bookingModel');
const driverModel = require('../models/driverModel');
const videoService = require('../services/videoService');
const whatsappService = require('../services/whatsappService');
const s3Service = require('../services/s3Service');
const { authMiddleware, vendorOnly } = require('../middleware/auth');

// Generate unique tracking ID
const generateTrackingId = () => {
    const prefix = 'UTN';
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${random}`;
};

// Multer configuration for VIDEO upload
const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files allowed'), false);
        }
    }
});

// Multer configuration for IMAGE upload
const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files allowed'), false);
        }
    }
});

/**
 * POST /api/bookings/create
 * Create new booking (Vendor)
 */
router.post('/create', async (req, res) => {
    try {
        console.log('[API] Creating booking with data:', JSON.stringify(req.body, null, 2));
        const booking = await bookingModel.createBooking(req.body);
        console.log('[API] Booking created successfully:', booking.id);
        
        res.json({
            success: true,
            message: 'Booking created successfully',
            data: booking
        });
    } catch (error) {
        console.error('[API] Create booking error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/bookings/nearby
 * Get nearby bookings for drivers
 */
router.get('/nearby', async (req, res) => {
    try {
        const { city, vehicleType, driverId } = req.query;
        
        // 1. Check if driver is busy (if driverId provided)
        if (driverId) {
            const isBusy = await bookingModel.hasActiveBooking(driverId);
            if (isBusy) {
                return res.json({
                    success: true,
                    data: [], // Return empty list if busy
                    message: 'You have an active ride'
                });
            }
        }
        
        const bookings = await bookingModel.getNearbyBookings(city, vehicleType);
        
        res.json({
            success: true,
            data: bookings
        });
    } catch (error) {
        console.error('Get nearby bookings error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/bookings/vendor/:vendorId
 * Get vendor's bookings
 */
router.get('/vendor/:vendorId', async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { status } = req.query;
        
        const bookings = await bookingModel.getVendorBookings(vendorId, status);
        
        res.json({
            success: true,
            data: bookings
        });
    } catch (error) {
        console.error('Get vendor bookings error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/bookings/driver/:driverId
 * Get driver's bookings
 */
router.get('/driver/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        const { status } = req.query;
        
        const bookings = await bookingModel.getDriverBookings(driverId, status);
        
        res.json({
            success: true,
            data: bookings
        });
    } catch (error) {
        console.error('Get driver bookings error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/bookings/:id
 * Get booking details
 */
router.get('/:id', async (req, res) => {
    try {
        const booking = await bookingModel.getBookingById(req.params.id);
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }
        
        res.json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/bookings/driver/:driverId
 * Get bookings assigned to driver
 */
router.get('/driver/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        const { status } = req.query;
        
        const bookings = await bookingModel.getDriverBookings(driverId, status);
        
        res.json({
            success: true,
            data: bookings
        });
    } catch (error) {
        console.error('Get driver bookings error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/accept
 * Driver accepts booking
 */
router.post('/:id/accept', async (req, res) => {
    try {
        const { driverId } = req.body;
        console.log(`[AcceptBooking] Request for booking ${req.params.id} from driver ${driverId}`);
        
        if (!driverId) {
            return res.status(400).json({
                success: false,
                message: 'Driver ID required'
            });
        }
        
        const booking = await bookingModel.acceptBooking(req.params.id, driverId);
        
        res.json({
            success: true,
            message: 'Booking accepted. Please upload verification video.',
            data: booking
        });
    } catch (error) {
        console.error('Accept booking error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/upload-video
 * Upload driver video (Driver)
 */
router.post('/:id/driver-video', videoUpload.single('video'), async (req, res) => {
    try {
        const { id } = req.params;
        const { driverId } = req.body;
        
        console.log(`[VIDEO UPLOAD] Request ID: '${id}'`);
        console.log(`[VIDEO UPLOAD] Driver ID: '${driverId}'`);
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Video file required'
            });
        }
        
        // Upload to S3
        const videoUrl = await videoService.uploadDriverVideo(
            req.file.buffer,
            req.file.originalname,
            driverId,
            id
        );
        
        // Update booking
        const booking = await bookingModel.updateDriverVideo(id, videoUrl);
        
        // TODO: Notify vendor of new video to review
        
        res.json({
            success: true,
            message: 'Video uploaded successfully. Waiting for vendor approval.',
            data: { videoUrl, booking }
        });
    } catch (error) {
        console.error('Upload video error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/approve-driver
 * Vendor approves driver
 */
router.post('/:id/approve-driver', authMiddleware, vendorOnly, async (req, res) => {
    try {
        // 1. Check Ownership
        const bookingToCheck = await bookingModel.getBookingById(req.params.id);
        if (!bookingToCheck) return res.status(404).json({ success: false, message: 'Booking not found' });
        
        if (bookingToCheck.vendorId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this booking' });
        }

        const booking = await bookingModel.approveDriver(req.params.id);
        
        // Generate OTP for this trip
        const otp = await bookingModel.generateTripOTP(req.params.id);
        booking.otp = otp; // Attach to response object for local use/logging
        
        // Use actual driver details from booking
        const driverData = {
            name: booking.driverName || 'Verified Driver',
            phone: booking.driverPhone || '',
            vehicleNumber: booking.vehicleNumber || ''
        };
        
        // Send WhatsApp to customer with driver details
        await whatsappService.sendDriverConfirmation(
            booking.customerPhone,
            booking,
            driverData
        );
        
        // TODO: Notify driver of approval
        
        res.json({
            success: true,
            message: 'Driver approved. Customer notified.',
            data: booking
        });
    } catch (error) {
        console.error('Approve driver error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/reject-driver
 * Vendor rejects driver
 */
router.post('/:id/reject-driver', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { reason } = req.body;
        
        // 1. Check Ownership
        const bookingToCheck = await bookingModel.getBookingById(req.params.id);
        if (!bookingToCheck) return res.status(404).json({ success: false, message: 'Booking not found' });
        
        if (bookingToCheck.vendorId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this booking' });
        }
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason required'
            });
        }
        
        const booking = await bookingModel.rejectDriver(req.params.id, reason);
        
        // TODO: Notify driver of rejection with reason
        
        res.json({
            success: true,
            message: 'Driver rejected. Booking available for other drivers.',
            data: booking
        });
    } catch (error) {
        console.error('Reject driver error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/generate-otp
 * Generate OTP for trip start
 */
router.post('/:id/generate-otp', async (req, res) => {
    try {
        const booking = await bookingModel.getBookingById(req.params.id);
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }
        
        const otp = await bookingModel.generateTripOTP(req.params.id);
        
        // Send OTP to customer
        await whatsappService.sendTripOTP(
            booking.customerPhone,
            otp,
            booking.customerName
        );
        
        res.json({
            success: true,
            message: 'OTP generated and sent to customer',
            data: { otp } // In production, don't return OTP to driver
        });
    } catch (error) {
        console.error('Generate OTP error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.post('/:id/start-trip', imageUpload.single('image'), async (req, res) => {
    try {
        const { startOdometer, otp } = req.body;
        
        if (!startOdometer || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Start odometer and OTP required'
            });
        }

        let startOdometerUrl = null;
        if (req.file) {
             const uploadResult = await s3Service.uploadFile(
                'odometer-photos',
                `start-${req.params.id}.jpg`,
                req.file.buffer,
                req.file.mimetype
            );
            startOdometerUrl = uploadResult.publicUrl;
        } else {
             // Fallback for testing/web without file
             // return res.status(400).json({ success: false, message: 'Odometer photo required' });
             console.warn('No odometer photo uploaded for start-trip');
        }
        
        const booking = await bookingModel.startTrip(req.params.id, startOdometer, otp, startOdometerUrl);
        
        res.json({
            success: true,
            message: 'Trip started successfully',
            data: booking
        });
    } catch (error) {
        console.error('Start trip error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * PATCH /api/bookings/:id/waiting-time
 * Add waiting time (Accumulate)
 */
router.patch('/:id/waiting-time', async (req, res) => {
    try {
        const { additionalMinutes } = req.body;
        
        if (additionalMinutes === undefined || additionalMinutes <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid additional minutes required'
            });
        }
        
        const booking = await bookingModel.addToWaitingTime(req.params.id, additionalMinutes);
        
        res.json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Add waiting time error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/complete
 * Complete trip
 */
router.post('/:id/complete', imageUpload.single('image'), async (req, res) => {
    try {
        const { endOdometer, paymentMethod, extraCharges } = req.body;
        
        if (!endOdometer || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'End odometer and payment method required'
            });
        }

        let endOdometerUrl = null;
        if (req.file) {
             const uploadResult = await s3Service.uploadFile(
                'odometer-photos',
                `end-${req.params.id}.jpg`,
                req.file.buffer,
                req.file.mimetype
            );
            endOdometerUrl = uploadResult.publicUrl;
        }
        
        const booking = await bookingModel.completeTrip(req.params.id, endOdometer, paymentMethod, endOdometerUrl, extraCharges);
        
        // Calculate trip data
        const tripData = {
            distanceKm: booking.actualDistanceKm,
            durationMins: Math.round((new Date(booking.endTime) - new Date(booking.startTime)) / 60000),
            waitingMins: booking.waitingTimeMins,
            totalAmount: booking.totalAmount
        };
        
        // Send trip summary to customer
        await whatsappService.sendTripSummary(
            booking.customerPhone,
            booking,
            tripData
        );
        
        res.json({
            success: true,
            message: 'Trip completed successfully',
            data: booking
        });
    } catch (error) {
        console.error('Complete trip error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/bookings/track/:trackingId
 * Get booking by tracking ID for public tracking page
 */
router.get('/track/:trackingId', async (req, res) => {
    try {
        const { trackingId } = req.params;
        
        // Find booking by tracking ID or regular ID
        let booking = await bookingModel.getBookingByTrackingId(trackingId);
        
        if (!booking) {
            // Try as regular booking ID
            booking = await bookingModel.getBookingById(trackingId);
        }
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }
        
        // Check if ride is closed (completed or cancelled)
        const isClosed = ['completed', 'cancelled'].includes(booking.status);
        
        // Return limited data for privacy
        const trackingData = {
            id: booking.id,
            trackingId: booking.trackingId,
            status: booking.status,
            isClosed: isClosed,
            customerName: booking.customerName,
            pickupAddress: booking.pickupAddress,
            pickupCity: booking.pickupCity,
            pickupLocation: booking.pickupLocation,
            dropAddress: booking.dropAddress,
            dropCity: booking.dropCity,
            dropLocation: booking.dropLocation,
            vehicleType: booking.vehicleType,
            tripType: booking.tripType,
            scheduleDate: booking.scheduleDate,
            scheduleTime: booking.scheduleTime,
            distanceKm: booking.distanceKm,
            estimatedDurationMins: booking.estimatedDurationMins,
            packageAmount: booking.packageAmount,
            estimatedFare: booking.estimatedFare,
            waitingCharges: booking.waitingTimeMins ? (booking.waitingTimeMins * (booking.waitingChargesPerHour || 50) / 60) : 0,
            totalAmount: booking.totalAmount,
            startTime: booking.startTime,
            endTime: booking.endTime,
            // Only show driver details if approved (not for pending/cancelled)
            driverName: booking.status !== 'pending' && booking.status !== 'cancelled' ? booking.driverName : null,
            vehicleNumber: booking.status !== 'pending' && booking.status !== 'cancelled' ? booking.vehicleNumber : null,
            driverPhone: booking.status !== 'pending' && booking.status !== 'cancelled' && booking.driverPhone 
                ? `+91 XXXXX ${booking.driverPhone?.slice(-4) || ''}` 
                : null,
            // Expiry message for closed rides
            closedMessage: booking.status === 'completed' 
                ? 'This ride has been completed. Thank you for traveling with UTurn!'
                : booking.status === 'cancelled'
                ? 'This ride was cancelled.'
                : null
        };
        
        res.json({
            success: true,
            data: trackingData
        });
    } catch (error) {
        console.error('Track booking error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/generate-tracking
 * Generate tracking URL for a booking
 */
router.post('/:id/generate-tracking', async (req, res) => {
    try {
        const trackingId = generateTrackingId();
        const booking = await bookingModel.updateBooking(req.params.id, { trackingId });
        
        const trackingUrl = `${req.protocol}://${req.get('host')}/track/${trackingId}`;
        
        res.json({
            success: true,
            data: {
                trackingId,
                trackingUrl,
                booking
            }
        });
    } catch (error) {
        console.error('Generate tracking error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/pay-commission
 * Mark commission as paid and unblock driver
 */
router.post('/:id/pay-commission', async (req, res) => {
    try {
        const booking = await bookingModel.markCommissionPaid(req.params.id);
        
        res.json({
            success: true,
            message: 'Commission marked as paid. Driver unblocked.',
            data: booking
        });
    } catch (error) {
        console.error('Pay commission error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/approve-driver
 * Vendor approves driver
 */
router.post('/:id/approve-driver', async (req, res) => {
    try {
        const booking = await bookingModel.approveDriver(req.params.id);
        res.json({
            success: true,
            message: 'Driver approved successfully',
            data: booking
        });
    } catch (error) {
        console.error('Approve driver error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/bookings/:id/reject-driver
 * Vendor rejects driver
 */
router.post('/:id/reject-driver', async (req, res) => {
    try {
        const { reason } = req.body;
        const booking = await bookingModel.rejectDriver(req.params.id, reason);
        res.json({
            success: true,
            message: 'Driver rejected',
            data: booking
        });
    } catch (error) {
        console.error('Reject driver error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
