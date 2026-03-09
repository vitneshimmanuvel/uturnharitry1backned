require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { TABLES } = require('../src/config/aws');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
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

        // Delete items in parallel
        const deletePromises = items.map(item => {
            // All tables use 'id' as hash key
            return docClient.send(new DeleteCommand({
                TableName: tableName,
                Key: { id: item.id }
            })).catch(err => {
                console.error(`Failed to delete item ${item.id} from ${tableName}:`, err.message);
            });
        });

        await Promise.all(deletePromises);
        console.log(`Successfully cleared ${tableName}.`);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.warn(`Table ${tableName} does not exist, skipping.`);
        } else {
            console.error(`Error clearing ${tableName}:`, error.message);
        }
    }
};

const main = async () => {
    console.log('--- Comprehensive Database Cleanup Started ---');
    
    // Get unique table names from TABLES config
    const tableList = [...new Set(Object.values(TABLES))];
    
    // Also try common names that might not be in config if user mentioned them
    if (!tableList.includes('uturn-customers')) {
        tableList.push('uturn-customers');
    }
    
    for (const table of tableList) {
        await clearTable(table);
    }
    
    console.log('--- Database Cleanup Complete ---');
};

main();
