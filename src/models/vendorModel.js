/**
 * Vendor Model - DynamoDB operations for Vendors
 * Phone-only authentication (no password)
 */
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/aws');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Create a new vendor (phone-only, no password)
// Only stores fields that have actual values — no null entries in DynamoDB
const createVendor = async (vendorData) => {
    const id = uuidv4();
    
    // Helper: returns value only if it's a non-empty string/value, otherwise undefined
    const has = (val) => (val !== undefined && val !== null && (typeof val !== 'string' || val.trim() !== '')) ? val : undefined;

    // Required / always-present fields
    const vendor = {
        id,
        businessName: has(vendorData.businessName) || has(vendorData.ownerName) || 'Unknown',
        ownerName: has(vendorData.ownerName) || 'Unknown',
        phone: vendorData.phone,
        isVerified: false,
        subscriptionPlan: 'free',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Optional fields — only add if they have a real value
    if (has(vendorData.state)) vendor.state = vendorData.state;
    if (has(vendorData.dob)) vendor.dob = vendorData.dob;
    if (has(vendorData.aadharNumber)) vendor.aadharNumber = vendorData.aadharNumber;
    if (vendorData.languages && vendorData.languages.length > 0) vendor.languages = vendorData.languages;
    if (vendorData.documents && Object.keys(vendorData.documents).length > 0) vendor.documents = vendorData.documents;

    await docClient.send(new PutCommand({
        TableName: TABLES.VENDORS,
        Item: vendor,
        ConditionExpression: 'attribute_not_exists(id)'
    }));

    return vendor;
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
        if (key !== 'id') {
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

module.exports = {
    createVendor,
    findVendorByPhone,
    findVendorById,
    updateVendor
};
