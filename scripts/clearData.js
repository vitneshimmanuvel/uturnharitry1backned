const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
require("dotenv").config();

const config = {
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const client = new DynamoDBClient(config);
const docClient = DynamoDBDocumentClient.from(client);

const TABLES = ["uturn-bookings", "uturn-solo-rides"];

async function clearTable(tableName) {
  console.log(`\n--- Clearing Table: ${tableName} ---`);
  
  try {
    // 1. Scan for all items (just IDs)
    const scanResult = await docClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: "id"
    }));
    
    const items = scanResult.Items || [];
    console.log(`Found ${items.length} items to delete.`);
    
    if (items.length === 0) return;

    // 2. Batch delete in chunks of 25 (DynamoDB limit)
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      const deleteRequests = chunk.map(item => ({
        DeleteRequest: {
          Key: { id: item.id }
        }
      }));

      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: deleteRequests
        }
      }));
      
      console.log(`Deleted chunk ${Math.floor(i/25) + 1} (${chunk.length} items)`);
    }
    
    console.log(`Successfully cleared ${tableName}!`);
  } catch (error) {
    console.error(`Error clearing ${tableName}:`, error);
  }
}

async function start() {
    for (const table of TABLES) {
        await clearTable(table);
    }
    console.log("\nAll requested tables cleared.");
}

start();
