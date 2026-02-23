/**
 * Wipe All UTurn Data
 * Deletes all items from all identified DynamoDB tables
 */
require('dotenv').config();
const { DynamoDBClient, ScanCommand, BatchWriteItemCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const TABLES = [
    'UTurnBookings',
    'UTurnReferrals',
    'UTurnWallet',
    'uturn-bookings',
    'uturn-drivers',
    'uturn-loans',
    'uturn-solo-rides',
    'uturn-vehicles',
    'uturn-vendors',
    'uturntry',
    'RateCards'
];

async function getTableKeys(tableName) {
    const describe = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return describe.Table.KeySchema.map(k => k.AttributeName);
}

async function wipeTable(tableName) {
    try {
        console.log(`🔍 Wiping table: ${tableName}...`);
        
        // 1. Get Key Schema
        const keys = await getTableKeys(tableName);
        
        let lastKey = null;
        let totalDeleted = 0;

        do {
            // 2. Scan for items
            const scan = await client.send(new ScanCommand({
                TableName: tableName,
                ExclusiveStartKey: lastKey,
                Limit: 25
            }));

            if (scan.Items && scan.Items.length > 0) {
                // 3. Prepare batch delete
                const deleteRequests = scan.Items.map(item => {
                    const key = {};
                    keys.forEach(k => {
                        key[k] = item[k];
                    });
                    return { DeleteRequest: { Key: key } };
                });

                await client.send(new BatchWriteItemCommand({
                    RequestItems: {
                        [tableName]: deleteRequests
                    }
                }));
                
                totalDeleted += scan.Items.length;
                console.log(`🗑️  Deleted ${totalDeleted} items from ${tableName}...`);
            }
            
            lastKey = scan.LastEvaluatedKey;
        } while (lastKey);

        console.log(`✅ Table ${tableName} is now empty.\n`);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`ℹ️  Table ${tableName} not found, skipping.\n`);
        } else {
            console.error(`❌ Error wiping table ${tableName}:`, error.message);
        }
    }
}

async function main() {
    console.log('\n🧨 UTurn GLOBAL DATA WIPE 🧨\n');
    console.log('============================\n');
    
    for (const table of TABLES) {
        await wipeTable(table);
    }
    
    console.log('============================');
    console.log('🏁 All tables processed.');
    console.log('============================\n');
}

main();
