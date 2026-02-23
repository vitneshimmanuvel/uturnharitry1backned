/**
 * Driver Routes - Simplified Registration (Name + Phone Only)
 * Matching Flutter UTurn app structure
 */
const express = require('express');
const router = express.Router();
const { 
    createDriver, 
    findDriverByPhone, 
    findDriverById, 
    updateDriver, 
    updateDriverDocuments,
    setDriverOnlineStatus,
    getOnlineDrivers
} = require('../models/driverModel');
const { generateToken, authMiddleware, driverOnly } = require('../middleware/auth');
const driverModel = require('../models/driverModel');
const bookingModel = require('../models/bookingModel');
const soloRideModel = require('../models/soloRideModel');
const referralModel = require('../models/referralModel');
const { checkOverlap } = require('../services/availabilityService');
const { getUploadUrl } = require('../services/s3Service');
const { findDrivers } = require('../models/driverModel');

// Check if phone number is already registered (real-time validation)
router.post('/check-phone', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone || phone.length < 10) {
            return res.json({ 
                success: true, 
                available: false, 
                message: 'Enter valid 10-digit phone number' 
            });
        }

        const existingDriver = await findDriverByPhone(phone);
        
        res.json({
            success: true,
            available: !existingDriver,
            exists: !!existingDriver,
            message: existingDriver ? 'Phone number already registered' : 'Phone number is available'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed', error: error.message });
    }
});

// Check for existing customer by phone (from past bookings) - for solo ride auto-fill
router.post('/check-customer', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone || phone.length < 10) {
            return res.json({ success: false, message: 'Enter valid phone number' });
        }
        
        const booking = await bookingModel.findLatestBookingByPhone(phone);
        const soloRide = await soloRideModel.findLatestSoloRideByPhone(phone);
        
        // Prefer the most recent record to get the most up-to-date customer details
        let latest = null;
        if (booking && soloRide) {
            latest = new Date(booking.createdAt) > new Date(soloRide.createdAt) ? booking : soloRide;
        } else {
            latest = booking || soloRide;
        }
        
        if (latest) {
            res.json({
                success: true,
                found: true,
                customer: {
                    name: latest.customerName,
                    language: latest.customerLanguage || 'Tamil'
                }
            });
        } else {
            res.json({
                success: true,
                found: false,
                message: 'Customer not found'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed', error: error.message });
    }
});

// Check if Aadhaar number is already registered (real-time validation)
router.post('/check-aadhaar', async (req, res) => {
    try {
        const { aadhaar } = req.body;
        if (!aadhaar || aadhaar.length < 12) {
            return res.json({ success: true, available: false, message: 'Enter valid 12-digit Aadhaar number' });
        }
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const { dynamoDb, TABLE_NAMES } = require('../config/aws');
        const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
        const dc = DynamoDBDocumentClient.from(dynamoDb);
        const result = await dc.send(new ScanCommand({
            TableName: TABLE_NAMES.drivers,
            FilterExpression: 'aadharNumber = :aadhaar',
            ExpressionAttributeValues: { ':aadhaar': aadhaar }
        }));
        const exists = result.Items && result.Items.length > 0;
        res.json({
            success: true,
            available: !exists,
            message: exists ? 'Aadhaar number already registered' : 'Aadhaar number is available'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed', error: error.message });
    }
});

// Check if Licence number is already registered (real-time validation)
router.post('/check-licence', async (req, res) => {
    try {
        const { licence } = req.body;
        if (!licence || licence.length < 5) {
            return res.json({ success: true, available: false, message: 'Enter a valid licence number' });
        }
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const { dynamoDb, TABLE_NAMES } = require('../config/aws');
        const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
        const dc = DynamoDBDocumentClient.from(dynamoDb);
        const result = await dc.send(new ScanCommand({
            TableName: TABLE_NAMES.drivers,
            FilterExpression: 'licenceNumber = :licence',
            ExpressionAttributeValues: { ':licence': licence.toUpperCase() }
        }));
        const exists = result.Items && result.Items.length > 0;
        res.json({
            success: true,
            available: !exists,
            message: exists ? 'Licence number already registered' : 'Licence number is available'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed', error: error.message });
    }
});

// Check if Vehicle number is already registered (real-time validation)
router.post('/check-vehicle', async (req, res) => {
    try {
        const { vehicleNumber } = req.body;
        if (!vehicleNumber || vehicleNumber.length < 5) {
            return res.json({ success: true, available: false, message: 'Enter a valid vehicle number' });
        }
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const { dynamoDb, TABLE_NAMES } = require('../config/aws');
        const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
        const dc = DynamoDBDocumentClient.from(dynamoDb);
        const result = await dc.send(new ScanCommand({
            TableName: TABLE_NAMES.drivers,
            FilterExpression: 'vehicleNumber = :vn',
            ExpressionAttributeValues: { ':vn': vehicleNumber.toUpperCase() }
        }));
        const exists = result.Items && result.Items.length > 0;
        res.json({
            success: true,
            available: !exists,
            message: exists ? 'Vehicle number already registered' : 'Vehicle number is available'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed', error: error.message });
    }
});

// Check if Referral Code is valid
router.post('/check-referral', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.json({ success: true, valid: false, message: 'Enter a referral code' });
        }
        
        const { findDriverByReferralCode } = require('../models/driverModel');
        const referrer = await findDriverByReferralCode(code);
        
        res.json({
            success: true,
            valid: !!referrer,
            message: referrer ? 'Valid referral code' : 'Invalid referral code',
            referrerName: referrer ? referrer.name : null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed', error: error.message });
    }
});

// Register new driver - SIMPLIFIED (Name + Phone Only)
router.post('/register', async (req, res) => {
    try {
        const { 
            name, 
            phone, 
            driverType,
            // Optional fields
            licenceNumber,
            vehicleNumber,
            vehicleType,
            vehicleBrand,
            vehicleModel,
            preferredVehicles,
            aadharNumber,
            dob,
            homeLocation,
            tripType,
            // New fields
            vehicles // Array of vehicles
        } = req.body;

        // Only name and phone are required
        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Name and phone number are required'
            });
        }

        // Check if phone already exists
        const existingDriver = await findDriverByPhone(phone);
        if (existingDriver) {
            return res.status(409).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        // Create driver with simplified data
        const driver = await createDriver({
            name,
            phone,
            driverType: driverType || 'driver',
            licenceNumber,
            vehicleNumber,
            vehicleType,
            vehicleBrand,
            vehicleModel,
            preferredVehicles,
            aadharNumber: aadharNumber || null,
            dob: dob || null,
            tripType: tripType || null,
            vehicles: vehicles || [], // Array of additional vehicles
            state: req.body.state,
            languages: req.body.languages,
            referredBy: req.body.referredBy // Pass referral code
        });

        // Generate token
        const token = generateToken({
            id: driver.id,
            phone: driver.phone,
            userType: 'driver',
            driverType: driver.driverType
        });

        res.status(201).json({
            success: true,
            message: 'Registration successful! Welcome to UTurn.',
            data: { driver, token }
        });
    } catch (error) {
        console.error('Driver registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Driver login - Phone Only (No Password)
router.post('/login', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const driver = await findDriverByPhone(phone);
        if (!driver) {
            return res.status(401).json({
                success: false,
                message: 'Phone number not registered. Please register first.'
            });
        }

        const token = generateToken({
            id: driver.id,
            phone: driver.phone,
            userType: 'driver',
            driverType: driver.driverType
        });

        res.json({
            success: true,
            message: 'Login successful',
            data: { driver, token }
        });
    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Get driver profile
router.get('/profile', authMiddleware, driverOnly, async (req, res) => {
    try {
        const driver = await findDriverById(req.user.id);
        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        res.json({ success: true, data: driver });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
    }
});

// Update driver profile
router.put('/profile', authMiddleware, driverOnly, async (req, res) => {
    try {
        const updates = req.body;
        delete updates.id;
        delete updates.phone;
        
        const updatedDriver = await updateDriver(req.user.id, updates);
        res.json({ success: true, message: 'Profile updated', data: updatedDriver });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
    }
});

// Get pre-signed URL for document upload
router.post('/upload-url', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { documentType, fileName, contentType } = req.body;
        const folder = `drivers/${req.user.id}/${documentType}`;
        const uploadData = await getUploadUrl(folder, fileName, contentType);
        res.json({ success: true, data: uploadData });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to generate upload URL', error: error.message });
    }
});

// Update documents
router.put('/documents', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { documents } = req.body;
        const driver = await findDriverById(req.user.id);
        const updatedDocuments = { ...driver.documents, ...documents };
        const updatedDriver = await updateDriverDocuments(req.user.id, updatedDocuments);
        res.json({ success: true, message: 'Documents updated', data: updatedDriver });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update documents', error: error.message });
    }
});

// Toggle online status with availability
router.put('/online-status', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { isOnline, availability, availabilities } = req.body;
        const finalAvailability = availabilities || availability || [];
        const updatedDriver = await setDriverOnlineStatus(req.user.id, isOnline, finalAvailability);
        res.json({ 
            success: true, 
            message: `You are now ${isOnline ? 'online' : 'offline'}`,
            data: updatedDriver 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
    }
});

// Get online drivers
router.get('/online', authMiddleware, async (req, res) => {
    try {
        const drivers = await getOnlineDrivers();
        res.json({ success: true, data: drivers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch online drivers', error: error.message });
    }
});

// Create SOLO Trip (Driver Direct Booking) — separate table
router.post('/solo-trip', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { createSoloRide } = require('../models/soloRideModel');
        const driver = await findDriverById(req.user.id);
        
        // Overlap Check Logic
        const startStr = req.body.scheduledDate || new Date().toISOString();
        const durationHrs = parseInt(req.body.rentalHours) || 4; // Default 4hr for One Way
        const endStr = req.body.returnDate || new Date(new Date(startStr).getTime() + durationHrs * 60 * 60 * 1000).toISOString();
        
        const availability = await checkOverlap(req.user.id, startStr, endStr);
        if (availability.overlap) {
            return res.status(409).json({
                success: false,
                message: 'Slot taken: You already have a booking during this time.',
                conflict: availability.conflict
            });
        }

        const ride = await createSoloRide(req.body, driver);
        
        res.json({
            success: true,
            message: 'Solo ride created successfully',
            data: ride
        });
    } catch (error) {
        console.error('Solo trip error:', error);
        res.status(500).json({ success: false, message: 'Failed to create solo ride', error: error.message });
    }
});

// Get Driver's Solo Rides
router.get('/solo-trips', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { getSoloRides } = require('../models/soloRideModel');
        const rides = await getSoloRides(req.user.id);
        
        res.json({
            success: true,
            data: rides
        });
    } catch (error) {
        console.error('Get solo rides error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch solo rides', error: error.message });
    }
});

// Get Driver's Rides (History / Active) - Combines Vendor and Solo
router.get('/rides', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { getDriverBookings } = require('../models/bookingModel');
        const { getSoloRides } = require('../models/soloRideModel');
        
        const vendorRides = await getDriverBookings(req.user.id);
        const soloRides = await getSoloRides(req.user.id);
        
        // Mark solo rides as such
        const adjustedSolo = soloRides.map(r => ({ ...r, isSolo: true }));
        
        // Combine and sort by date (newest first)
        const allRides = [...vendorRides, ...adjustedSolo].sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.json({
            success: true,
            data: { rides: allRides }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch rides', error: error.message });
    }
});

// Get available rides for driver
router.get('/rides/available', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { getNearbyBookings } = require('../models/bookingModel');
        const driver = await findDriverById(req.user.id);
        
        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        // Allow query parameters to override driver defaults
        const city = req.query.city || driver.homeLocation || 'Chennai'; 
        const vehicleType = req.query.vehicleType || driver.vehicleType || 'Sedan';

        const rides = await getNearbyBookings(city, vehicleType);
        
        res.json({
            success: true,
            data: { rides }
        });
    } catch (error) {
        console.error('Get available rides error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch available rides', 
            error: error.message 
        });
    }
});

// Get driver by ID
router.get('/:id', async (req, res) => {
    try {
        const driver = await findDriverById(req.params.id);
        if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
        res.json({ success: true, data: driver });
    } catch (error) {
         res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
