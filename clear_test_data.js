const { dynamoClient, docClient, TABLE_NAMES } = require('./src/config/aws');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function clearTable(tableName) {
    console.log(`Clearing table: ${tableName}...`);
    try {
        const scanResult = await docClient.send(new ScanCommand({
            TableName: tableName
        }));

        if (!scanResult.Items || scanResult.Items.length === 0) {
            console.log(`Table ${tableName} is already empty.`);
            return;
        }

        console.log(`Found ${scanResult.Items.length} items to delete in ${tableName}.`);

        for (const item of scanResult.Items) {
            await docClient.send(new DeleteCommand({
                TableName: tableName,
                Key: { id: item.id }
            }));
        }
        console.log(`Successfully cleared ${tableName}.`);
    } catch (error) {
        console.error(`Error clearing table ${tableName}:`, error.message);
    }
}

async function run() {
    await clearTable(TABLE_NAMES.BOOKINGS);
    await clearTable(TABLE_NAMES.SOLO_RIDES);
    await clearTable(TABLE_NAMES.NOTIFICATIONS);
    await clearTable(TABLE_NAMES.MARKETPLACE_REQUESTS);
    
    console.log('--- CLEANUP COMPLETE ---');
}

run();
