/**
 * Vendor Model - DynamoDB operations for Vendors
 */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { docClient, TABLES } = require('../config/aws');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Create a new vendor
const createVendor = async (vendorData) => {
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(vendorData.password, 10);
    
    const vendor = {
        id,
        businessName: vendorData.businessName,
        ownerName: vendorData.ownerName,
        phone: vendorData.phone,
        email: vendorData.email || '',
        password: hashedPassword,
        isVerified: false,
        subscriptionPlan: 'free',
        profileImage: vendorData.profileImage || '',
        address: vendorData.address || '',
        gstNumber: vendorData.gstNumber || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLES.VENDORS,
        Item: vendor,
        ConditionExpression: 'attribute_not_exists(id)'
    }));

    // Return vendor without password
    const { password, ...vendorWithoutPassword } = vendor;
    return vendorWithoutPassword;
};

// Find vendor by phone
const findVendorByPhone = async (phone) => {
    const result = await docClient.send(new QueryCommand({
        TableName: TABLES.VENDORS,
        IndexName: 'phone-index',
        KeyConditionExpression: 'phone = :phone',
        ExpressionAttributeValues: {
            ':phone': phone
        }
    }));

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
};

// Find vendor by ID
const findVendorById = async (id) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLES.VENDORS,
        Key: { id }
    }));

    return result.Item || null;
};

// Update vendor
const updateVendor = async (id, updates) => {
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
        TableName: TABLES.VENDORS,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
};

// Verify password
const verifyPassword = async (plainPassword, hashedPassword) => {
    return bcrypt.compare(plainPassword, hashedPassword);
};

// Change password
const changePassword = async (id, newPassword) => {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await docClient.send(new UpdateCommand({
        TableName: TABLES.VENDORS,
        Key: { id },
        UpdateExpression: 'SET #password = :password, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#password': 'password',
            '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
            ':password': hashedPassword,
            ':updatedAt': new Date().toISOString()
        }
    }));
};

module.exports = {
    createVendor,
    findVendorByPhone,
    findVendorById,
    updateVendor,
    verifyPassword,
    changePassword
};
