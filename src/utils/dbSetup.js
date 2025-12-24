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

// Setup all tables
const setupTables = async () => {
    const vendorExists = await tableExists(TABLES.VENDORS);
    const driverExists = await tableExists(TABLES.DRIVERS);

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
};

module.exports = { setupTables };
