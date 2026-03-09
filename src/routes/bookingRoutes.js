const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const bookingModel = require('../models/bookingModel');
const driverModel = require('../models/driverModel');
const soloRideModel = require('../models/soloRideModel');
const notificationModel = require('../models/notificationModel');
const videoService = require('../services/videoService');
const whatsappService = require('../services/whatsappService');
const s3Service = require('../services/s3Service');
const { checkOverlap } = require('../services/availabilityService');
const { authMiddleware, vendorOnly } = require('../middleware/auth');
const fs = require('fs'); // Added for debug logging

// Generate unique tracking ID
const generateTrackingId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
    let result = 'TRIP-';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
        
        // 2. Get driver availability for filtering
        let availability = [];
        if (driverId) {
            const driver = await driverModel.findDriverById(driverId);
            if (driver) {
                availability = driver.availability || [];
            }
        }
        
        const bookings = await bookingModel.getNearbyBookings(city, vehicleType, 'pending', availability);
        
        // Attach vendor details
        const vendorModel = require('../models/vendorModel');
        for (const booking of bookings) {
            if (booking.vendorId && !booking.vendor) {
                try {
                    const vendor = await vendorModel.findVendorById(booking.vendorId);
                    if (vendor) {
                        booking.vendor = {
                            businessName: vendor.businessName,
                            ownerName: vendor.ownerName,
                            phone: vendor.phone,
                        };
                    }
                } catch (e) { /* ignore */ }
            }
        }

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
        let booking = await bookingModel.getBookingById(req.params.id);
        
        if (!booking) {
            // Check Solo Rides table
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) {
                booking.isSolo = true;
            }
        }

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Attach vendor details if vendorId exists
        if (booking.vendorId && !booking.vendor) {
            try {
                const vendorModel = require('../models/vendorModel');
                const vendor = await vendorModel.findVendorById(booking.vendorId);
                if (vendor) {
                    booking.vendor = {
                        businessName: vendor.businessName,
                        ownerName: vendor.ownerName,
                        phone: vendor.phone,
                    };
                }
            } catch (vendorErr) {
                console.error('Error fetching vendor for booking:', vendorErr);
            }
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

        // Overlap Check (Safe Date Parsing)
        const bookingToAccept = await bookingModel.getBookingById(req.params.id);
        if (bookingToAccept) {
            try {
                const startStr = `${bookingToAccept.scheduleDate}T${bookingToAccept.scheduleTime}`;
                const startTimeMs = new Date(startStr).getTime();
                
                // Only perform overlap check if start time is valid
                if (!isNaN(startTimeMs)) {
                    const endStr = (bookingToAccept.returnDate && bookingToAccept.returnTime)
                        ? `${bookingToAccept.returnDate}T${bookingToAccept.returnTime}`
                        : new Date(startTimeMs + 4 * 60 * 60 * 1000).toISOString();
                    
                    const availability = await checkOverlap(driverId, startStr, endStr);
                    if (availability.overlap) {
                        return res.status(409).json({
                            success: false,
                            message: 'Slot taken: You already have a booking during this time slot.',
                            conflict: availability.conflict
                        });
                    }
                } else {
                    console.warn(`[AcceptBooking] Invalid start time for booking ${req.params.id}: ${startStr}`);
                }
            } catch (dateError) {
                console.warn(`[AcceptBooking] Date parsing error for overlap check: ${dateError.message}`);
                // Proceed with acceptance if overlap check fails due to bad data
            }
        }

        
        const booking = await bookingModel.acceptBooking(req.params.id, driverId);
        
        // Notify vendor that driver accepted and video is available
        try {
            const notificationModel = require('../models/notificationModel');
            await notificationModel.createNotification(
                booking.vendorId,
                'DRIVER_ACCEPTED',
                'New Driver Acceptance',
                `Driver ${booking.driverName} has accepted Trip #${req.params.id.substring(0, 8)} and attached a verification video.`,
                { bookingId: req.params.id }
            );
        } catch (notifError) {
            console.error('Failed to notify vendor of acceptance:', notifError);
        }

        res.json({
            success: true,
            message: 'Booking accepted. Please upload verification video.',
            data: booking
        });
    } catch (error) {
        console.error('Accept booking error:', error);
        
        // Return 400 for logic/condition errors so client gets the real message
        // instead of a generic 500 "Server Error"
        const isClientError = error.message.includes('no longer available') || 
                             error.message.includes('not found') ||
                             error.message.includes('already taken');
                             
        res.status(isClientError ? 400 : 500).json({
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
        
        res.json({
            success: true,
            message: 'Video uploaded successfully.',
            data: { videoUrl, booking }
        });
    } catch (error) {
        console.error('Upload video error:', error);
        
        const isClientError = error.message.includes('not found') || 
                             error.message.includes('no longer available');
                             
        res.status(isClientError ? 400 : 500).json({
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
        
        // Notify driver of approval
        if (booking.assignedDriverId) {
            try {
                await notificationModel.createNotification(
                    booking.assignedDriverId,
                    'TRIP_APPROVED', // Consistent with TRIP_FINISHED
                    'Trip Approved! 🎉',
                    `Your application for Trip #${req.params.id.substring(0, 8)} has been approved by the vendor. Get ready for the ride!`,
                    { bookingId: req.params.id }
                );
                console.log(`[NOTIFICATION] Approval notice sent to driver ${booking.assignedDriverId}`);
            } catch (notifError) {
                console.error('Failed to send approval notification:', notifError);
            }
        }
        
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
        
        // Delete driver's uploaded video from S3 before clearing the booking
        if (bookingToCheck.driverVideoUrl) {
            try {
                await videoService.deleteVideo(bookingToCheck.driverVideoUrl);
                console.log(`[VIDEO] Deleted driver video for booking ${req.params.id}`);
            } catch (videoError) {
                console.error('Failed to delete driver video:', videoError);
                // Continue with rejection even if video deletion fails
            }
        }

        const booking = await bookingModel.rejectDriver(req.params.id, reason);
        
        // Notify driver of rejection with reason
        if (bookingToCheck.assignedDriverId) {
            try {
                await notificationModel.createNotification(
                    bookingToCheck.assignedDriverId,
                    'TRIP_REJECTED',
                    'Trip Application Rejected',
                    `Your application for Trip #${bookingToCheck.id.substring(0,8)} was rejected. Reason: ${reason}`,
                    { bookingId: bookingToCheck.id }
                );
                console.log(`[NOTIFICATION] Rejection notice sent to driver ${bookingToCheck.assignedDriverId}`);
            } catch (notifError) {
                console.error('Failed to send rejection notification:', notifError);
            }
        }
        
        res.json({
            success: true,
            message: 'Driver rejected. Trip republished for other drivers.',
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

// ARRIVED AT PICKUP - Driver marks arrival
router.post('/:id/arrive', async (req, res) => {
    try {
        let booking = await bookingModel.getBookingById(req.params.id);
        if (!booking) throw new Error('Booking not found');

        // Update status to 'arrived' and store arrival time
        const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        const { docClient } = require('../config/aws');
        await docClient.send(new UpdateCommand({
            TableName: 'uturn-bookings',
            Key: { id: req.params.id },
            UpdateExpression: 'SET #status = :status, arrivedAt = :arrivedAt, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'arrived',
                ':arrivedAt': new Date().toISOString(),
                ':now': new Date().toISOString()
            }
        }));

        const updated = await bookingModel.getBookingById(req.params.id);

        // Notify vendor that driver arrived at pickup
        try {
            if (updated.vendorId) {
                await notificationModel.createNotification(
                    updated.vendorId,
                    'DRIVER_ARRIVED',
                    'Driver Arrived at Pickup 📍',
                    `Driver has arrived at pickup for Trip #${req.params.id.substring(0, 8)}.`,
                    { bookingId: req.params.id }
                );
            }
        } catch (notifErr) {
            console.error('Arrive notification error:', notifErr);
        }

        res.json({ success: true, message: 'Arrived at pickup', data: updated });
    } catch (error) {
        console.error('Arrive error:', error);
        res.status(400).json({ success: false, message: error.message });
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

        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

        let startOdometerUrl = null;
        if (req.file) {
             const uploadResult = await s3Service.uploadFile(
                'odometer-photos',
                `start-${req.params.id}.jpg`,
                req.file.buffer,
                req.file.mimetype
            );
            startOdometerUrl = uploadResult.publicUrl;
        }
        
        const updatedRide = isSolo 
            ? await soloRideModel.startSoloTrip(req.params.id, startOdometer, otp, startOdometerUrl)
            : await bookingModel.startTrip(req.params.id, startOdometer, otp, startOdometerUrl);
        
        // Notify vendor that trip has started
        try {
            if (updatedRide.vendorId) {
                await notificationModel.createNotification(
                    updatedRide.vendorId,
                    'TRIP_STARTED',
                    'Trip Started! 🚗',
                    `Trip #${req.params.id.substring(0, 8)} has started. Driver is on the way to the destination.`,
                    { bookingId: req.params.id }
                );
            }
        } catch (notifErr) {
            console.error('Start trip notification error:', notifErr);
        }

        res.json({
            success: true,
            message: 'Trip started successfully',
            data: updatedRide
        });
    } catch (error) {
        console.error('Start trip error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// MARK DROPPED - REACHED DESTINATION
router.post('/:id/dropped', async (req, res) => {
    try {
        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

        const { waitingTimeMins, travelTimeSeconds, endOdometer } = req.body;
        const updatedRide = isSolo
            ? await soloRideModel.droppedSoloTrip(req.params.id, waitingTimeMins, travelTimeSeconds, endOdometer)
            : await bookingModel.droppedTrip(req.params.id, waitingTimeMins, travelTimeSeconds, endOdometer);
            
        // Notify both vendor and driver about reached destination
        try {
            const targetDriverId = updatedRide.assignedDriverId || updatedRide.driverId;
            if (updatedRide.vendorId) {
                await notificationModel.createNotification(
                    updatedRide.vendorId,
                    'TRIP_DROPPED',
                    'Destination Reached! 📍',
                    `Driver has reached the destination for Trip #${req.params.id.substring(0, 8)}. Trip completion pending.`,
                    { bookingId: req.params.id }
                );
            }
            if (targetDriverId) {
                await notificationModel.createNotification(
                    targetDriverId,
                    'TRIP_DROPPED',
                    'Destination Reached! 📍',
                    `You have reached the destination for Trip #${req.params.id.substring(0, 8)}. Complete the trip to finish.`,
                    { bookingId: req.params.id }
                );
            }
        } catch (notifErr) {
            console.error('Dropped notification error:', notifErr);
        }

        res.json({
            success: true,
            message: 'Trip marked as dropped',
            data: updatedRide
        });
    } catch (error) {
        console.error('Dropped error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

router.patch('/:id/extra-charges', async (req, res) => {
    try {
        const { tollCharges, parkingCharges, permitCharges } = req.body;
        
        const updates = {};
        if (tollCharges !== undefined) updates.tollCharges = Number(tollCharges);
        if (parkingCharges !== undefined) updates.parkingCharges = Number(parkingCharges);
        if (permitCharges !== undefined) updates.permitCharges = Number(permitCharges);
        
        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

        const updatedRide = isSolo
            ? await soloRideModel.updateSoloRide(req.params.id, updates)
            : await bookingModel.updateBooking(req.params.id, updates);
        
        res.json({
            success: true,
            message: 'Extra charges updated',
            data: updatedRide
        });
    } catch (error) {
        console.error('Update extra charges error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

router.patch('/:id/waiting-time', async (req, res) => {
    try {
        const { additionalMinutes } = req.body;
        
        if (additionalMinutes === undefined || additionalMinutes <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid additional minutes required'
            });
        }
        
        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

        const updatedRide = isSolo
            ? await soloRideModel.addToSoloWaitingTime(req.params.id, additionalMinutes)
            : await bookingModel.addToWaitingTime(req.params.id, additionalMinutes);
        
        res.json({
            success: true,
            data: updatedRide
        });
    } catch (error) {
        console.error('Add waiting time error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.post('/:id/complete', imageUpload.single('endOdometerPhoto'), async (req, res) => {
    try {
        const { endOdometer, paymentMethod, extraCharges, tollCharges, parkingCharges, permitCharges, travelTimeSeconds } = req.body;
        
        if (!endOdometer || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'End odometer and payment method required'
            });
        }

        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

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
        
        const updatedRide = isSolo
            ? await soloRideModel.completeSoloTrip(req.params.id, endOdometer, paymentMethod, endOdometerUrl, tollCharges, parkingCharges, permitCharges, travelTimeSeconds)
            : await bookingModel.completeTrip(req.params.id, endOdometer, paymentMethod, endOdometerUrl, tollCharges, parkingCharges, permitCharges, travelTimeSeconds);
        
        // Calculate trip data (booking or solo - same schema)
        const tripData = {
            distanceKm: updatedRide.actualDistanceKm,
            durationMins: Math.round((new Date(updatedRide.endTime) - new Date(updatedRide.startTime)) / 60000),
            waitingMins: updatedRide.waitingTimeMins || 0,
            totalAmount: updatedRide.totalAmount
        };
        
        // Send trip summary to customer
        await whatsappService.sendTripSummary(
            updatedRide.customerPhone,
            updatedRide,
            tripData
        );
        
        if (updatedRide.status === 'completed') {
            try {
                const targetDriverId = updatedRide.assignedDriverId || updatedRide.driverId;
                if (targetDriverId) {
                    await notificationModel.createNotification(
                        targetDriverId,
                        'TRIP_FINISHED',
                        'Trip Finished! 🏁',
                        `Trip #${req.params.id.substring(0, 8)} is completed. Check your earnings in history.`,
                        { bookingId: req.params.id }
                    );
                    
                    // Update Driver Stats
                    await driverModel.incrementDriverTrips(targetDriverId);
                    await driverModel.addDriverEarnings(targetDriverId, (updatedRide.totalAmount || 0) - (updatedRide.vendorCommission || 0));
                }

                if (updatedRide.vendorId) {
                    await notificationModel.createNotification(
                        updatedRide.vendorId,
                        'TRIP_FINISHED',
                        'Trip Finished! 🏁',
                        `Trip #${req.params.id.substring(0, 8)} is completed. Check your bookings page.`,
                        { bookingId: req.params.id }
                    );
                }
            } catch (notifyError) {
                console.error('Completion post-processing error:', notifyError);
            }
        } else if (updatedRide.status === 'payment_verification_pending') {
            try {
                await notificationModel.createNotification(
                    updatedRide.vendorId,
                    'PAYMENT_PENDING',
                    'Cash Verification Required',
                    `Driver has completed Trip #${req.params.id.substring(0, 8)} and gathered cash. Please verify.`,
                    { bookingId: req.params.id }
                );
            } catch (notifError) {
                console.error('Failed to send cash verification notification:', notifError);
            }
        }

        res.json({
            success: true,
            message: 'Trip completed successfully',
            data: updatedRide
        });
    } catch (error) {
        console.error('Complete trip error:', error);
        fs.appendFileSync('route_error.log', `${new Date().toISOString()} - ROUTE COMPLETE ERROR: ${error.stack}\n`);
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
            waitingCharges: booking.waitingTimeMins ? (booking.waitingTimeMins * (booking.waitingChargesPerMin || booking.waitingCharges || (booking.waitingChargesPerHour / 60) || 0)) : 0,
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

/* CONSOLIDATED SECURE ROUTE: verify-payment (Vendor) */
router.post('/:id/verify-payment', authMiddleware, vendorOnly, async (req, res) => {
    try {
        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

        const updated = isSolo 
            ? await soloRideModel.verifySoloCashPayment(req.params.id)
            : await bookingModel.verifyCashPayment(req.params.id);
        
        // Notify driver
        try {
            await notificationModel.createNotification(
                updated.assignedDriverId || updated.driverId,
                'PAYMENT_VERIFIED',
                'Payment Verified! ✅',
                `Vendor has verified your cash collection for Trip #${req.params.id.substring(0, 8)}.`,
                { bookingId: req.params.id }
            );
        } catch (notifError) {
            console.error('Failed to send payment verification notification:', notifError);
        }

        res.json({
            success: true,
            message: 'Cash payment verified. Awaiting commission payment.',
            data: updated
        });

    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* CONSOLIDATED SECURE ROUTE: pay-commission (Driver) */
router.post('/:id/pay-commission', authMiddleware, async (req, res) => {
    try {
        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

        const updated = isSolo
            ? await soloRideModel.paySoloCommission(req.params.id)
            : await bookingModel.payCommission(req.params.id);
        
        // Notify vendor
        try {
            await notificationModel.createNotification(
                updated.vendorId,
                'COMMISSION_PAID',
                'Commission Payment Received',
                `Driver ${updated.driverName || 'Driver'} has marked commission as paid for Trip #${req.params.id.substring(0, 8)}. Please verify.`,
                { bookingId: req.params.id }
            );
        } catch (notifError) {
            console.error('Failed to send commission notification:', notifError);
        }

        res.json({
            success: true,
            message: 'Commission payment marked. Waiting for vendor verification.',
            data: updated
        });

    } catch (error) {
        console.error('Pay commission error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* CONSOLIDATED ROUTE: approve-commission (Vendor) */
router.post('/:id/approve-commission', authMiddleware, vendorOnly, async (req, res) => {
    try {
        let booking = await bookingModel.getBookingById(req.params.id);
        let isSolo = false;

        if (!booking) {
            booking = await soloRideModel.getSoloRideById(req.params.id);
            if (booking) isSolo = true;
        }

        if (!booking) throw new Error('Ride not found');

        const updated = isSolo
            ? await soloRideModel.approveSoloCommission(req.params.id)
            : await bookingModel.approveCommission(req.params.id);
        
        // Notify both
        try {
            const driverId = updated.assignedDriverId || updated.driverId;
            await notificationModel.createNotification(
                driverId,
                'TRIP_FINISHED',
                'Commission Approved! 🏁',
                `Vendor has approved your commission payment for Trip #${req.params.id.substring(0, 8)}. Ride is now finished!`,
                { bookingId: req.params.id }
            );
            await notificationModel.createNotification(
                updated.vendorId,
                'TRIP_FINISHED',
                'Trip Finished!',
                `Commission received and Trip #${req.params.id.substring(0, 8)} is now officially closed.`,
                { bookingId: req.params.id }
            );
        } catch (notifError) {
            console.error('Failed to send finish notification:', notifError);
        }

        res.json({
            success: true,
            message: 'Commission approved. Driver unblocked.',
            data: updated
        });

    } catch (error) {
        console.error('Approve commission error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* CONSOLIDATED ROUTE: reject-commission (Vendor) */
router.post('/:id/reject-commission', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { reason } = req.body;
        const booking = await bookingModel.rejectCommission(req.params.id, reason);
        
        // Notify driver of rejection
        try {
            await notificationModel.createNotification(
                booking.assignedDriverId,
                'COMMISSION_REJECTED',
                'Commission Payment Rejected ❌',
                `Vendor has rejected your commission payment for Trip #${req.params.id.substring(0, 8)}. ${reason ? `Reason: ${reason}` : 'Please re-verify.'}`,
                { bookingId: req.params.id, reason: reason }
            );
        } catch (notifError) {
            console.error('Failed to send commission rejection:', notifError);
        }

        res.json({
            success: true,
            message: 'Commission payment rejected.',
            data: booking
        });
    } catch (error) {
        console.error('Reject commission error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
