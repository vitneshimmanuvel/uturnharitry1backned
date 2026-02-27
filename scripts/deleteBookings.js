/**
 * DELETE ALL BOOKINGS AND SOLO RIDES
 * DANGER: This script permanently deletes all records from uturn-bookings and uturn-solo-rides.
 */
require('dotenv').config();
const { 
    DynamoDBClient 
} = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    ScanCommand, 
    DeleteCommand 
} = require('@aws-sdk/lib-dynamodb');

// Config
const awsConfig = {
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
};

const ddbClient = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(ddbClient);

const TABLES = {
    BOOKINGS: "uturn-bookings",
    SOLO_RIDES: "uturn-solo-rides"
};

async function deleteTableItems(tableName) {
    console.log(`--- Deleting All Items from Table: ${tableName} ---`);
    try {
        let isTruncated = true;
        let lastEvaluatedKey;
        let totalDeleted = 0;

        while (isTruncated) {
            const scanCommand = new ScanCommand({
                TableName: tableName,
                ExclusiveStartKey: lastEvaluatedKey,
                ProjectionExpression: "id" // Only need the partition key for deletion
            });

            const response = await docClient.send(scanCommand);
            const items = response.Items || [];

            if (items.length > 0) {
                console.log(`Found ${items.length} items to delete...`);
                for (const item of items) {
                    await docClient.send(new DeleteCommand({
                        TableName: tableName,
                        Key: { id: item.id }
                    }));
                    totalDeleted++;
                }
            }

            lastEvaluatedKey = response.LastEvaluatedKey;
            isTruncated = !!lastEvaluatedKey;
        }
        console.log(`Successfully deleted ${totalDeleted} items from ${tableName}.`);
    } catch (error) {
        console.error(`Deletion failed for ${tableName}:`, error.message);
    }
}

async function main() {
    console.log('⚠️  Starting Data Deletion...');
    await deleteTableItems(TABLES.BOOKINGS);
    await deleteTableItems(TABLES.SOLO_RIDES);
    console.log('✅ Data Deletion Finished.');
}

main();
