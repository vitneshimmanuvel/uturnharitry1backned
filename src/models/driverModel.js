/**
 * Driver Model - Simplified (Name + Phone Only)
 * Matching Flutter UTurn app structure
 */
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamoDb, TABLE_NAMES } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const docClient = DynamoDBDocumentClient.from(dynamoDb);

/**
 * Create a new driver - SIMPLIFIED (Name + Phone Only)
 * No password, no email required
 */
const createDriver = async (driverData) => {
    const driver = {
        id: uuidv4(),
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
        
        // For acting drivers
        experienceYears: driverData.experienceYears || null,
        preferredVehicles: driverData.preferredVehicles || [],
        
        // Documents (URLs) - optional, can be uploaded later
        documents: driverData.documents || {
            selfie: null,
            aadhar: null,
            licence: null,
            rcBook: null,
            insurance: null
        },
        
        // Status
        isVerified: false,
        isOnline: false,
        isApprovedByVendor: false,
        approvedByVendorId: null,
        
        // Stats
        rating: 0,
        totalTrips: 0,
        totalEarnings: 0,
        
        // Referral
        referralCode: `DRV${driverData.phone.slice(-4)}${Math.random().toString(36).substring(2, 4).toUpperCase()}`,
        referredBy: driverData.referredBy || null,
        referralCount: 0,
        
        // Availability
        availability: [],
        
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAMES.drivers,
        Item: driver
    }));

    return driver;
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

module.exports = {
    createDriver,
    findDriverByPhone,
    findDriverById,
    updateDriver,
    updateDriverDocuments,
    setDriverOnlineStatus,
    getOnlineDrivers
};
