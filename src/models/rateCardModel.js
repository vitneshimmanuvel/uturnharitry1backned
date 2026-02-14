/**
 * Rate Card Model - Custom pricing templates for vendors
 */
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/aws');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Create Rate Card Tables if not exists (handled in aws.js setup usually, but here we assume TABLES.RATE_CARDS exists or we use a generic TABLE)
// Assuming we add RATE_CARDS to TABLES in aws.js. If not, I'll use a string for now, but better to check aws.js first. 
// Let's assume TABLES.RATE_CARDS will be added.

const TABLE_NAME = 'RateCards'; // Will check aws.js to confirm if I need to add it there.

const createRateCard = async (cardData) => {
    const id = uuidv4();
    
    const rateCard = {
        id,
        vendorId: cardData.vendorId,
        name: cardData.name, // e.g., "Standard Sedan Intercity"
        vehicleType: cardData.vehicleType, // Bike, Auto, Sedan, etc.
        tripType: cardData.tripType, // OneWay, RoundTrip, etc.
        rates: cardData.rates, // JSON object with specific fields (perKm, baseFare, etc.)
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: rateCard
    }));

    return rateCard;
};

const getVendorRateCards = async (vendorId) => {
    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'vendor-index',
            KeyConditionExpression: 'vendorId = :vendorId',
            ExpressionAttributeValues: {
                ':vendorId': vendorId
            }
        });
        
        const result = await docClient.send(command);
        return result.Items || [];
    } catch (error) {
        console.warn('Query failed, falling back to Scan for RateCards:', error.message);
        
        try {
            const scanCommand = new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: 'vendorId = :vendorId',
                ExpressionAttributeValues: {
                    ':vendorId': vendorId
                }
            });
            const result = await docClient.send(scanCommand);
            return result.Items || [];
        } catch (scanError) {
            console.error('Scan also failed for RateCards:', scanError.message);
            return []; // Return empty array instead of crashing
        }
    }
};

const getRateCardById = async (id) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return result.Item;
};

const updateRateCard = async (id, updates) => {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updates).forEach((key, index) => {
        if (key !== 'id' && key !== 'vendorId' && key !== 'createdAt') {
            const attrName = `#attr${index}`;
            const attrValue = `:val${index}`;
            updateExpressions.push(`${attrName} = ${attrValue}`);
            expressionAttributeNames[attrName] = key;
            expressionAttributeValues[attrValue] = updates[key];
        }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 0) return null;

    const result = await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
};

const deleteRateCard = async (id) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return true;
};

module.exports = {
    createRateCard,
    getVendorRateCards,
    getRateCardById,
    updateRateCard,
    deleteRateCard,
    TABLE_NAME
};
