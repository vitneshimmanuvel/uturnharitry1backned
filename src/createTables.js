/**
 * Create DynamoDB Tables Script
 * Run this once to create the tables before starting the server
 */
require('dotenv').config();

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

// AWS Configuration
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const VENDORS_TABLE = 'uturn-vendors';
const DRIVERS_TABLE = 'uturn-drivers';
const BOOKINGS_TABLE = 'uturn-bookings';

// Check if table exists
async function tableExists(tableName) {
    try {
        await client.send(new DescribeTableCommand({ TableName: tableName }));
        return true;
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            return false;
        }
        throw error;
    }
}

// Create Vendors Table
async function createVendorsTable() {
    const params = {
        TableName: VENDORS_TABLE,
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

    await client.send(new CreateTableCommand(params));
    console.log(`✅ Table ${VENDORS_TABLE} created successfully!`);
}

// Create Drivers Table
async function createDriversTable() {
    const params = {
        TableName: DRIVERS_TABLE,
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

    await client.send(new CreateTableCommand(params));
    console.log(`✅ Table ${DRIVERS_TABLE} created successfully!`);
}

// Create Bookings Table
async function createBookingsTable() {
    const params = {
        TableName: BOOKINGS_TABLE,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'vendorId', AttributeType: 'S' },
            { AttributeName: 'status', AttributeType: 'S' }
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
                IndexName: 'status-index',
                KeySchema: [
                    { AttributeName: 'status', KeyType: 'HASH' }
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

    await client.send(new CreateTableCommand(params));
    console.log(`✅ Table ${BOOKINGS_TABLE} created successfully!`);
}

// Main function
async function main() {
    console.log('🔧 DynamoDB Table Creation Script');
    console.log('==================================');
    console.log(`Region: ${process.env.AWS_REGION}`);
    console.log(`Access Key: ${process.env.AWS_ACCESS_KEY_ID?.substring(0, 8)}...`);
    console.log('');

    try {
        // First, test the connection by listing tables
        console.log('📡 Testing AWS connection...');
        const listResult = await client.send(new ListTablesCommand({}));
        console.log(`✅ Connected! Existing tables: ${listResult.TableNames?.join(', ') || 'none'}`);
        console.log('');

        // Create Vendors table
        console.log(`📋 Checking ${VENDORS_TABLE}...`);
        if (await tableExists(VENDORS_TABLE)) {
            console.log(`ℹ️  Table ${VENDORS_TABLE} already exists`);
        } else {
            console.log(`🔨 Creating ${VENDORS_TABLE}...`);
            await createVendorsTable();
        }

        // Create Drivers table
        console.log(`📋 Checking ${DRIVERS_TABLE}...`);
        if (await tableExists(DRIVERS_TABLE)) {
            console.log(`ℹ️  Table ${DRIVERS_TABLE} already exists`);
        } else {
            console.log(`🔨 Creating ${DRIVERS_TABLE}...`);
            await createDriversTable();
        }

        // Create Bookings table
        console.log(`📋 Checking ${BOOKINGS_TABLE}...`);
        if (await tableExists(BOOKINGS_TABLE)) {
            console.log(`ℹ️  Table ${BOOKINGS_TABLE} already exists`);
        } else {
            console.log(`🔨 Creating ${BOOKINGS_TABLE}...`);
            await createBookingsTable();
        }

        // Create Vehicles table
        const VEHICLES_TABLE = 'uturn-vehicles';
        console.log(`📋 Checking ${VEHICLES_TABLE}...`);
        if (await tableExists(VEHICLES_TABLE)) {
            console.log(`ℹ️  Table ${VEHICLES_TABLE} already exists`);
        } else {
             console.log(`🔨 Creating ${VEHICLES_TABLE}...`);
             // Inline creation since it's simple
             await client.send(new CreateTableCommand({
                 TableName: VEHICLES_TABLE,
                 KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
                 AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
                 ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
             }));
             console.log('✅ Vehicles table created');
        }

        // Create Loans table
        const LOANS_TABLE = 'uturn-loans';
        console.log(`📋 Checking ${LOANS_TABLE}...`);
        if (await tableExists(LOANS_TABLE)) {
            console.log(`ℹ️  Table ${LOANS_TABLE} already exists`);
        } else {
             console.log(`🔨 Creating ${LOANS_TABLE}...`);
             await client.send(new CreateTableCommand({
                 TableName: LOANS_TABLE,
                 KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
                 AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
                 ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
             }));
             console.log('✅ Loans table created');
        }

        console.log('\n🎉 All tables are ready!');
        console.log('\nTable structure:');
        console.log('================');
        console.log(`${VENDORS_TABLE}:`);
        console.log('  - Primary Key: id (String)');
        console.log('  - GSI: phone-index (phone -> String)');
        console.log(`${DRIVERS_TABLE}:`);
        console.log('  - Primary Key: id (String)');
        console.log('  - GSI: phone-index (phone -> String)');
        console.log(`${BOOKINGS_TABLE}:`);
        console.log('  - Primary Key: id (String)');
        console.log('  - GSI: vendorId-index, status-index');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        if (error.name === 'UnrecognizedClientException' || error.message.includes('security token')) {
            console.error('\n⚠️  AWS Credential Issue!');
            console.error('Please verify:');
            console.error('1. AWS_ACCESS_KEY_ID is correct');
            console.error('2. AWS_SECRET_ACCESS_KEY is correct');
            console.error('3. The IAM user has DynamoDB permissions');
            console.error('\nGo to AWS Console -> IAM -> Users -> vitneshiamuser1');
            console.error('Add these policies:');
            console.error('  - AmazonDynamoDBFullAccess');
            console.error('  - AmazonS3FullAccess');
        }
        
        process.exit(1);
    }
}

main();
