/**
 * Driver Model - Simplified (Name + Phone Only)
 * Matching Flutter UTurn app structure
 */
const { TABLES, TABLE_NAMES, docClient } = require('../config/aws');
const { PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const referralModel = require('./referralModel');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new driver - SIMPLIFIED (Name + Phone Only)
 * No password, no email required
 */
const createDriver = async (driverData) => {
    const driverId = uuidv4();
    
    // Generate Referral Code using centralized model
    const referralRecord = await referralModel.createReferral(driverId, driverData.phone);
    const referralCode = referralRecord.code;

    // Handle being referred by someone else
    if (driverData.referredBy) {
        try {
            await referralModel.applyReferralCode(
                driverData.referredBy, 
                driverId, 
                driverData.name, 
                false // immediateBonus = false (Wait for 5 trips)
            );
        } catch (e) {
            console.log('Referral application failed:', e.message);
        }
    }

    const driver = {
        id: driverId,
        // Essential fields only
        name: driverData.name,
        phone: driverData.phone,
        
        // Driver type: 'driver' (has vehicle) or 'acting_driver' (no vehicle)
        driverType: driverData.driverType || 'driver',
        
        // Optional fields - can be added later
        licenceNumber: driverData.licenceNumber || null,
        vehicleNumber: driverData.vehicleNumber || null,
        vehicleType: driverData.vehicleType || null,
        vehicleBrand: driverData.vehicleBrand || null,
        vehicleModel: driverData.vehicleModel || null,
        homeLocation: driverData.homeLocation || null,
        aadharNumber: driverData.aadharNumber || null,
        dob: driverData.dob || null,
        rcNumber: driverData.rcNumber || null,
        insuranceId: driverData.insuranceId || null,
        insuranceExpiry: driverData.insuranceExpiry || null,
        fcExpiry: driverData.fcExpiry || null,
        tripType: driverData.tripType || null,
        fuelType: driverData.fuelType || null,
        vehicleYear: driverData.vehicleYear || null,
        vehicles: driverData.vehicles || [],
        
        // Profile picture URL
        profilePic: driverData.profilePic || null,
        
        // For acting drivers
        preferredVehicles: driverData.preferredVehicles || [],
        
        // Documents (URLs) - optional, can be uploaded later
        state: driverData.state || null,
        languages: driverData.languages || [], // Array of strings

        documents: driverData.documents || {
            selfie: null,
            aadharFront: null,
            aadharBack: null,
            licenceFront: null,
            licenceBack: null,
            rcFront: null,
            rcBack: null,
            insuranceFront: null,
            insuranceBack: null,
            permit: null
        },
        
        referralCode, // Store for easy display
        isVerified: false,
        isOnline: false,
        status: 'active',
        totalTrips: 0,
        rating: 5.0,
        walletBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    try {
        await docClient.send(new PutCommand({
            TableName: TABLE_NAMES.drivers,
            Item: driver
        }));
        return driver;
    } catch (error) {
        console.error('Error creating driver:', error);
        throw error;
    }
};

/**
 * Find driver by referral code
 */
const findDriverByReferralCode = async (code) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAMES.drivers,
        FilterExpression: 'referralCode = :code',
        ExpressionAttributeValues: { ':code': code }
    }));

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
};

/**
 * Increment referral stats for referrer
 */
const incrementReferralStats = async (referralCode) => {
    const referrer = await findDriverByReferralCode(referralCode);
    if (referrer) {
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAMES.drivers,
            Key: { id: referrer.id },
            UpdateExpression: 'SET referralCount = referralCount + :inc',
            ExpressionAttributeValues: { ':inc': 1 }
        }));
    }

};

/**
 * Increment driver trips (and return new count)
 */
const incrementDriverTrips = async (driverId) => {
    const result = await docClient.send(new UpdateCommand({
        TableName: TABLE_NAMES.drivers,
        Key: { id: driverId },
        UpdateExpression: 'SET totalTrips = if_not_exists(totalTrips, :zero) + :inc, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': new Date().toISOString() },
        ReturnValues: 'ALL_NEW'
    }));
    return result.Attributes.totalTrips;
};

/**
 * Add earnings to driver
 */
const addDriverEarnings = async (driverId, amount) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAMES.drivers,
        Key: { id: driverId },
        UpdateExpression: 'SET totalEarnings = if_not_exists(totalEarnings, :zero) + :amount, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':amount': amount, ':now': new Date().toISOString() }
    }));
};

/**
 * Find driver by phone number
 */
const findDriverByPhone = async (phone) => {
    const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAMES.drivers,
        IndexName: 'phone-index',
        KeyConditionExpression: 'phone = :phone',
        ExpressionAttributeValues: { ':phone': phone }
    }));

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
};

/**
 * Find driver by ID
 */
const findDriverById = async (id) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAMES.drivers,
        Key: { id }
    }));

    return result.Item || null;
};

/**
 * Update driver profile
 */
const updateDriver = async (id, updates) => {
    updates.updatedAt = new Date().toISOString();
    
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value]) => {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
    });

    const result = await docClient.send(new UpdateCommand({
        TableName: TABLE_NAMES.drivers,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
};

/**
 * Update driver documents
 */
const updateDriverDocuments = async (id, documents) => {
    return updateDriver(id, { documents });
};

/**
 * Set driver online/offline status
 */
const setDriverOnlineStatus = async (id, isOnline, availability = []) => {
    return updateDriver(id, { isOnline, availability });
};

/**
 * Get all online drivers
 */
const getOnlineDrivers = async () => {
    // Note: This is a scan operation - consider using a GSI for production
    const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAMES.drivers,
        IndexName: 'phone-index',
        FilterExpression: 'isOnline = :isOnline',
        ExpressionAttributeValues: { ':isOnline': true }
    }));

    return result.Items || [];
};

// Find drivers with filter
const findDrivers = async (filter) => {
    try {
        const params = {
            TableName: TABLE_NAMES.drivers, // Corrected to TABLE_NAMES.drivers
            FilterExpression: '',
            ExpressionAttributeNames: {},
            ExpressionAttributeValues: {}
        };

        const filterExpressions = [];
        
        // Build filter expression
        Object.keys(filter).forEach((key, index) => {
            const attrKey = `#key${index}`;
            const valKey = `:val${index}`;
            
            filterExpressions.push(`${attrKey} = ${valKey}`);
            params.ExpressionAttributeNames[attrKey] = key;
            params.ExpressionAttributeValues[valKey] = filter[key];
        });

        if (filterExpressions.length > 0) {
            params.FilterExpression = filterExpressions.join(' AND ');
        } else {
            // Scan all if no filter (be careful in prod)
            delete params.FilterExpression;
            delete params.ExpressionAttributeNames;
            delete params.ExpressionAttributeValues;
        }

        const command = new ScanCommand(params); // Use Scan for non-indexed attributes
        const response = await docClient.send(command);
        return response.Items || [];
    } catch (error) {
        console.error('Find drivers error:', error);
        throw error;
    }
};

module.exports = {
    createDriver,
    findDriverByPhone,
    findDriverById,
    updateDriver,
    updateDriverDocuments,
    setDriverOnlineStatus,
    getOnlineDrivers,
    findDrivers,
    findDriverByReferralCode, // Export new function
    incrementDriverTrips,
    addDriverEarnings
};
