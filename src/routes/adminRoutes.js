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
            // APPROVE: set verified, clear rejection fields
            updateExpression = 'SET isVerified = :verified, verificationStatus = :vs, updatedAt = :now, verifiedBy = :adminId, verifiedByName = :adminName, verifiedAt = :now REMOVE rejectionReason, rejectedAt, rejectedBy, rejectedByName';
            expressionValues = { ':verified': true, ':vs': 'verified', ':now': now, ':adminId': req.user.id, ':adminName': req.user.username };
            expressionNames = {};
        } else {
            // REJECT: set rejected with reason
            updateExpression = 'SET isVerified = :verified, verificationStatus = :vs, rejectionReason = :reason, rejectedAt = :now, rejectedBy = :adminId, rejectedByName = :adminName, updatedAt = :now REMOVE verifiedBy, verifiedByName, verifiedAt';
            expressionValues = { ':verified': false, ':vs': 'rejected', ':reason': rejectionReason || 'Your registration was rejected by admin.', ':now': now, ':adminId': req.user.id, ':adminName': req.user.username };
            expressionNames = {};
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionValues
        }));

        await adminModel.logAction(req.user.id, req.user.username, verified ? 'VERIFY_DRIVER' : 'REJECT_DRIVER', { driverId: id, rejectionReason: rejectionReason || null });
        res.json({ success: true, message: verified ? 'Driver approved' : 'Driver rejected' });
    } catch (error) {
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

// Block/Unblock driver
router.patch('/drivers/:id/block', authMiddleware, adminOnly, checkPermission('drivers'), async (req, res) => {
    try {
        const { id } = req.params;
        const { blocked } = req.body;
        
        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id },
            UpdateExpression: 'SET #status = :status, updatedAt = :now, blockedBy = :adminId, blockedByName = :adminName',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': blocked ? 'blocked' : 'active', ':now': new Date().toISOString(), ':adminId': req.user.id, ':adminName': req.user.username }
        }));

        await adminModel.logAction(req.user.id, req.user.username, blocked ? 'BLOCK_DRIVER' : 'UNBLOCK_DRIVER', { driverId: id });
        res.json({ success: true, message: blocked ? 'Driver blocked' : 'Driver unblocked' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update driver' });
    }
});

// Block/Unblock vendor
router.patch('/vendors/:id/block', authMiddleware, adminOnly, checkPermission('vendors'), async (req, res) => {
    try {
        const { id } = req.params;
        const { blocked } = req.body;
        
        await docClient.send(new UpdateCommand({
            TableName: TABLES.VENDORS,
            Key: { id },
            UpdateExpression: 'SET #status = :status, updatedAt = :now, blockedBy = :adminId, blockedByName = :adminName',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': blocked ? 'blocked' : 'active', ':now': new Date().toISOString(), ':adminId': req.user.id, ':adminName': req.user.username }
        }));

        await adminModel.logAction(req.user.id, req.user.username, blocked ? 'BLOCK_VENDOR' : 'UNBLOCK_VENDOR', { vendorId: id });
        res.json({ success: true, message: blocked ? 'Vendor blocked' : 'Vendor unblocked' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update vendor' });
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

// ==================== UPDATE DRIVER FIELD (for vehicle verification) ====================
router.put('/driver/:id/update-field', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { field, value } = req.body;
        const allowedFields = ['vehicleVerified', 'vehicleRejectionReason'];
        if (!allowedFields.includes(field)) {
            return res.status(400).json({ success: false, message: 'Field not allowed' });
        }

        const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id: req.params.id },
            UpdateExpression: `SET #field = :val, updatedAt = :now, vehicleVerifiedBy = :by, vehicleVerifiedByName = :byName, vehicleVerifiedAt = :at`,
            ExpressionAttributeNames: { '#field': field },
            ExpressionAttributeValues: {
                ':val': value,
                ':now': new Date().toISOString(),
                ':by': req.user.id,
                ':byName': req.user.name || req.user.username,
                ':at': new Date().toISOString(),
            }
        }));

        res.json({ success: true, message: `Driver ${field} updated` });
    } catch (error) {
        console.error('Update driver field error:', error);
        res.status(500).json({ success: false, message: 'Failed to update field' });
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
