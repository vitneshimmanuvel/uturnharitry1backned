const express = require('express');
const router = express.Router();
const { docClient, TABLES } = require('../config/aws');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

router.get('/', (req, res) => {
    res.json({ message: 'Admin API working' });
});

// Get all vendors
router.get('/vendors', async (req, res) => {
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
router.get('/drivers', async (req, res) => {
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
router.get('/customers', async (req, res) => {
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
router.get('/detailed-dashboard', async (req, res) => {
    try {
        // Today's Date String for comparisons (e.g., '2023-10-27')
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Vendors (Total and Active Today)
        const vendorsResult = await docClient.send(new ScanCommand({ TableName: TABLES.VENDORS }));
        const totalVendors = vendorsResult.Items?.length || 0;
        const activeVendorsToday = (vendorsResult.Items || []).filter(v => 
            v.updatedAt && v.updatedAt.startsWith(todayStr)
        ).length;

        // 2. Drivers (Total and Active Today)
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

        // 3. Rides (Today's specifically)
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

// Get all rides (Bookings + Solo Rides)
router.get('/rides', async (req, res) => {
    try {
        const bookingsResult = await docClient.send(new ScanCommand({ TableName: TABLES.BOOKINGS }));
        const soloRidesResult = await docClient.send(new ScanCommand({ TableName: TABLES.SOLO_RIDES }));

        const allRides = [
            ...(bookingsResult.Items || []).map(r => ({ ...r, source: 'booking' })),
            ...(soloRidesResult.Items || []).map(r => ({ ...r, source: 'solo_ride' }))
        ];

        // Sort by createdAt descending
        allRides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, count: allRides.length, data: allRides });
    } catch (error) {
        console.error('Admin API error fetching all rides:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch rides', error: error.message });
    }
});

// Get all self rides (Solo Rides Table)
router.get('/self-rides', async (req, res) => {
    try {
        const result = await docClient.send(new ScanCommand({ TableName: TABLES.SOLO_RIDES }));
        const selfRides = result.Items || [];
        
        // Sort by createdAt descending
        selfRides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, count: selfRides.length, data: selfRides });
    } catch (error) {
        console.error('Admin API error fetching self rides:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch self rides', error: error.message });
    }
});

// Approve/Verify a driver
router.patch('/drivers/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;
        const { verified } = req.body;
        
        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id },
            UpdateExpression: 'SET isVerified = :verified, updatedAt = :now',
            ExpressionAttributeValues: {
                ':verified': verified,
                ':now': new Date().toISOString(),
            },
        }));

        res.json({ success: true, message: verified ? 'Driver approved' : 'Driver approval revoked' });
    } catch (error) {
        console.error('Admin API error verifying driver:', error);
        res.status(500).json({ success: false, message: 'Failed to verify driver', error: error.message });
    }
});

// Approve/Verify a vendor
router.patch('/vendors/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;
        const { verified } = req.body;
        
        await docClient.send(new UpdateCommand({
            TableName: TABLES.VENDORS,
            Key: { id },
            UpdateExpression: 'SET isVerified = :verified, updatedAt = :now',
            ExpressionAttributeValues: {
                ':verified': verified,
                ':now': new Date().toISOString(),
            },
        }));

        res.json({ success: true, message: verified ? 'Vendor approved' : 'Vendor approval revoked' });
    } catch (error) {
        console.error('Admin API error verifying vendor:', error);
        res.status(500).json({ success: false, message: 'Failed to verify vendor', error: error.message });
    }
});

// Block/Unblock a driver
router.patch('/drivers/:id/block', async (req, res) => {
    try {
        const { id } = req.params;
        const { blocked } = req.body;
        
        await docClient.send(new UpdateCommand({
            TableName: TABLES.DRIVERS,
            Key: { id },
            UpdateExpression: 'SET #status = :status, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': blocked ? 'blocked' : 'active',
                ':now': new Date().toISOString(),
            },
        }));

        res.json({ success: true, message: blocked ? 'Driver blocked' : 'Driver unblocked' });
    } catch (error) {
        console.error('Admin API error blocking driver:', error);
        res.status(500).json({ success: false, message: 'Failed to update driver', error: error.message });
    }
});

// Block/Unblock a vendor
router.patch('/vendors/:id/block', async (req, res) => {
    try {
        const { id } = req.params;
        const { blocked } = req.body; // true = block, false = unblock
        const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        
        await docClient.send(new UpdateCommand({
            TableName: TABLES.VENDORS,
            Key: { id },
            UpdateExpression: 'SET #status = :status, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': blocked ? 'blocked' : 'active',
                ':now': new Date().toISOString(),
            },
        }));

        res.json({ success: true, message: blocked ? 'Vendor blocked' : 'Vendor unblocked' });
    } catch (error) {
        console.error('Admin API error blocking vendor:', error);
        res.status(500).json({ success: false, message: 'Failed to update vendor', error: error.message });
    }
});

module.exports = router;
