/**
 * Driver Routes - Registration, Login, Profile, Documents management
 * Supports both regular drivers (with vehicle) and acting drivers (without vehicle)
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
    getOnlineDrivers,
    verifyPassword 
} = require('../models/driverModel');
const { generateToken, authMiddleware, driverOnly } = require('../middleware/auth');
const { getUploadUrl } = require('../services/s3Service');

// Register new driver (both regular and acting)
router.post('/register', async (req, res) => {
    try {
        const { 
            // Common fields
            name, 
            phone, 
            password,
            dob, 
            homeLocation, 
            aadharNumber, 
            licenceNumber,
            
            // Driver type
            driverType, // 'driver' or 'acting_driver'
            
            // Regular driver fields
            vehicleNumber, 
            vehicleType,
            
            // Acting driver fields
            experienceYears,
            preferredVehicles,
            
            // Documents
            documents
        } = req.body;

        // Validate required fields
        if (!name || !phone || !password || !dob || !aadharNumber || !licenceNumber) {
            return res.status(400).json({
                success: false,
                message: 'Name, phone, password, DOB, Aadhar number, and licence number are required'
            });
        }

        // Additional validation for regular drivers
        if (driverType === 'driver') {
            if (!vehicleNumber || !vehicleType) {
                return res.status(400).json({
                    success: false,
                    message: 'Vehicle number and type are required for drivers with vehicles'
                });
            }
        }

        // Check if phone already exists
        const existingDriver = await findDriverByPhone(phone);
        if (existingDriver) {
            return res.status(409).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        // Create driver
        const driver = await createDriver({
            name,
            phone,
            password,
            dob,
            homeLocation,
            aadharNumber,
            licenceNumber,
            driverType: driverType || 'driver',
            vehicleNumber,
            vehicleType,
            experienceYears,
            preferredVehicles,
            documents
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
            message: 'Registration submitted! We will verify your documents.',
            data: {
                driver,
                token
            }
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

// Driver login
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Validate required fields
        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Phone and password are required'
            });
        }

        // Find driver by phone
        const driver = await findDriverByPhone(phone);
        if (!driver) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Verify password
        const isValidPassword = await verifyPassword(password, driver.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Generate token
        const token = generateToken({
            id: driver.id,
            phone: driver.phone,
            userType: 'driver',
            driverType: driver.driverType
        });

        // Remove password from response
        const { password: _, ...driverData } = driver;

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                driver: driverData,
                token
            }
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

// Get driver profile (protected)
router.get('/profile', authMiddleware, driverOnly, async (req, res) => {
    try {
        const driver = await findDriverById(req.user.id);
        
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        // Remove password from response
        const { password, ...driverData } = driver;

        res.json({
            success: true,
            data: driverData
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
});

// Update driver profile (protected)
router.put('/profile', authMiddleware, driverOnly, async (req, res) => {
    try {
        const updates = req.body;
        
        // Don't allow updating sensitive fields
        delete updates.id;
        delete updates.password;
        delete updates.phone;
        delete updates.isVerified;

        const updatedDriver = await updateDriver(req.user.id, updates);
        
        // Remove password from response
        const { password, ...driverData } = updatedDriver;

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: driverData
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
});

// Get pre-signed URL for document upload
router.post('/upload-url', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { documentType, fileName, contentType } = req.body;

        if (!documentType || !fileName || !contentType) {
            return res.status(400).json({
                success: false,
                message: 'Document type, file name, and content type are required'
            });
        }

        const validDocTypes = ['selfie', 'aadhar', 'licence', 'rcBook', 'insurance', 'fc', 'verificationVideo'];
        if (!validDocTypes.includes(documentType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid document type'
            });
        }

        const folder = `drivers/${req.user.id}/${documentType}`;
        const uploadData = await getUploadUrl(folder, fileName, contentType);

        res.json({
            success: true,
            data: uploadData
        });
    } catch (error) {
        console.error('Get upload URL error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate upload URL',
            error: error.message
        });
    }
});

// Update document URLs after upload
router.put('/documents', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { documents } = req.body;

        if (!documents) {
            return res.status(400).json({
                success: false,
                message: 'Documents object is required'
            });
        }

        // Get current driver
        const driver = await findDriverById(req.user.id);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        // Merge with existing documents
        const updatedDocuments = {
            ...driver.documents,
            ...documents
        };

        const updatedDriver = await updateDriverDocuments(req.user.id, updatedDocuments);
        
        // Remove password from response
        const { password, ...driverData } = updatedDriver;

        res.json({
            success: true,
            message: 'Documents updated successfully',
            data: driverData
        });
    } catch (error) {
        console.error('Update documents error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update documents',
            error: error.message
        });
    }
});

// Toggle online status
router.put('/online-status', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { isOnline } = req.body;

        if (typeof isOnline !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'isOnline must be a boolean'
            });
        }

        const updatedDriver = await setDriverOnlineStatus(req.user.id, isOnline);
        
        // Remove password from response
        const { password, ...driverData } = updatedDriver;

        res.json({
            success: true,
            message: `You are now ${isOnline ? 'online' : 'offline'}`,
            data: driverData
        });
    } catch (error) {
        console.error('Update online status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update online status',
            error: error.message
        });
    }
});

// Get online drivers (for vendors)
router.get('/online', authMiddleware, async (req, res) => {
    try {
        const drivers = await getOnlineDrivers();
        
        // Remove passwords from response
        const driversData = drivers.map(driver => {
            const { password, ...driverData } = driver;
            return driverData;
        });

        res.json({
            success: true,
            data: driversData
        });
    } catch (error) {
        console.error('Get online drivers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch online drivers',
            error: error.message
        });
    }
});

module.exports = router;
