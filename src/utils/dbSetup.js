/**
 * Database Setup - Create DynamoDB tables if they don't exist
 */
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { awsConfig, TABLES } = require('../config/aws');

const dynamoClient = new DynamoDBClient(awsConfig);

// Check if table exists
const tableExists = async (tableName) => {
    try {
        await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
        return true;
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            return false;
        }
        throw error;
    }
};

// Create Vendors table
const createVendorsTable = async () => {
    const params = {
        TableName: TABLES.VENDORS,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'phone', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'phone-index',
                KeySchema: [
                    { AttributeName: 'phone', KeyType: 'HASH' }
                ],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoClient.send(new CreateTableCommand(params));
        console.log(`✅ Table ${TABLES.VENDORS} created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table ${TABLES.VENDORS} already exists`);
        } else {
            throw error;
        }
    }
};

// Create Drivers table
const createDriversTable = async () => {
    const params = {
        TableName: TABLES.DRIVERS,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'phone', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'phone-index',
                KeySchema: [
                    { AttributeName: 'phone', KeyType: 'HASH' }
                ],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoClient.send(new CreateTableCommand(params));
        console.log(`✅ Table ${TABLES.DRIVERS} created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table ${TABLES.DRIVERS} already exists`);
        } else {
            throw error;
        }
    }
};

// Create Bookings table
const createBookingsTable = async () => {
    const params = {
        TableName: 'uturn-bookings',
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'vendorId', AttributeType: 'S' },
            { AttributeName: 'assignedDriverId', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'vendorId-index',
                KeySchema: [
                    { AttributeName: 'vendorId', KeyType: 'HASH' }
                ],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            },
            {
                IndexName: 'assignedDriverId-index',
                KeySchema: [
                    { AttributeName: 'assignedDriverId', KeyType: 'HASH' }
                ],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoClient.send(new CreateTableCommand(params));
        console.log(`✅ Table UTurnBookings created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table UTurnBookings already exists`);
        } else {
            throw error;
        }
    }
};

// Setup all tables
const setupTables = async () => {
    const vendorExists = await tableExists(TABLES.VENDORS);
    const driverExists = await tableExists(TABLES.DRIVERS);
    const bookingsExists = await tableExists('uturn-bookings');

    if (!vendorExists) {
        await createVendorsTable();
    } else {
        console.log(`ℹ️ Table ${TABLES.VENDORS} already exists`);
    }

    if (!driverExists) {
        await createDriversTable();
    } else {
        console.log(`ℹ️ Table ${TABLES.DRIVERS} already exists`);
    }
    
    if (!bookingsExists) {
        await createBookingsTable();
    } else {
        console.log(`ℹ️ Table UTurnBookings already exists`);
    }
    
    // Create Wallet table
    const walletExists = await tableExists('UTurnWallet');
    if (!walletExists) {
        await createWalletTable();
    } else {
        console.log(`ℹ️ Table UTurnWallet already exists`);
    }
    
    // Create Referrals table
    const referralsExists = await tableExists('UTurnReferrals');
    if (!referralsExists) {
        await createReferralsTable();
    } else {
        console.log(`ℹ️ Table UTurnReferrals already exists`);
    }
    
    // Create Marketplace Requests table
    const marketplaceRequestsExists = await tableExists(TABLES.MARKETPLACE_REQUESTS);
    if (!marketplaceRequestsExists) {
        await createMarketplaceRequestsTable();
    } else {
        console.log(`ℹ️ Table ${TABLES.MARKETPLACE_REQUESTS} already exists`);
    }
};

// Create Wallet table
const createWalletTable = async () => {
    const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
    const params = {
        TableName: 'UTurnWallet',
        KeySchema: [
            { AttributeName: 'vendorId', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'vendorId', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoClient.send(new CreateTableCommand(params));
        console.log(`✅ Table UTurnWallet created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table UTurnWallet already exists`);
        } else {
            throw error;
        }
    }
};

// Create Referrals table
const createReferralsTable = async () => {
    const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
    const params = {
        TableName: 'UTurnReferrals',
        KeySchema: [
            { AttributeName: 'vendorId', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'vendorId', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoClient.send(new CreateTableCommand(params));
        console.log(`✅ Table UTurnReferrals created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table UTurnReferrals already exists`);
        } else {
            throw error;
        }
    }
};

// Create Marketplace Requests table
const createMarketplaceRequestsTable = async () => {
    const params = {
        TableName: TABLES.MARKETPLACE_REQUESTS,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoClient.send(new CreateTableCommand(params));
        console.log(`✅ Table ${TABLES.MARKETPLACE_REQUESTS} created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table ${TABLES.MARKETPLACE_REQUESTS} already exists`);
        } else {
            throw error;
        }
    }
};

module.exports = { setupTables };

