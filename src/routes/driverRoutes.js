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
    getOnlineDrivers,
    findOnlineDriverUsingVehicle,
    normalizeVehicleNumber,
    updateDriver
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

        // Normalize vehicle data
        const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);
        
        const normalizedVehicles = (vehicles || []).map(v => ({
            ...v,
            vehicleNumber: normalizeVehicleNumber(v.vehicleNumber),
            rcNumber: normalizeVehicleNumber(v.rcNumber || v.vehicleNumber)
        }));

        // Create driver with simplified data
        const driver = await createDriver({
            name,
            phone,
            driverType: driverType || 'driver',
            licenceNumber: licenceNumber ? licenceNumber.toUpperCase().trim() : null,
            vehicleNumber: normalizedVehicleNumber,
            vehicleType,
            vehicleBrand,
            vehicleModel,
            preferredVehicles,
            aadharNumber: aadharNumber || null,
            dob: dob || null,
            homeLocation: homeLocation || null,
            tripType: tripType || null,
            vehicles: normalizedVehicles,
            state: req.body.state,
            languages: req.body.languages,
            referredBy: req.body.referredBy,
            rcNumber: normalizedVehicleNumber // Ensure rcNumber is also normalized
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

// Driver login - Phone Only (No Password) - WITH VERIFICATION CHECK
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

        // Check if driver is blocked
        if (driver.status === 'blocked') {
            return res.status(403).json({
                success: false,
                message: 'Your account has been blocked. Please contact admin.',
                isBlocked: true
            });
        }

        // Check verification status
        if (driver.verificationStatus === 'rejected') {
            return res.status(403).json({
                success: false,
                message: driver.rejectionReason || 'Your registration has been rejected. Please contact admin.',
                verificationStatus: 'rejected',
                rejectionReason: driver.rejectionReason
            });
        }

        if (driver.isVerified !== true) {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending verification by admin. Please wait for approval.',
                verificationStatus: 'pending'
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
        const { isOnline, availability, availabilities, activeVehicleNumber } = req.body;
        const finalAvailability = availabilities || availability || [];
        
        // Locking Logic: If going online, check if someone else is online with this vehicle
        let normalizedActiveVehicle = null;
        if (isOnline && activeVehicleNumber) {
            normalizedActiveVehicle = normalizeVehicleNumber(activeVehicleNumber);
            const otherDriver = await findOnlineDriverUsingVehicle(normalizedActiveVehicle);
            
            if (otherDriver && otherDriver.id !== req.user.id) {
                return res.status(409).json({
                    success: false,
                    message: `Vehicle ${normalizedActiveVehicle} is currently in use by another driver.`,
                    inUseBy: otherDriver.name
                });
            }
        }

        const updates = { isOnline, availability: finalAvailability };
        if (normalizedActiveVehicle) {
            updates.activeVehicleNumber = normalizedActiveVehicle;
        }

        const updatedDriver = await updateDriver(req.user.id, updates);
        
        res.json({ 
            success: true, 
            message: `You are now ${isOnline ? 'online' : 'offline'}`,
            data: updatedDriver 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
    }
});

// Set active/default vehicle
router.put('/active-vehicle', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { vehicleNumber } = req.body;
        if (!vehicleNumber) {
            return res.status(400).json({ success: false, message: 'Vehicle number is required' });
        }

        const normalizedVNum = normalizeVehicleNumber(vehicleNumber);
        const otherDriver = await findOnlineDriverUsingVehicle(normalizedVNum);

        if (otherDriver && otherDriver.id !== req.user.id) {
            return res.status(409).json({
                success: false,
                message: `Vehicle ${normalizedVNum} is currently in use by ${otherDriver.name}.`,
                inUseBy: otherDriver.name
            });
        }

        const updatedDriver = await updateDriver(req.user.id, { activeVehicleNumber: normalizedVNum });
        res.json({ success: true, message: 'Default vehicle updated', data: updatedDriver });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update active vehicle', error: error.message });
    }
});

// Check availability for a list of vehicles
router.post('/vehicles/availability', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { vehicleNumbers } = req.body;
        if (!vehicleNumbers || !Array.isArray(vehicleNumbers)) {
            return res.status(400).json({ success: false, message: 'vehicleNumbers array is required' });
        }

        const { getOnlineDrivers } = require('../models/driverModel');
        const onlineDrivers = await getOnlineDrivers();
        
        // Map vehicle number to status
        const availability = {};
        vehicleNumbers.forEach(vnum => {
            const normalized = normalizeVehicleNumber(vnum);
            const usingDriver = onlineDrivers.find(d => {
                const active = normalizeVehicleNumber(d.activeVehicleNumber);
                const primary = normalizeVehicleNumber(d.vehicleNumber);
                return (active === normalized || (!active && primary === normalized)) && d.id !== req.user.id;
            });
            availability[vnum] = {
                isInUse: !!usingDriver,
                inUseBy: usingDriver ? usingDriver.name : null
            };
        });

        res.json({ success: true, data: availability });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to check availability', error: error.message });
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
        const { status } = req.query;
        const rides = await getSoloRides(req.user.id, status);
        
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
        const { status } = req.query;
        
        const vendorRides = await getDriverBookings(req.user.id, status);
        const soloRides = await getSoloRides(req.user.id, status);
        
        // Attach vendor details to vendor rides
        const vendorModel = require('../models/vendorModel');
        for (const ride of vendorRides) {
            if (ride.vendorId && !ride.vendor) {
                try {
                    const vendor = await vendorModel.findVendorById(ride.vendorId);
                    if (vendor) {
                        ride.vendor = {
                            businessName: vendor.businessName,
                            ownerName: vendor.ownerName,
                            phone: vendor.phone,
                        };
                    }
                } catch (e) { /* ignore */ }
            }
        }

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
        const city = req.query.city || driver.homeLocation || 'all'; 
        const vehicleType = req.query.vehicleType || driver.vehicleType || 'all';

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


// ==================== WALLET ENDPOINTS ====================
const walletModel = require('../models/walletModel');

// Get wallet balance
router.get('/wallet/balance', authMiddleware, driverOnly, async (req, res) => {
    try {
        const wallet = await walletModel.getWallet(req.user.id);
        res.json({
            success: true,
            data: { 
                balance: wallet.balance,
                totalEarnings: wallet.totalEarnings || 0,
                totalAddedMoney: wallet.totalAddedMoney || 0,
                totalWithdrawals: wallet.totalWithdrawals || 0
            }
        });
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch wallet', error: error.message });
    }
});

// Get wallet transactions
router.get('/wallet/transactions', authMiddleware, driverOnly, async (req, res) => {
    try {
        const transactions = await walletModel.getTransactions(req.user.id);
        res.json({
            success: true,
            data: { transactions }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
    }
});


// Add money to wallet
router.post('/wallet/add-money', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid amount is required' });
        }
        if (amount > 50000) {
            return res.status(400).json({ success: false, message: 'Maximum ₹50,000 can be added at once' });
        }
        const result = await walletModel.addMoney(req.user.id, amount);
        res.json({
            success: true,
            message: `₹${amount} added to wallet successfully!`,
            data: { balance: result.balance, transaction: result.transaction }
        });
    } catch (error) {
        console.error('Add money error:', error);
        res.status(500).json({ success: false, message: 'Failed to add money', error: error.message });
    }
});

// ==================== SUBSCRIPTION ENDPOINTS ====================
const subscriptionModel = require('../models/subscriptionModel');

// Get subscription plans
router.get('/subscription/plans', async (req, res) => {
    try {
        const plans = await subscriptionModel.getPlans('driver');
        res.json({ success: true, data: { plans } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch plans', error: error.message });
    }
});

// Get my active subscription
router.get('/subscription/my', authMiddleware, driverOnly, async (req, res) => {
    try {
        const subscription = await subscriptionModel.getActiveSubscription(req.user.id);
        res.json({ success: true, data: { subscription } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch subscription', error: error.message });
    }
});

// Subscribe to a plan
router.post('/subscription/subscribe', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { planId } = req.body;
        if (!planId) {
            return res.status(400).json({ success: false, message: 'Plan ID is required' });
        }

        const plan = await subscriptionModel.getPlanById(planId);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }

        // Check existing subscription
        const existing = await subscriptionModel.getActiveSubscription(req.user.id);
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: 'You already have an active subscription. Wait for it to expire or cancel first.' 
            });
        }

        // Check wallet balance
        const wallet = await walletModel.getWallet(req.user.id);
        if (wallet.balance < plan.amount) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance. Need ₹${plan.amount}, have ₹${wallet.balance}.`,
                data: { required: plan.amount, available: wallet.balance, deficit: plan.amount - wallet.balance }
            });
        }

        // Deduct and subscribe
        await walletModel.deductMoney(req.user.id, plan.amount, `Subscription: ${plan.name} Plan`);
        const subscription = await subscriptionModel.createSubscription(req.user.id, 'driver', planId);
        const updatedWallet = await walletModel.getWallet(req.user.id);

        res.json({
            success: true,
            message: `Subscribed to ${plan.name} plan!`,
            data: { subscription, newBalance: updatedWallet.balance }
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to subscribe' });
    }
});

// Cancel subscription
router.post('/subscription/cancel', authMiddleware, driverOnly, async (req, res) => {
    try {
        const subscription = await subscriptionModel.getActiveSubscription(req.user.id);
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No active subscription found' });
        }
        await subscriptionModel.cancelSubscription(subscription.id);
        res.json({ success: true, message: 'Subscription cancelled' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to cancel', error: error.message });
    }
});

// ==================== VEHICLE MANAGEMENT ENDPOINTS ====================

// Check which drivers are using given vehicle numbers (for sharing/availability)
router.post('/vehicles/check-availability', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { vehicleNumbers } = req.body;
        if (!vehicleNumbers || !Array.isArray(vehicleNumbers)) {
            return res.status(400).json({ success: false, message: 'vehicleNumbers array required' });
        }

        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const { docClient, TABLE_NAMES } = require('../config/aws');
        const { normalizeVehicleNumber } = require('../models/driverModel');

        // Get all drivers
        const allDrivers = await docClient.send(new ScanCommand({ TableName: TABLE_NAMES.drivers }));
        const drivers = allDrivers.Items || [];

        const result = {};
        for (const vNum of vehicleNumbers) {
            const normalized = normalizeVehicleNumber(vNum);
            if (!normalized) { result[vNum] = { isFree: true, isInUse: false }; continue; }

            // Find any OTHER driver currently using this vehicle (active or as primary)
            const usedBy = drivers.find(d => {
                if (d.id === req.user.id) return false; // skip self
                const dActive = normalizeVehicleNumber(d.activeVehicleNumber);
                const dPrimary = normalizeVehicleNumber(d.vehicleNumber);
                // Check if the vehicle is in their vehicles array too
                const inArray = (d.vehicles || []).some(v => normalizeVehicleNumber(v.vehicleNumber || v.registration_number) === normalized);
                return (dActive === normalized || dPrimary === normalized || inArray) && d.isOnline;
            });

            if (usedBy) {
                result[vNum] = { isFree: false, isInUse: true, inUseBy: usedBy.name, inUseById: usedBy.id };
            } else {
                result[vNum] = { isFree: true, isInUse: false };
            }
        }

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Vehicle check-availability error:', error);
        res.status(500).json({ success: false, message: 'Failed to check', error: error.message });
    }
});

// Set active vehicle for a driver
router.post('/vehicles/set-active', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { vehicleNumber } = req.body;
        if (!vehicleNumber) return res.status(400).json({ success: false, message: 'vehicleNumber required' });

        await updateDriver(req.user.id, { activeVehicleNumber: vehicleNumber });
        res.json({ success: true, message: 'Active vehicle updated' });
    } catch (error) {
        console.error('Set active vehicle error:', error);
        res.status(500).json({ success: false, message: 'Failed to set active vehicle', error: error.message });
    }
});

// Free (release) active vehicle so others can use it
router.post('/vehicles/free', authMiddleware, driverOnly, async (req, res) => {
    try {
        await updateDriver(req.user.id, { activeVehicleNumber: null });
        res.json({ success: true, message: 'Vehicle freed successfully' });
    } catch (error) {
        console.error('Free vehicle error:', error);
        res.status(500).json({ success: false, message: 'Failed to free vehicle', error: error.message });
    }
});

// ==================== DRIVER REFERRAL ENDPOINTS ====================

// Get driver referral info (get or create)
router.get('/referral', authMiddleware, driverOnly, async (req, res) => {
    try {
        const referralModel = require('../models/referralModel');
        const subscriptionModel = require('../models/subscriptionModel');
        const referral = await referralModel.getOrCreateReferral(req.user.id, req.user.phone || '0000000000');

        // Enrich referredUsers with their active plan + subscription amount
        const enrichedUsers = await Promise.all(
            (referral.referredUsers || []).map(async (u) => {
                try {
                    const sub = await subscriptionModel.getActiveSubscription(u.userId);
                    return {
                        ...u,
                        activePlan: sub ? sub.planName : null,
                        subscriptionAmount: sub ? sub.amount : null,
                        isSubscribed: !!sub
                    };
                } catch (_) {
                    return { ...u, activePlan: null, subscriptionAmount: null, isSubscribed: false };
                }
            })
        );

        res.json({
            success: true,
            data: {
                code: referral.code,
                count: referral.totalReferrals || 0,
                earnings: referral.earnings || 0,
                referredUsers: enrichedUsers
            }
        });
    } catch (error) {
        console.error('Get driver referral error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch referral info', error: error.message });
    }
});

// Apply referral code (driver enters someone's code at registration/profile)
router.post('/referral/apply', authMiddleware, driverOnly, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ success: false, message: 'Referral code is required' });
        }
        const referralModel = require('../models/referralModel');
        const result = await referralModel.applyReferralCode(
            code.toUpperCase(),
            req.user.id,
            req.user.name,
            true // immediate bonus
        );
        res.json({
            success: true,
            message: `Referral applied! ₹${result.bonus} bonus credited to referrer.`,
            data: result
        });
    } catch (error) {
        console.error('Apply driver referral error:', error);
        res.status(400).json({ success: false, message: error.message || 'Failed to apply referral' });
    }
});

// ==================== CATCH-ALL: Get driver by ID ====================
// IMPORTANT: This MUST be the last route because /:id matches everything
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
