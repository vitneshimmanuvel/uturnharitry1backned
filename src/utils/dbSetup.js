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

// Create Rate Cards table
const createRateCardsTable = async () => {
    const params = {
        TableName: 'RateCards',
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'vendorId', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'vendor-index',
                KeySchema: [
                    { AttributeName: 'vendorId', KeyType: 'HASH' }
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
        console.log(`✅ Table RateCards created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table RateCards already exists`);
        } else {
            throw error;
        }
    }
};

// Create Jobs table
const createJobsTable = async () => {
    const params = {
        TableName: 'UTurnJobs',
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'creatorId', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'creator-index',
                KeySchema: [
                    { AttributeName: 'creatorId', KeyType: 'HASH' }
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
        console.log(`✅ Table UTurnJobs created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table UTurnJobs already exists`);
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
    
    const rateCardsExists = await tableExists('RateCards');
    if (!rateCardsExists) {
        await createRateCardsTable();
    } else {
        console.log(`ℹ️ Table RateCards already exists`);
    }

    const jobsExists = await tableExists('UTurnJobs');
    if (!jobsExists) {
        await createJobsTable();
    } else {
        console.log(`ℹ️ Table UTurnJobs already exists`);
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
    
    // Create Subscription Plans table
    const subscriptionPlansExists = await tableExists('UTurnSubscriptionPlans');
    if (!subscriptionPlansExists) {
        await createSubscriptionPlansTable();
    } else {
        console.log(`ℹ️ Table UTurnSubscriptionPlans already exists`);
    }

    // Seed default subscription plans
    const { seedDefaultPlans } = require('../models/subscriptionModel');
    await seedDefaultPlans();

    // Create Subscriptions table
    const subscriptionsExists = await tableExists('UTurnSubscriptions');
    if (!subscriptionsExists) {
        await createSubscriptionsTable();
    } else {
        console.log(`ℹ️ Table UTurnSubscriptions already exists`);
    }

    // Create Admins table
    const adminsExists = await tableExists(TABLES.ADMINS);
    if (!adminsExists) {
        await createAdminsTable();
    } else {
        console.log(`ℹ️ Table ${TABLES.ADMINS} already exists`);
    }

    // Create Admin Logs table
    const adminLogsExists = await tableExists(TABLES.ADMIN_LOGS);
    if (!adminLogsExists) {
        await createAdminLogsTable();
    } else {
        console.log(`ℹ️ Table ${TABLES.ADMIN_LOGS} already exists`);
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

// Create Subscription Plans table
const createSubscriptionPlansTable = async () => {
    const params = {
        TableName: 'UTurnSubscriptionPlans',
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
        console.log(`✅ Table UTurnSubscriptionPlans created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table UTurnSubscriptionPlans already exists`);
        } else {
            throw error;
        }
    }
};

// Create Subscriptions table
const createSubscriptionsTable = async () => {
    const params = {
        TableName: 'UTurnSubscriptions',
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'userId', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'userId-index',
                KeySchema: [
                    { AttributeName: 'userId', KeyType: 'HASH' }
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
        console.log(`✅ Table UTurnSubscriptions created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table UTurnSubscriptions already exists`);
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

// Create Admins table
const createAdminsTable = async () => {
    const params = {
        TableName: TABLES.ADMINS,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'username', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'username-index',
                KeySchema: [
                    { AttributeName: 'username', KeyType: 'HASH' }
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
        console.log(`✅ Table ${TABLES.ADMINS} created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table ${TABLES.ADMINS} already exists`);
        } else {
            throw error;
        }
    }
};

// Create Admin Logs table
const createAdminLogsTable = async () => {
    const params = {
        TableName: TABLES.ADMIN_LOGS,
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
        console.log(`✅ Table ${TABLES.ADMIN_LOGS} created successfully`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table ${TABLES.ADMIN_LOGS} already exists`);
        } else {
            throw error;
        }
    }
};

module.exports = { setupTables };

