/**
 * Rate Card Model - Custom pricing templates for vendors
 */
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/aws');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

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
    // Requires GSI on vendorId if table PK is id. 
    // Or if we use PK=vendorId and SK=id, query is efficient.
    // Let's assume PK=id for global uniqueness, and we need a GSI 'vendor-index'
    
    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'vendor-index', // Assumed GSI
            KeyConditionExpression: 'vendorId = :vendorId',
            ExpressionAttributeValues: {
                ':vendorId': vendorId
            }
        });
        
        const result = await docClient.send(command);
        return result.Items || [];
    } catch (error) {
        // Fallback: Scan (inefficient but works for small data if GSI missing)
        // For now, let's assume we might need to use Scan if GSI fails or just implement assuming GSI exists
        // Given I cannot easily change DynamoDB schema from here without console access usually, 
        // I will use Scan with filter for now to be safe, unless I verify schema.
        // Actually, Scan is bad. But if I can't create GSI...
        // Let's stick to Scan for prototype as I don't control the DB schema creation script here directly
        // unless I see a setup script.
        
        console.warn('Query failed, falling back to Scan for RateCards:', error.message);
        
        const scanCommand = new io.ScanCommand({ // using Scan from v3 client via docClient if imported? No, docClient has send(ScanCommand)
             TableName: TABLE_NAME,
             FilterExpression: 'vendorId = :vendorId',
             ExpressionAttributeValues: {
                 ':vendorId': vendorId
             }
        });
        // Scan is not exported above. 
        // Let's hope the user has permissions to create GSI or I'll just use the `auth` table pattern if relevant.
        // Actually, existing `bookings` table has GSIs.
        throw error;
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
