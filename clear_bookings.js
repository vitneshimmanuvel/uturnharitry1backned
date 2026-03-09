require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLES = ['uturn-bookings', 'uturn-solo-rides'];

async function clearBookings() {
    for (const tableName of TABLES) {
        console.log(`Fetching all items from ${tableName}...`);
        try {
            const scanResult = await docClient.send(new ScanCommand({
                TableName: tableName
            }));

            const items = scanResult.Items || [];
            console.log(`Found ${items.length} items in ${tableName}. Deleting...`);

            for (const item of items) {
                await docClient.send(new DeleteCommand({
                    TableName: tableName,
                    Key: { id: item.id }
                }));
                console.log(`Deleted from ${tableName}: ${item.id}`);
            }
        } catch (err) {
            console.error(`Error clearing ${tableName}:`, err.message);
        }
    }

    console.log('Cleanup complete.');
}

clearBookings().catch(console.error);
