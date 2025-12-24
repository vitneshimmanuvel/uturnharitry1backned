/**
 * Driver Model - DynamoDB operations for Drivers
 * Supports both regular drivers (with vehicle) and acting drivers (without vehicle)
 */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { docClient, TABLES } = require('../config/aws');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Create a new driver
const createDriver = async (driverData) => {
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(driverData.password, 10);
    
    const driver = {
        id,
        // Driver type: 'driver' (with vehicle) or 'acting_driver' (without vehicle)
        driverType: driverData.driverType || 'driver',
        
        // Personal details (common to both types)
        name: driverData.name,
        phone: driverData.phone,
        dob: driverData.dob,
        homeLocation: driverData.homeLocation,
        
        // Document details (common to both types)
        aadharNumber: driverData.aadharNumber,
        licenceNumber: driverData.licenceNumber,
        
        // Vehicle details (only for regular drivers)
        vehicleNumber: driverData.vehicleNumber || '',
        vehicleType: driverData.vehicleType || '',
        
        // Acting driver specific fields
        experienceYears: driverData.experienceYears || '',
        preferredVehicles: driverData.preferredVehicles || [],
        
        // Document URLs (stored in S3)
        documents: {
            selfie: driverData.documents?.selfie || '',
            aadhar: driverData.documents?.aadhar || '',
            licence: driverData.documents?.licence || '',
            rcBook: driverData.documents?.rcBook || '',
            insurance: driverData.documents?.insurance || '',
            fc: driverData.documents?.fc || ''
        },
        
        // Password
        password: hashedPassword,
        
        // Status fields
        isVerified: false,      // Admin verification status
        isOnline: false,        // Driver availability
        isActive: true,         // Account active status
        
        // Ratings and stats
        rating: 0,
        totalTrips: 0,
        earnings: 0,
        
        // Timestamps
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLES.DRIVERS,
        Item: driver,
        ConditionExpression: 'attribute_not_exists(id)'
    }));

    // Return driver without password
    const { password, ...driverWithoutPassword } = driver;
    return driverWithoutPassword;
};

// Find driver by phone
const findDriverByPhone = async (phone) => {
    const result = await docClient.send(new QueryCommand({
        TableName: TABLES.DRIVERS,
        IndexName: 'phone-index',
        KeyConditionExpression: 'phone = :phone',
        ExpressionAttributeValues: {
            ':phone': phone
        }
    }));

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
};

// Find driver by ID
const findDriverById = async (id) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLES.DRIVERS,
        Key: { id }
    }));

    return result.Item || null;
};

// Update driver
const updateDriver = async (id, updates) => {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // Build update expression dynamically
    Object.keys(updates).forEach((key, index) => {
        if (key !== 'id' && key !== 'password') {
            const attrName = `#attr${index}`;
            const attrValue = `:val${index}`;
            updateExpressions.push(`${attrName} = ${attrValue}`);
            expressionAttributeNames[attrName] = key;
            expressionAttributeValues[attrValue] = updates[key];
        }
    });

    // Add updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.DRIVERS,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
};

// Update driver documents
const updateDriverDocuments = async (id, documents) => {
    const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.DRIVERS,
        Key: { id },
        UpdateExpression: 'SET documents = :documents, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
            ':documents': documents,
            ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
};

// Toggle driver online status
const setDriverOnlineStatus = async (id, isOnline) => {
    const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.DRIVERS,
        Key: { id },
        UpdateExpression: 'SET isOnline = :isOnline, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
            ':isOnline': isOnline,
            ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
};

// Get all online drivers
const getOnlineDrivers = async () => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLES.DRIVERS,
        FilterExpression: 'isOnline = :isOnline AND isVerified = :isVerified',
        ExpressionAttributeValues: {
            ':isOnline': true,
            ':isVerified': true
        }
    }));

    return result.Items || [];
};

// Verify password
const verifyPassword = async (plainPassword, hashedPassword) => {
    return bcrypt.compare(plainPassword, hashedPassword);
};

// Change password
const changePassword = async (id, newPassword) => {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await docClient.send(new UpdateCommand({
        TableName: TABLES.DRIVERS,
        Key: { id },
        UpdateExpression: 'SET #password = :password, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#password': 'password'
        },
        ExpressionAttributeValues: {
            ':password': hashedPassword,
            ':updatedAt': new Date().toISOString()
        }
    }));
};

module.exports = {
    createDriver,
    findDriverByPhone,
    findDriverById,
    updateDriver,
    updateDriverDocuments,
    setDriverOnlineStatus,
    getOnlineDrivers,
    verifyPassword,
    changePassword
};
