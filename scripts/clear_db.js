require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);

const clearTable = async (tableName) => {
    console.log(`Clearing table: ${tableName}...`);
    try {
        let items = [];
        let LastEvaluatedKey;
        
        // Scan all items
        do {
            const command = new ScanCommand({
                TableName: tableName,
                ExclusiveStartKey: LastEvaluatedKey
            });
            const response = await docClient.send(command);
            items = items.concat(response.Items || []);
            LastEvaluatedKey = response.LastEvaluatedKey;
        } while (LastEvaluatedKey);

        console.log(`Found ${items.length} items in ${tableName}. Deleting...`);

        if (items.length === 0) {
            console.log(`Table ${tableName} is already empty.`);
            return;
        }

        // Delete items in batches (or one by one for simplicity since v3)
        // For simplicity and safety let's do parallel promises
        const deletePromises = items.map(item => {
            return docClient.send(new DeleteCommand({
                TableName: tableName,
                Key: { id: item.id } // Assuming 'id' is the primary key
            }));
        });

        await Promise.all(deletePromises);
        console.log(`Successfully cleared ${tableName}.`);
    } catch (error) {
        console.error(`Error clearing ${tableName}:`, error);
    }
};

const main = async () => {
    await clearTable('uturn-bookings');
    await clearTable('uturn-solo-rides');
    console.log('Database cleanup complete.');
};

main();
