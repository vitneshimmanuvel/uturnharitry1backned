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
const { getUploadUrl } = require('../services/s3Service');

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
            preferredVehicles
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
            preferredVehicles
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
        const { isOnline, availability } = req.body;
        const updatedDriver = await setDriverOnlineStatus(req.user.id, isOnline, availability || []);
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

// Create SOLO Trip (Driver Direct Booking)
router.post('/solo-trip', authMiddleware, driverOnly, async (req, res) => {
    // ... existing implementation ...
    try {
        const { createBooking, acceptBooking } = require('../models/bookingModel');
        const driver = await findDriverById(req.user.id);
        
        // 1. Create Booking
        const bookingData = {
            ...req.body,
            vendorId: 'SOLO_RIDE', // Special flag
            status: 'pending', // Will be accepted immediately
            category: 'Private',
            tripType: 'oneWay', // Default
            scheduleDate: req.body.scheduleDate || new Date().toISOString(),
            scheduleTime: req.body.scheduleTime || 'Now',
            
            // Commission Free
            vendorCommission: 0,
            
            // Driver Vehicle Info
            vehicleType: driver.vehicleType,
            vehicleBrand: driver.vehicleBrand,
            vehicleModel: driver.vehicleModel,
        };
        
        const booking = await createBooking(bookingData);
        
        // 2. Auto-Accept by Driver
        const acceptedBooking = await acceptBooking(booking.id, driver.id);
        
        res.json({
            success: true,
            message: 'Solo trip started successfully',
            data: { booking: acceptedBooking }
        });
    } catch (error) {
        console.error('Solo trip error:', error);
        res.status(500).json({ success: false, message: 'Failed to create solo trip', error: error.message });
    }
});

// Get Driver's Rides (History / Active)
router.get('/rides', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { getDriverBookings } = require('../models/bookingModel');
        const rides = await getDriverBookings(req.user.id);
        res.json({
            success: true,
            data: { rides }
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
