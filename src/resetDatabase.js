/**
 * Reset DynamoDB Tables - Delete and recreate fresh tables
 * Run this to start with a clean database
 */
require('dotenv').config();
const { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ListTablesCommand, waitUntilTableNotExists, waitUntilTableExists } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const TABLES = {
    vendors: 'uturn-vendors',
    drivers: 'uturn-drivers',
    bookings: 'uturn-bookings'
};

async function deleteTable(tableName) {
    try {
        console.log(`🗑️  Deleting table: ${tableName}...`);
        await client.send(new DeleteTableCommand({ TableName: tableName }));
        await waitUntilTableNotExists({ client, maxWaitTime: 120 }, { TableName: tableName });
        console.log(`✅ Deleted: ${tableName}`);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`ℹ️  Table ${tableName} doesn't exist, skipping delete.`);
        } else {
            throw error;
        }
    }
}

async function createVendorsTable() {
    console.log('📝 Creating uturn-vendors table...');
    await client.send(new CreateTableCommand({
        TableName: TABLES.vendors,
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'phone', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [{
            IndexName: 'phone-index',
            KeySchema: [{ AttributeName: 'phone', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
        }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    }));
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: TABLES.vendors });
    console.log('✅ Created: uturn-vendors');
}

async function createDriversTable() {
    console.log('📝 Creating uturn-drivers table...');
    await client.send(new CreateTableCommand({
        TableName: TABLES.drivers,
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'phone', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [{
            IndexName: 'phone-index',
            KeySchema: [{ AttributeName: 'phone', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
        }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    }));
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: TABLES.drivers });
    console.log('✅ Created: uturn-drivers');
}

async function createBookingsTable() {
    console.log('📝 Creating uturn-bookings table...');
    await client.send(new CreateTableCommand({
        TableName: TABLES.bookings,
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'vendorId', AttributeType: 'S' },
            { AttributeName: 'driverId', AttributeType: 'S' },
            { AttributeName: 'status', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'vendor-index',
                KeySchema: [{ AttributeName: 'vendorId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
            },
            {
                IndexName: 'driver-index',
                KeySchema: [{ AttributeName: 'driverId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
            },
            {
                IndexName: 'status-index',
                KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
            }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    }));
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: TABLES.bookings });
    console.log('✅ Created: uturn-bookings');
}

async function resetDatabase() {
    console.log('\n🔄 UTurn Database Reset Script\n');
    console.log('================================\n');
    
    try {
        // Step 1: Delete all existing tables
        console.log('📋 Step 1: Deleting existing tables...\n');
        await deleteTable(TABLES.vendors);
        await deleteTable(TABLES.drivers);
        await deleteTable(TABLES.bookings);
        
        // Wait a bit before creating
        console.log('\n⏳ Waiting 5 seconds before creating new tables...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 2: Create fresh tables
        console.log('📋 Step 2: Creating fresh tables...\n');
        await createVendorsTable();
        await createDriversTable();
        await createBookingsTable();
        
        console.log('\n================================');
        console.log('✅ Database reset complete!');
        console.log('================================\n');
        console.log('Tables created:');
        console.log('  - uturn-vendors (for vendor users)');
        console.log('  - uturn-drivers (for driver users)');
        console.log('  - uturn-bookings (for ride bookings)\n');
        
    } catch (error) {
        console.error('\n❌ Error resetting database:', error.message);
        console.error(error);
        process.exit(1);
    }
}

resetDatabase();
