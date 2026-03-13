const express = require('express');
const router = express.Router();
const { docClient, TABLES } = require('../config/aws');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const adminModel = require('../models/adminModel');
const bookingModel = require('../models/bookingModel');
const { authMiddleware, adminOnly, generateToken, checkPermission } = require('../middleware/auth');


router.get('/', (req, res) => {
    res.json({ message: 'Admin API working' });
});

// Admin Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }

        const admin = await adminModel.login(username, password);
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = generateToken({
            id: admin.id,
            username: admin.username,
            role: admin.role,
            permissions: admin.permissions,
            userType: 'admin'
        });

        res.json({ success: true, token, admin });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
});

// Get all vendors
router.get('/vendors', authMiddleware, adminOnly, checkPermission('vendors'), async (req, res) => {
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: TABLES.VENDORS,
        }));
        res.json({ success: true, count: result.Items?.length || 0, data: result.Items || [] });
    } catch (error) {
        console.error('Admin API error fetching vendors:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch vendors', error: error.message });
    }
});

// Get all drivers
router.get('/drivers', authMiddleware, adminOnly, checkPermission('drivers'), async (req, res) => {
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: TABLES.DRIVERS,
        }));
        res.json({ success: true, count: result.Items?.length || 0, data: result.Items || [] });
    } catch (error) {
        console.error('Admin API error fetching drivers:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch drivers', error: error.message });
    }
});

// Get all customers (derived from bookings and solo rides)
router.get('/customers', authMiddleware, adminOnly, async (req, res, next) => {
    // Accessible by anyone with 'rides' OR 'vendors' permission
    if (req.user.role === 'super-admin' || 
        (req.user.permissions && (req.user.permissions.includes('rides') || req.user.permissions.includes('vendors')))) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied. Requires rides or vendors permission.' });
}, async (req, res) => {
    try {
        const bookingsResult = await docClient.send(new ScanCommand({
            TableName: TABLES.BOOKINGS,
            ProjectionExpression: 'customerName, customerPhone, customerLanguage'
        }));
        
        const soloRidesResult = await docClient.send(new ScanCommand({
            TableName: TABLES.SOLO_RIDES,
            ProjectionExpression: 'customerName, customerPhone, customerLanguage'
        }));

        const allRides = [...(bookingsResult.Items || []), ...(soloRidesResult.Items || [])];
        
        // Deduplicate customers based on phone number
        const uniqueCustomersMap = new Map();
        allRides.forEach(ride => {
            if (ride.customerPhone && !uniqueCustomersMap.has(ride.customerPhone)) {
                uniqueCustomersMap.set(ride.customerPhone, {
                    name: ride.customerName || 'Unknown',
                    phone: ride.customerPhone,
                    language: ride.customerLanguage || 'Unknown'
                });
            }
        });
        
        const customers = Array.from(uniqueCustomersMap.values());
        
        res.json({ success: true, count: customers.length, data: customers });
    } catch (error) {
        console.error('Admin API error fetching customers:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch customers', error: error.message });
    }
});

// Get detailed dashboard metrics
router.get('/detailed-dashboard', authMiddleware, adminOnly, async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Vendors
        const vendorsResult = await docClient.send(new ScanCommand({ TableName: TABLES.VENDORS }));
        const totalVendors = vendorsResult.Items?.length || 0;
        const activeVendorsToday = (vendorsResult.Items || []).filter(v => 
            v.updatedAt && v.updatedAt.startsWith(todayStr)
        ).length;

        // 2. Drivers
        const driversResult = await docClient.send(new ScanCommand({ TableName: TABLES.DRIVERS }));
        const totalDrivers = driversResult.Items?.length || 0;
        const onlineDrivers = (driversResult.Items || []).filter(d => d.isOnline === true).length;
        const activeDriversToday = (driversResult.Items || []).filter(d => 
            d.updatedAt && d.updatedAt.startsWith(todayStr)
        ).length;
        const verifiedDrivers = (driversResult.Items || []).filter(d => d.isVerified === true).length;
        const pendingDrivers = totalDrivers - verifiedDrivers;
        const verifiedVendors = (vendorsResult.Items || []).filter(v => v.isVerified === true).length;
        const pendingVendors = totalVendors - verifiedVendors;
        const blockedDrivers = (driversResult.Items || []).filter(d => d.status === 'blocked').length;
        const blockedVendors = (vendorsResult.Items || []).filter(v => v.status === 'blocked').length;

        // 3. Rides
        const bookingsResult = await docClient.send(new ScanCommand({ TableName: TABLES.BOOKINGS }));
        const soloRidesResult = await docClient.send(new ScanCommand({ TableName: TABLES.SOLO_RIDES }));
        
        const allRides = [...(bookingsResult.Items || []), ...(soloRidesResult.Items || [])];
        const todayRides = allRides.filter(r => r.createdAt && r.createdAt.startsWith(todayStr));
        
        const completedToday = todayRides.filter(r => r.status === 'completed' || r.paymentStatus === 'completed').length;
        const activeToday = todayRides.filter(r => r.status !== 'completed' && r.status !== 'cancelled').length;

        res.json({
            success: true,
            data: {
                totalVendors,
                activeVendorsToday,
                verifiedVendors,
                pendingVendors,
                blockedVendors,
                totalDrivers,
                onlineDrivers,
                activeDriversToday,
                verifiedDrivers,
                pendingDrivers,
                blockedDrivers,
                totalRidesToday: todayRides.length,
                totalRidesAllTime: allRides.length,
                activeRidesToday: activeToday,
                completedRidesToday: completedToday
            }
        });
    } catch (error) {
        console.error('Admin API error fetching detailed dashboard:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard metrics', error: error.message });
    }
});

// Get all rides
router.get('/rides', authMiddleware, adminOnly, checkPermission('rides'), async (req, res) => {
    try {
        const bookingsResult = await docClient.send(new ScanCommand({ TableName: TABLES.BOOKINGS }));
        const soloRidesResult = await docClient.send(new ScanCommand({ TableName: TABLES.SOLO_RIDES }));

        const allRides = [
            ...(bookingsResult.Items || []).map(r => ({ ...r, source: 'booking' })),
            ...(soloRidesResult.Items || []).map(r => ({ ...r, source: 'solo_ride' }))
        ];

        allRides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, count: allRides.length, data: allRides });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch rides' });
    }
});

// Get all self rides
router.get('/self-rides', authMiddleware, adminOnly, checkPermission('rides'), async (req, res) => {
    try {
        const result = await docClient.send(new ScanCommand({ TableName: TABLES.SOLO_RIDES }));
        const selfRides = result.Items || [];
        selfRides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, count: selfRides.length, data: selfRides });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch self rides' });
    }
});

// Cancel a ride (Admin override)
router.delete('/rides/:id', authMiddleware, adminOnly, checkPermission('rides'), async (req, res) => {
    try {
        const { id } = req.params;
        const { source } = req.query; // 'booking' or 'solo_ride'
        const table = source === 'solo_ride' ? TABLES.SOLO_RIDES : TABLES.BOOKINGS;

        await docClient.send(new UpdateCommand({
            TableName: table,
            Key: { id },
            UpdateExpression: 'SET #status = :s, updatedAt = :u',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':s': 'cancelled', ':u': new Date().toISOString() }
        }));

        await adminModel.logAction(req.user.id, req.user.username, 'CANCEL_RIDE', { rideId: id, source });
        res.json({ success: true, message: 'Ride cancelled by admin' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to cancel ride' });
    }
});

// Verify ride payment (Admin override)
router.patch('/rides/:id/verify-payment', authMiddleware, adminOnly, checkPermission('rides'), async (req, res) => {
    try {
        const { id } = req.params;
        const { source } = req.body;
        const table = source === 'solo_ride' ? TABLES.SOLO_RIDES : TABLES.BOOKINGS;

        await docClient.send(new UpdateCommand({
            TableName: table,
            Key: { id },
            UpdateExpression: 'SET #status = :s, paymentStatus = :p, updatedAt = :u',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { 
                ':s': 'completed', 
                ':p': 'completed',
                ':u': new Date().toISOString() 
            }
        }));

        await adminModel.logAction(req.user.id, req.user.username, 'VERIFY_PAYMENT', { rideId: id, source });
        res.json({ success: true, message: 'Payment verified and trip finished' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to verify payment' });
    }
});

// Verify or Reject driver
router.patch('/drivers/:id/verify', authMiddleware, adminOnly, checkPermission('drivers'), async (req, res) => {
    try {
        const { id } = req.params;
        const { verified, rejectionReason } = req.body;
        const now = new Date().toISOString();
        
        let updateExpression, expressionValues, expressionNames;

        if (verified) {
            // Fetch driver to auto-verify their first/active vehicle
            const { GetCommand } = require('@aws-sdk/lib-dynamodb');
            const driverData = await docClient.send(new GetCommand({ TableName: TABLES.DRIVERS, Key: { id } }));
            let vehicles = driverData.Item?.vehicles || [];
            if (vehicles.length > 0) {
                // Auto verify the very first vehicle if none is verified
                const hasVerified = vehicles.some(v => v.verified || v.vehicleVerified);
                if (!hasVerified) {
                    vehicles[0].verified = true;
                    vehicles[0].vehicleVerified = true;
                    vehicles[0].verifiedBy = req.user.id;
                    vehicles[0].verifiedByName = req.user.username;
                    vehicles[0].verifiedAt = now;
                }
            }

            // APPROVE: set verified, clear rejection fields, update vehicles
            updateExpression = 'SET isVerified = :verified, verificationStatus = :vs, vehicles = :vehicles, updatedAt = :now, verifiedBy = :adminId, verifiedByName = :adminName, verifiedAt = :now REMOVE rejectionReason, rejectedAt, rejectedBy, rejectedByName';
            expressionValues = { 
                ':verified': true, 
                ':vs': 'verified', 
                ':vehicles': vehicles,
                ':now': now, 
                ':adminId': req.user.id, 
                ':adminName': req.user.username 
            };
        } else {
            // REJECT: set rejected with reason
            updateExpression = 'SET isVerified = :verified, verificationStatus = :vs, rejectionReason = :reason, rejectedAt = :now, rejectedBy = :adminId, rejectedByName = :adminName, updatedAt = :now REMOVE verifiedBy, verifiedByName, verifiedAt';
            expressionValues = { 
                ':verified': false, 
                ':vs': 'rejected', 
                ':reason': rejectionReason || 'Your registration was rejected by admin.', 
                ':now': now, 
                ':adminId': req.user.id, 
                ':adminName': req.user.username 
            };
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionValues
        }));

        await adminModel.logAction(req.user.id, req.user.username, verified ? 'VERIFY_DRIVER' : 'REJECT_DRIVER', { driverId: id, rejectionReason: rejectionReason || null });
        res.json({ success: true, message: verified ? 'Driver approved and primary vehicle verified' : 'Driver rejected' });
    } catch (error) {
        console.error('Verify driver error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify driver' });
    }
});

// Verify or Reject vendor
router.patch('/vendors/:id/verify', authMiddleware, adminOnly, checkPermission('vendors'), async (req, res) => {
    try {
        const { id } = req.params;
        const { verified, rejectionReason } = req.body;
        const now = new Date().toISOString();
        
        let updateExpression, expressionValues;

        if (verified) {
            updateExpression = 'SET isVerified = :verified, verificationStatus = :vs, updatedAt = :now, verifiedBy = :adminId, verifiedByName = :adminName, verifiedAt = :now REMOVE rejectionReason, rejectedAt, rejectedBy, rejectedByName';
            expressionValues = { ':verified': true, ':vs': 'verified', ':now': now, ':adminId': req.user.id, ':adminName': req.user.username };
        } else {
            updateExpression = 'SET isVerified = :verified, verificationStatus = :vs, rejectionReason = :reason, rejectedAt = :now, rejectedBy = :adminId, rejectedByName = :adminName, updatedAt = :now REMOVE verifiedBy, verifiedByName, verifiedAt';
            expressionValues = { ':verified': false, ':vs': 'rejected', ':reason': rejectionReason || 'Your registration was rejected by admin.', ':now': now, ':adminId': req.user.id, ':adminName': req.user.username };
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLES.VENDORS,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionValues
        }));

        await adminModel.logAction(req.user.id, req.user.username, verified ? 'VERIFY_VENDOR' : 'REJECT_VENDOR', { vendorId: id, rejectionReason: rejectionReason || null });
        res.json({ success: true, message: verified ? 'Vendor approved' : 'Vendor rejected' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to verify vendor' });
    }
});

// Block/Unblock driver (with reason + timestamp history)
router.patch('/drivers/:id/block', authMiddleware, adminOnly, checkPermission('drivers'), async (req, res) => {
    try {
        const { id } = req.params;
        const { blocked, blockReason } = req.body;
        const now = new Date().toISOString();
        
        let updateExpression, expressionValues;
        
        if (blocked) {
            updateExpression = 'SET #status = :status, updatedAt = :now, blockedBy = :adminId, blockedByName = :adminName, blockedAt = :now, blockReason = :reason';
            expressionValues = {
                ':status': 'blocked',
                ':now': now,
                ':adminId': req.user.id,
                ':adminName': req.user.username,
                ':reason': blockReason || 'No reason provided'
            };
        } else {
            updateExpression = 'SET #status = :status, updatedAt = :now, unblockedBy = :adminId, unblockedByName = :adminName, unblockedAt = :now REMOVE blockReason';
            expressionValues = {
                ':status': 'active',
                ':now': now,
                ':adminId': req.user.id,
                ':adminName': req.user.username
            };
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: expressionValues
        }));

        await adminModel.logAction(req.user.id, req.user.username, blocked ? 'BLOCK_DRIVER' : 'UNBLOCK_DRIVER', { driverId: id, blockReason: blockReason || null });
        res.json({ success: true, message: blocked ? 'Driver blocked' : 'Driver unblocked' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update driver' });
    }
});

// Block/Unblock vendor (with reason + timestamp history)
router.patch('/vendors/:id/block', authMiddleware, adminOnly, checkPermission('vendors'), async (req, res) => {
    try {
        const { id } = req.params;
        const { blocked, blockReason } = req.body;
        const now = new Date().toISOString();
        
        let updateExpression, expressionValues;
        
        if (blocked) {
            updateExpression = 'SET #status = :status, updatedAt = :now, blockedBy = :adminId, blockedByName = :adminName, blockedAt = :now, blockReason = :reason';
            expressionValues = {
                ':status': 'blocked',
                ':now': now,
                ':adminId': req.user.id,
                ':adminName': req.user.username,
                ':reason': blockReason || 'No reason provided'
            };
        } else {
            updateExpression = 'SET #status = :status, updatedAt = :now, unblockedBy = :adminId, unblockedByName = :adminName, unblockedAt = :now REMOVE blockReason';
            expressionValues = {
                ':status': 'active',
                ':now': now,
                ':adminId': req.user.id,
                ':adminName': req.user.username
            };
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLES.VENDORS,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: expressionValues
        }));

        await adminModel.logAction(req.user.id, req.user.username, blocked ? 'BLOCK_VENDOR' : 'UNBLOCK_VENDOR', { vendorId: id, blockReason: blockReason || null });
        res.json({ success: true, message: blocked ? 'Vendor blocked' : 'Vendor unblocked' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update vendor' });
    }
});

// Get all blocked users (drivers + vendors)
router.get('/blocked-users', authMiddleware, adminOnly, async (req, res) => {
    try {
        const driversResult = await docClient.send(new ScanCommand({
            TableName: TABLES.DRIVERS,
            FilterExpression: '#status = :blocked',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':blocked': 'blocked' }
        }));
        const vendorsResult = await docClient.send(new ScanCommand({
            TableName: TABLES.VENDORS,
            FilterExpression: '#status = :blocked',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':blocked': 'blocked' }
        }));

        const blockedDrivers = (driversResult.Items || []).map(d => ({ ...d, userType: 'driver' }));
        const blockedVendors = (vendorsResult.Items || []).map(v => ({ ...v, userType: 'vendor' }));
        const allBlocked = [...blockedDrivers, ...blockedVendors];
        allBlocked.sort((a, b) => new Date(b.blockedAt || b.updatedAt) - new Date(a.blockedAt || a.updatedAt));

        res.json({ success: true, count: allBlocked.length, data: allBlocked });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch blocked users' });
    }
});

// ==================== CUSTOMER HISTORY ====================
router.get('/customer-history/:phone', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { phone } = req.params;
        
        // Get bookings for this customer
        const bookingsResult = await docClient.send(new ScanCommand({
            TableName: TABLES.BOOKINGS,
            FilterExpression: 'customerPhone = :phone',
            ExpressionAttributeValues: { ':phone': phone }
        }));
        
        // Get solo rides for this customer
        const soloRidesResult = await docClient.send(new ScanCommand({
            TableName: TABLES.SOLO_RIDES,
            FilterExpression: 'customerPhone = :phone',
            ExpressionAttributeValues: { ':phone': phone }
        }));

        const bookings = (bookingsResult.Items || []).map(r => ({ ...r, source: 'booking' }));
        const soloRides = (soloRidesResult.Items || []).map(r => ({ ...r, source: 'solo_ride' }));
        const allRides = [...bookings, ...soloRides];
        allRides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, count: allRides.length, data: allRides });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch customer history' });
    }
});

// ==================== ACTIVE DRIVERS (ONLINE) ====================
router.get('/active-drivers', authMiddleware, adminOnly, async (req, res) => {
    try {
        const driversResult = await docClient.send(new ScanCommand({
            TableName: TABLES.DRIVERS,
            FilterExpression: 'isOnline = :online AND isVerified = :verified',
            ExpressionAttributeValues: { ':online': true, ':verified': true }
        }));

        const activeDrivers = (driversResult.Items || []).sort((a, b) => 
            new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
        );

        res.json({ success: true, count: activeDrivers.length, data: activeDrivers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch active drivers' });
    }
});

// ==================== BIRTHDAY WISHES ====================
router.get('/birthdays', authMiddleware, adminOnly, async (req, res) => {
    try {
        const today = new Date();
        const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Scan drivers
        const driversResult = await docClient.send(new ScanCommand({ TableName: TABLES.DRIVERS }));
        const vendorsResult = await docClient.send(new ScanCommand({ TableName: TABLES.VENDORS }));
        
        // Get customers from bookings
        const bookingsResult = await docClient.send(new ScanCommand({
            TableName: TABLES.BOOKINGS,
            ProjectionExpression: 'customerName, customerPhone, customerDob'
        }));
        const soloResult = await docClient.send(new ScanCommand({
            TableName: TABLES.SOLO_RIDES,
            ProjectionExpression: 'customerName, customerPhone, customerDob'
        }));

        const birthdayUsers = [];

        // Check drivers
        for (const d of (driversResult.Items || [])) {
            if (d.dob) {
                const dob = d.dob.toString();
                // Support formats: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
                let mmdd = '';
                if (dob.includes('/')) {
                    const parts = dob.split('/');
                    mmdd = `${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else if (dob.startsWith('20') || dob.startsWith('19')) {
                    mmdd = dob.substring(5, 10);
                } else {
                    const parts = dob.split('-');
                    if (parts.length === 3) mmdd = `${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                if (mmdd === todayMMDD) {
                    birthdayUsers.push({ 
                        id: d.id, name: d.name, phone: d.phone, dob: d.dob,
                        userType: 'driver', profilePic: d.profilePic || d.profileImage,
                        birthdayWished: d.birthdayWished || false
                    });
                }
            }
        }

        // Check vendors
        for (const v of (vendorsResult.Items || [])) {
            if (v.dob) {
                const dob = v.dob.toString();
                let mmdd = '';
                if (dob.includes('/')) {
                    const parts = dob.split('/');
                    mmdd = `${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else if (dob.startsWith('20') || dob.startsWith('19')) {
                    mmdd = dob.substring(5, 10);
                } else {
                    const parts = dob.split('-');
                    if (parts.length === 3) mmdd = `${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                if (mmdd === todayMMDD) {
                    birthdayUsers.push({ 
                        id: v.id, name: v.ownerName || v.businessName, phone: v.phone, dob: v.dob,
                        userType: 'vendor', profilePic: v.profilePic || v.ownerPhoto,
                        birthdayWished: v.birthdayWished || false
                    });
                }
            }
        }

        // Check customers (deduplicated)
        const customerMap = new Map();
        for (const r of [...(bookingsResult.Items || []), ...(soloResult.Items || [])]) {
            if (r.customerDob && r.customerPhone && !customerMap.has(r.customerPhone)) {
                const dob = r.customerDob.toString();
                let mmdd = '';
                if (dob.includes('/')) {
                    const parts = dob.split('/');
                    mmdd = `${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else if (dob.startsWith('20') || dob.startsWith('19')) {
                    mmdd = dob.substring(5, 10);
                } else {
                    const parts = dob.split('-');
                    if (parts.length === 3) mmdd = `${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                if (mmdd === todayMMDD) {
                    birthdayUsers.push({ 
                        id: r.customerPhone, name: r.customerName, phone: r.customerPhone, dob: r.customerDob,
                        userType: 'customer', birthdayWished: false
                    });
                    customerMap.set(r.customerPhone, true);
                }
            }
        }

        res.json({ success: true, count: birthdayUsers.length, data: birthdayUsers });
    } catch (error) {
        console.error('Birthday fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch birthdays' });
    }
});

// Send birthday wish (mark as wished)
router.patch('/birthday-wish/:userType/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { userType, id } = req.params;
        let table;
        if (userType === 'driver') table = TABLES.DRIVERS;
        else if (userType === 'vendor') table = TABLES.VENDORS;
        else return res.json({ success: true, message: 'Wish noted for customer' });

        await docClient.send(new UpdateCommand({
            TableName: table,
            Key: { id },
            UpdateExpression: 'SET birthdayWished = :w, birthdayWishedAt = :at, birthdayWishedBy = :by',
            ExpressionAttributeValues: { ':w': true, ':at': new Date().toISOString(), ':by': req.user.username }
        }));

        await adminModel.logAction(req.user.id, req.user.username, 'BIRTHDAY_WISH', { userType, userId: id });
        res.json({ success: true, message: 'Birthday wish sent!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send wish' });
    }
});

// ==================== EXPIRY CHECKS ====================
router.get('/expiry-checks', authMiddleware, adminOnly, async (req, res) => {
    try {
        const driversResult = await docClient.send(new ScanCommand({
            TableName: TABLES.DRIVERS,
            FilterExpression: 'isVerified = :verified',
            ExpressionAttributeValues: { ':verified': true }
        }));

        const now = new Date();
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiryAlerts = [];

        for (const driver of (driversResult.Items || [])) {
            const checkFields = [
                { field: 'insuranceExpiry', label: 'Insurance' },
                { field: 'permitExpiry', label: 'Permit' },
                { field: 'fcExpiry', label: 'Fitness Certificate' },
                { field: 'licenceExpiry', label: 'Driving Licence' },
            ];

            // Check vehicles array if present
            const vehicles = driver.vehicles || [driver];
            for (const vehicle of vehicles) {
                for (const { field, label } of checkFields) {
                    const dateStr = vehicle[field];
                    if (dateStr) {
                        const expiryDate = new Date(dateStr);
                        if (!isNaN(expiryDate.getTime())) {
                            let urgency = 'safe';
                            if (expiryDate < now) urgency = 'expired';
                            else if (expiryDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) urgency = 'critical';
                            else if (expiryDate <= thirtyDaysLater) urgency = 'warning';
                            
                            if (urgency !== 'safe') {
                                expiryAlerts.push({
                                    driverId: driver.id,
                                    driverName: driver.name,
                                    driverPhone: driver.phone,
                                    profilePic: driver.profilePic || driver.profileImage,
                                    vehicleNumber: vehicle.vehicleNumber || vehicle.activeVehicleNumber || 'N/A',
                                    documentType: label,
                                    expiryDate: dateStr,
                                    urgency,
                                    daysRemaining: Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)),
                                });
                            }
                        }
                    }
                }
            }
        }

        // Sort by urgency (expired first, then critical, then warning)
        const urgencyOrder = { expired: 0, critical: 1, warning: 2 };
        expiryAlerts.sort((a, b) => (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3));

        res.json({ success: true, count: expiryAlerts.length, data: expiryAlerts });
    } catch (error) {
        console.error('Expiry checks error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch expiry checks' });
    }
});

// ==================== DASHBOARD BY DATE RANGE ====================
router.get('/dashboard-by-date', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate || new Date().toISOString().split('T')[0];
        const end = endDate || start;

        const bookingsResult = await docClient.send(new ScanCommand({ TableName: TABLES.BOOKINGS }));
        const soloRidesResult = await docClient.send(new ScanCommand({ TableName: TABLES.SOLO_RIDES }));

        const allRides = [...(bookingsResult.Items || []), ...(soloRidesResult.Items || [])];
        const filteredRides = allRides.filter(r => {
            if (!r.createdAt) return false;
            const rDate = r.createdAt.split('T')[0];
            return rDate >= start && rDate <= end;
        });

        const created = filteredRides.length;
        const published = filteredRides.filter(r => r.status !== 'draft').length;
        const completed = filteredRides.filter(r => r.status === 'completed' || r.status === 'finished').length;
        const cancelled = filteredRides.filter(r => r.status === 'cancelled').length;
        const active = filteredRides.filter(r => !['completed', 'finished', 'cancelled', 'draft'].includes(r.status)).length;

        res.json({
            success: true,
            data: {
                startDate: start,
                endDate: end,
                totalCreated: created,
                totalPublished: published,
                totalCompleted: completed,
                totalCancelled: cancelled,
                totalActive: active,
                rides: filteredRides.map(r => ({
                    id: r.id,
                    trackingId: r.trackingId,
                    status: r.status,
                    customerName: r.customerName,
                    createdAt: r.createdAt,
                    source: r.source || 'booking'
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch date-filtered dashboard' });
    }
});

// ==================== HELP CENTER / SOS ====================
router.get('/help-requests', authMiddleware, adminOnly, async (req, res) => {
    try {
        // Check if HELP_REQUESTS table exists, otherwise return empty
        try {
            const result = await docClient.send(new ScanCommand({
                TableName: 'uturn_help_requests'
            }));
            const requests = (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            res.json({ success: true, count: requests.length, data: requests });
        } catch (e) {
            // Table might not exist yet - return empty array
            res.json({ success: true, count: 0, data: [], message: 'Help requests table not yet created' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch help requests' });
    }
});

router.patch('/help-requests/:id/resolve', authMiddleware, adminOnly, async (req, res) => {
    try {
        await docClient.send(new UpdateCommand({
            TableName: 'uturn_help_requests',
            Key: { id: req.params.id },
            UpdateExpression: 'SET #status = :s, resolvedAt = :at, resolvedBy = :by',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':s': 'resolved',
                ':at': new Date().toISOString(),
                ':by': req.user.username
            }
        }));
        await adminModel.logAction(req.user.id, req.user.username, 'RESOLVE_HELP', { requestId: req.params.id });
        res.json({ success: true, message: 'Help request resolved' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to resolve help request' });
    }
});

// ==================== SUBSCRIPTION MANAGEMENT ====================
const subscriptionModel = require('../models/subscriptionModel');

router.get('/subscriptions', authMiddleware, adminOnly, checkPermission('subscriptions'), async (req, res) => {
    try {
        const { status } = req.query;
        const subscriptions = await subscriptionModel.getAllSubscriptions(status || null);
        
        const enriched = [];
        for (const sub of subscriptions) {
            let userName = 'Unknown';
            let userPhone = '';
            try {
                const table = sub.userType === 'driver' ? TABLES.DRIVERS : TABLES.VENDORS;
                const userResult = await docClient.send(new ScanCommand({
                    TableName: table,
                    FilterExpression: 'id = :id',
                    ExpressionAttributeValues: { ':id': sub.userId }
                }));
                if (userResult.Items?.length > 0) {
                    userName = userResult.Items[0].name || userResult.Items[0].ownerName || 'User';
                    userPhone = userResult.Items[0].phone || '';
                }
            } catch (e) {}
            enriched.push({ ...sub, userName, userPhone });
        }
        res.json({ success: true, count: enriched.length, data: enriched });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
    }
});

router.get('/subscription-stats', authMiddleware, adminOnly, checkPermission('subscriptions'), async (req, res) => {
    try {
        const stats = await subscriptionModel.getSubscriptionStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

router.post('/subscriptions/:id/cancel', authMiddleware, adminOnly, checkPermission('subscriptions'), async (req, res) => {
    try {
        await subscriptionModel.cancelSubscription(req.params.id);
        await adminModel.logAction(req.user.id, req.user.username, 'CANCEL_SUBSCRIPTION', { subscriptionId: req.params.id });
        res.json({ success: true, message: 'Subscription cancelled' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
});

router.get('/subscription-plans', authMiddleware, adminOnly, checkPermission('subscriptions'), async (req, res) => {
    try {
        const plans = await subscriptionModel.getPlans();
        res.json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
});

router.post('/subscription-plans', authMiddleware, adminOnly, checkPermission('subscriptions'), async (req, res) => {
    try {
        const planData = req.body;
        const newPlan = await subscriptionModel.createPlan(planData);
        await adminModel.logAction(req.user.id, req.user.username, 'CREATE_PLAN', { planName: planData.name });
        res.json({ success: true, message: 'Plan created successfully', data: newPlan });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create plan' });
    }
});

router.put('/subscription-plans/:id', authMiddleware, adminOnly, checkPermission('subscriptions'), async (req, res) => {
    try {
        const updatedPlan = await subscriptionModel.updatePlan(req.params.id, req.body);
        await adminModel.logAction(req.user.id, req.user.username, 'UPDATE_PLAN', { planId: req.params.id });
        res.json({ success: true, message: 'Plan updated successfully', data: updatedPlan });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update plan' });
    }
});

router.delete('/subscription-plans/:id', authMiddleware, adminOnly, checkPermission('subscriptions'), async (req, res) => {
    try {
        await subscriptionModel.deletePlan(req.params.id);
        await adminModel.logAction(req.user.id, req.user.username, 'DELETE_PLAN', { planId: req.params.id });
        res.json({ success: true, message: 'Plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete plan' });
    }
});

// ==================== SUB-ADMIN MANAGEMENT ====================

router.get('/sub-admins', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'super-admin') return res.status(403).json({ success: false, message: 'Super-admin access required' });
        const admins = await adminModel.getAllAdmins();
        res.json({ success: true, data: admins });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch sub-admins' });
    }
});

router.post('/sub-admins', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'super-admin') return res.status(403).json({ success: false, message: 'Super-admin access required' });
        const admin = await adminModel.createAdmin(req.body);
        res.json({ success: true, message: 'Sub-admin created', data: admin });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create sub-admin' });
    }
});

router.put('/sub-admins/:id/permissions', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'super-admin') return res.status(403).json({ success: false, message: 'Super-admin access required' });
        await adminModel.updatePermissions(req.params.id, req.body.permissions);
        res.json({ success: true, message: 'Permissions updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update permissions' });
    }
});

router.put('/sub-admins/:id/password', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'super-admin') return res.status(403).json({ success: false, message: 'Super-admin access required' });
        await adminModel.changePassword(req.params.id, req.body.password);
        res.json({ success: true, message: 'Password updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update password' });
    }
});

router.delete('/sub-admins/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'super-admin') return res.status(403).json({ success: false, message: 'Super-admin access required' });
        await adminModel.deleteAdmin(req.params.id);
        res.json({ success: true, message: 'Sub-admin deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete sub-admin' });
    }
});

router.get('/logs', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'super-admin') return res.status(403).json({ success: false, message: 'Super-admin access required' });
        const logs = await adminModel.getLogs(req.query.limit || 100);
        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
});

// ==================== UPDATE DRIVER FIELD (for driver-level vehicle verification) ====================
router.put('/driver/:id/update-field', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { field, value } = req.body;
        const allowedFields = ['vehicleVerified', 'vehicleRejectionReason'];
        if (!allowedFields.includes(field)) {
            return res.status(400).json({ success: false, message: 'Field not allowed' });
        }

        const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        
        let vehiclesUpdated = false;
        let updateExpression = `SET #field = :val, updatedAt = :now, vehicleVerifiedBy = :by, vehicleVerifiedByName = :byName, vehicleVerifiedAt = :at`;
        let expressionNames = { '#field': field };
        let expressionValues = {
            ':val': value,
            ':now': new Date().toISOString(),
            ':by': req.user.id,
            ':byName': req.user.name || req.user.username,
            ':at': new Date().toISOString(),
        };

        if (field === 'vehicleVerified') {
            const driverData = await docClient.send(new GetCommand({ TableName: TABLES.DRIVERS, Key: { id: req.params.id } }));
            let vehicles = driverData.Item?.vehicles || [];
            if (vehicles.length > 0) {
                const now = new Date().toISOString();
                if (value === true) {
                    // Mark active or first vehicle as verified
                    let idx = vehicles.findIndex(v => v.vehicleNumber === driverData.Item?.activeVehicleNumber);
                    if (idx === -1) idx = 0;
                    vehicles[idx].verified = true;
                    vehicles[idx].vehicleVerified = true;
                    vehicles[idx].verifiedBy = req.user.id;
                    vehicles[idx].verifiedByName = req.user.name || req.user.username;
                    vehicles[idx].verifiedAt = now;
                    delete vehicles[idx].rejectionReason;
                } else {
                    // Mark all as rejected
                    vehicles.forEach(v => {
                        v.verified = false;
                        v.vehicleVerified = false;
                        v.rejectionReason = req.body.rejectionReason || 'Rejected by Admin';
                    });
                }
                updateExpression += `, vehicles = :vehicles`;
                expressionValues[':vehicles'] = vehicles;
            }
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id: req.params.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionNames,
            ExpressionAttributeValues: expressionValues
        }));

        res.json({ success: true, message: `Driver ${field} updated` });
    } catch (error) {
        console.error('Update driver field error:', error);
        res.status(500).json({ success: false, message: 'Failed to update field' });
    }
});

// ==================== VERIFY INDIVIDUAL VEHICLE ====================
router.put('/driver/:id/verify-vehicle/:vehicleIndex', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { verified, rejectionReason } = req.body;
        const vehicleIndex = parseInt(req.params.vehicleIndex);
        
        if (isNaN(vehicleIndex) || vehicleIndex < 0) {
            return res.status(400).json({ success: false, message: 'Invalid vehicle index' });
        }

        // First get the driver's current vehicles
        const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        const driver = await docClient.send(new GetCommand({
            TableName: TABLES.DRIVERS,
            Key: { id: req.params.id },
        }));

        if (!driver.Item) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        const vehicles = driver.Item.vehicles || [];
        if (vehicleIndex >= vehicles.length) {
            return res.status(400).json({ success: false, message: 'Vehicle index out of range' });
        }

        // Update the specific vehicle's verification status
        vehicles[vehicleIndex].verified = verified === true;
        vehicles[vehicleIndex].vehicleVerified = verified === true;
        vehicles[vehicleIndex].verifiedBy = req.user.id;
        vehicles[vehicleIndex].verifiedByName = req.user.name || req.user.username;
        vehicles[vehicleIndex].verifiedAt = new Date().toISOString();
        if (rejectionReason) {
            vehicles[vehicleIndex].rejectionReason = rejectionReason;
        } else {
            delete vehicles[vehicleIndex].rejectionReason;
        }

        const hasVerifiedVehicle = vehicles.some(v => v.verified === true || v.vehicleVerified === true);

        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id: req.params.id },
            UpdateExpression: 'SET vehicles = :vehicles, vehicleVerified = :vv, updatedAt = :now',
            ExpressionAttributeValues: {
                ':vehicles': vehicles,
                ':vv': hasVerifiedVehicle,
                ':now': new Date().toISOString(),
            }
        }));

        res.json({ 
            success: true, 
            message: `Vehicle ${vehicleIndex} ${verified ? 'verified' : 'rejected'}`,
            vehicles: vehicles 
        });
    } catch (error) {
        console.error('Verify vehicle error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify vehicle' });
    }
});

// ==================== DATA CLEANUP ====================
const { DeleteCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

// Purge test data (bookings, solo rides, marketplace requests) - DOES NOT delete user accounts
router.delete('/purge-test-data', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'super-admin') {
            return res.status(403).json({ success: false, message: 'Super-admin access required' });
        }

        const { confirm } = req.body;
        if (confirm !== 'DELETE_ALL_TEST_DATA') {
            return res.status(400).json({ 
                success: false, 
                message: 'Send { "confirm": "DELETE_ALL_TEST_DATA" } to confirm deletion' 
            });
        }

        const tablesToPurge = [
            TABLES.BOOKINGS,
            TABLES.SOLO_RIDES,
            TABLES.MARKETPLACE_REQUESTS,
        ];

        let totalDeleted = 0;

        for (const tableName of tablesToPurge) {
            try {
                const scanResult = await docClient.send(new ScanCommand({
                    TableName: tableName,
                    ProjectionExpression: 'id'
                }));

                const items = scanResult.Items || [];
                for (const item of items) {
                    await docClient.send(new UpdateCommand({
                        TableName: tableName,
                        Key: { id: item.id },
                        UpdateExpression: 'SET #status = :s, updatedAt = :u',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: { ':s': 'purged', ':u': new Date().toISOString() }
                    }));
                    totalDeleted++;
                }
            } catch (err) {
                console.error(`Error purging table ${tableName}:`, err.message);
            }
        }

        await adminModel.logAction(req.user.id, req.user.username, 'PURGE_TEST_DATA', { totalDeleted });

        res.json({
            success: true,
            message: `Purged ${totalDeleted} records from bookings, solo rides, and marketplace requests.`,
            totalDeleted
        });
    } catch (error) {
        console.error('Purge error:', error);
        res.status(500).json({ success: false, message: 'Failed to purge data' });
    }
});

module.exports = router;
