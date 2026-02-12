/**
 * Vendor Routes - Registration, Login, Profile management
 * Phone-only authentication (no password)
 */
const express = require('express');
const router = express.Router();
const { createVendor, findVendorByPhone, findVendorById, updateVendor } = require('../models/vendorModel');
const { generateToken, authMiddleware, vendorOnly } = require('../middleware/auth');

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

        const existingVendor = await findVendorByPhone(phone);
        
        res.json({
            success: true,
            available: !existingVendor,
            exists: !!existingVendor,
            message: existingVendor ? 'Phone number already registered' : 'Phone number is available'
        });
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
        // Scan vendors table for matching aadharNumber
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const { docClient, TABLES } = require('../config/aws');
        const result = await docClient.send(new ScanCommand({
            TableName: TABLES.VENDORS,
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

// Check if PAN number is already registered (real-time validation)
router.post('/check-pan', async (req, res) => {
    try {
        const { pan } = req.body;
        if (!pan || pan.length < 10) {
            return res.json({ success: true, available: false, message: 'Enter valid 10-character PAN number' });
        }
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const { docClient, TABLES } = require('../config/aws');
        const result = await docClient.send(new ScanCommand({
            TableName: TABLES.VENDORS,
            FilterExpression: 'panNumber = :pan',
            ExpressionAttributeValues: { ':pan': pan.toUpperCase() }
        }));
        const exists = result.Items && result.Items.length > 0;
        res.json({
            success: true,
            available: !exists,
            message: exists ? 'PAN number already registered' : 'PAN number is available'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed', error: error.message });
    }
});

// Register new vendor (phone-only, no password)
router.post('/register', async (req, res) => {
    try {
        const { businessName, ownerName, phone } = req.body;

        // Validate required fields (no password needed)
        if (!businessName || !ownerName || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Business name, owner name, and phone are required'
            });
        }

        // Check if phone already exists
        const existingVendor = await findVendorByPhone(phone);
        if (existingVendor) {
            return res.status(409).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        // Create vendor with all provided fields
        const vendor = await createVendor({
            businessName,
            ownerName,
            phone,
            aadharNumber: req.body.aadharNumber || null,
            panNumber: req.body.panNumber || null,
            dob: req.body.dob || null,
            city: req.body.city || null,
            documents: req.body.documents || {}
        });

        // Generate token
        const token = generateToken({
            id: vendor.id,
            phone: vendor.phone,
            userType: 'vendor'
        });

        res.status(201).json({
            success: true,
            message: 'Vendor registered successfully',
            data: {
                vendor,
                token
            }
        });
    } catch (error) {
        console.error('Vendor registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Vendor login (phone-only, no password)
router.post('/login', async (req, res) => {
    try {
        const { phone } = req.body;

        // Validate required fields
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Find vendor by phone
        const vendor = await findVendorByPhone(phone);
        if (!vendor) {
            // Auto-register if not found (for seamless experience)
            return res.status(401).json({
                success: false,
                message: 'Phone number not registered. Please register first.'
            });
        }

        // Generate token
        const token = generateToken({
            id: vendor.id,
            phone: vendor.phone,
            userType: 'vendor'
        });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                vendor,
                token
            }
        });
    } catch (error) {
        console.error('Vendor login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Get vendor profile (protected)
router.get('/profile', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const vendor = await findVendorById(req.user.id);
        
        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: 'Vendor not found'
            });
        }

        res.json({
            success: true,
            data: vendor
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

// Update vendor profile (protected)
router.put('/profile', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const updates = req.body;
        
        // Don't allow updating sensitive fields
        delete updates.id;
        delete updates.phone;

        const updatedVendor = await updateVendor(req.user.id, updates);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedVendor
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

// ==================== TRIP MANAGEMENT ENDPOINTS ====================

const bookingModel = require('../models/bookingModel');

// Get all vendor trips
router.get('/trips', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { status } = req.query;
        const trips = await bookingModel.getVendorBookings(req.user.id, status || null);
        
        res.json({
            success: true,
            data: { trips }
        });
    } catch (error) {
        console.error('Get trips error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trips',
            error: error.message
        });
    }
});

// Get draft trips
router.get('/trips/drafts', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const drafts = await bookingModel.getDraftBookings(req.user.id);
        
        res.json({
            success: true,
            data: { trips: drafts }
        });
    } catch (error) {
        console.error('Get drafts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch drafts',
            error: error.message
        });
    }
});

// Create new trip (draft or pending)
router.post('/trips', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const tripData = {
            ...req.body,
            vendorId: req.user.id,
            status: req.body.status || 'draft'
        };
        
        const trip = await bookingModel.createBooking(tripData);
        
        res.status(201).json({
            success: true,
            message: tripData.status === 'draft' ? 'Trip saved as draft' : 'Trip created successfully',
            data: { trip }
        });
    } catch (error) {
        console.error('Create trip error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create trip',
            error: error.message
        });
    }
});

// Get trip by ID
router.get('/trips/:id', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const trip = await bookingModel.getBookingById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found'
            });
        }
        
        if (trip.vendorId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }
        
        res.json({
            success: true,
            data: { trip }
        });
    } catch (error) {
        console.error('Get trip error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trip',
            error: error.message
        });
    }
});

// Update trip
router.put('/trips/:id', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const trip = await bookingModel.getBookingById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found'
            });
        }
        
        if (trip.vendorId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }
        
        // Only allow updating drafts or pending trips
        if (!['draft', 'pending'].includes(trip.status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update trip with status: ' + trip.status
            });
        }
        
        const updates = req.body;
        delete updates.id;
        delete updates.vendorId;
        
        const updatedTrip = await bookingModel.updateBooking(req.params.id, updates);
        
        res.json({
            success: true,
            message: 'Trip updated successfully',
            data: { trip: updatedTrip }
        });
    } catch (error) {
        console.error('Update trip error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update trip',
            error: error.message
        });
    }
});

// Publish trip (draft → pending)
router.post('/trips/:id/publish', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const trip = await bookingModel.getBookingById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found'
            });
        }
        
        if (trip.vendorId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }
        
        if (trip.status !== 'draft' && trip.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only draft or pending trips can be published'
            });
        }
        
        const publishedTrip = await bookingModel.publishBooking(req.params.id);
        
        res.json({
            success: true,
            message: 'Trip published to nearby drivers!',
            data: { trip: publishedTrip }
        });
    } catch (error) {
        console.error('Publish trip error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to publish trip',
            error: error.message
        });
    }
});

// Cancel trip
router.post('/trips/:id/cancel', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const trip = await bookingModel.getBookingById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found'
            });
        }
        
        if (trip.vendorId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }
        
        const cancelledTrip = await bookingModel.updateBooking(req.params.id, { status: 'cancelled' });
        
        res.json({
            success: true,
            message: 'Trip cancelled',
            data: { trip: cancelledTrip }
        });
    } catch (error) {
        console.error('Cancel trip error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel trip',
            error: error.message
        });
    }
});

// Delete draft trip
router.delete('/trips/:id', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const trip = await bookingModel.getBookingById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found'
            });
        }
        
        if (trip.vendorId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access'
            });
        }
        
        if (trip.status !== 'draft') {
            return res.status(400).json({
                success: false,
                message: 'Only draft trips can be deleted'
            });
        }
        
        await bookingModel.deleteBooking(req.params.id);
        
        res.json({
            success: true,
            message: 'Draft deleted successfully'
        });
    } catch (error) {
        console.error('Delete trip error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete trip',
            error: error.message
        });
    }
});

// ==================== WALLET ENDPOINTS ====================

const walletModel = require('../models/walletModel');

// Get wallet balance
router.get('/wallet', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const wallet = await walletModel.getWallet(req.user.id);
        
        res.json({
            success: true,
            data: { 
                balance: wallet.balance,
                totalEarnings: wallet.totalEarnings || 0
            }
        });
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wallet',
            error: error.message
        });
    }
});

// Get wallet transactions
router.get('/wallet/transactions', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const transactions = await walletModel.getTransactions(req.user.id);
        
        res.json({
            success: true,
            data: { transactions }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions',
            error: error.message
        });
    }
});

// ==================== REFERRAL ENDPOINTS ====================

const referralModel = require('../models/referralModel');

// Get referral info
router.get('/referral', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const referral = await referralModel.getOrCreateReferral(req.user.id, req.user.phone || '0000000000');
        
        res.json({
            success: true,
            data: {
                code: referral.code,
                count: referral.totalReferrals || 0,
                earnings: referral.earnings || 0,
                referredUsers: referral.referredUsers || []
            }
        });
    } catch (error) {
        console.error('Get referral error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral info',
            error: error.message
        });
    }
});

// Apply referral code
router.post('/referral/apply', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Referral code is required'
            });
        }
        
        const result = await referralModel.applyReferralCode(
            code,
            req.user.id,
            req.user.name || 'Vendor'
        );
        
        // Credit bonus to referrer's wallet
        if (result.success) {
            await walletModel.addTransaction(result.referrerId, {
                type: 'credit',
                amount: result.bonus,
                description: 'Referral Bonus'
            });
        }
        
        res.json({
            success: true,
            message: `Referral applied! ${result.bonus} bonus credited to referrer.`
        });
    } catch (error) {
        console.error('Apply referral error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== STATS ENDPOINTS ====================

// ==================== DRIVER MANAGEMENT ENDPOINTS ====================
const driverModel = require('../models/driverModel'); // Ensure this is required at top if not global, but better to fetch usage

// Get blocked drivers (Commission Payments Pending)
router.get('/drivers/blocked', authMiddleware, vendorOnly, async (req, res) => {
    try {
        // Find drivers with status 'blocked_for_payment'
        const blockedDrivers = await driverModel.findDrivers({ status: 'blocked_for_payment' });
        
        res.json({
            success: true,
            data: { drivers: blockedDrivers }
        });
    } catch (error) {
        console.error('Get blocked drivers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch blocked drivers',
            error: error.message
        });
    }
});

// Unblock driver (Mark Commission as Paid)
router.post('/drivers/:id/unblock', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Update driver status to 'active'
        const updatedDriver = await driverModel.updateDriver(id, { status: 'active' });
        
        // Log transaction (optional but recommended)
        // await walletModel.addTransaction(req.user.id, { type: 'credit', amount: commission, description: `Commission from ${updatedDriver.name}` });

        res.json({
            success: true,
            message: 'Driver unblocked and commission marked as paid',
            data: { driver: updatedDriver }
        });
    } catch (error) {
        console.error('Unblock driver error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unblock driver',
            error: error.message
        });
    }
});

// Get dashboard stats
router.get('/stats/dashboard', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const vendorId = req.user.id;
        
        // Parallel fetch for verify performance
        const [
            allTrips,
            activeTrips,
            pendingApprovals,
            completedTrips
        ] = await Promise.all([
            bookingModel.getVendorBookings(vendorId), // All
            bookingModel.getVendorBookings(vendorId, 'in_progress'),
            bookingModel.getVendorBookings(vendorId, 'driver_accepted'), // Pending Approvals
            bookingModel.getVendorBookings(vendorId, 'completed')
        ]);
        
        // Calculate earnings for today
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        
        const todayEarnings = completedTrips
            .filter(t => new Date(t.endTime || t.updatedAt) >= startOfDay)
            .reduce((sum, t) => sum + (t.totalAmount || 0), 0);
            
        res.json({
            success: true,
            data: {
                totalTrips: allTrips.length,
                activeTrips: activeTrips.length,
                pendingApprovals: pendingApprovals.length,
                todayEarnings: todayEarnings,
                currency: 'INR'
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard stats',
            error: error.message
        });
    }
});

module.exports = router;
