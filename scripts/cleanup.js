/**
 * Database Cleanup Script
 * Deletes ALL records from all DynamoDB tables except customer-specific data.
 * Usage: node scripts/cleanup.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const awsConfig = {
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const dynamoClient = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true },
});

const TABLES_TO_CLEAN = [
  { name: 'uturn-drivers', key: 'id' },
  { name: 'uturn-vendors', key: 'id' },
  { name: 'uturn-bookings', key: 'id' },
  { name: 'uturn-vehicles', key: 'id' },
  { name: 'uturn-loans', key: 'id' },
  { name: 'uturn-solo-rides', key: 'id' },
  { name: 'uturn-marketplace-requests', key: 'id' },
];

async function clearTable(tableName, partitionKey) {
  console.log(`\n🗑️  Cleaning table: ${tableName}`);
  let totalDeleted = 0;
  let lastEvaluatedKey = undefined;

  do {
    // Scan for items
    const scanResult = await docClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: '#pk',
      ExpressionAttributeNames: { '#pk': partitionKey },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    const items = scanResult.Items || [];
    lastEvaluatedKey = scanResult.LastEvaluatedKey;

    if (items.length === 0) {
      console.log(`   ✅ Table is already empty`);
      continue;
    }

    // Batch delete (max 25 per batch)
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      const deleteRequests = batch.map(item => ({
        DeleteRequest: { Key: { [partitionKey]: item[partitionKey] } },
      }));

      await docClient.send(new BatchWriteCommand({
        RequestItems: { [tableName]: deleteRequests },
      }));

      totalDeleted += batch.length;
    }
  } while (lastEvaluatedKey);

  console.log(`   ✅ Deleted ${totalDeleted} items from ${tableName}`);
  return totalDeleted;
}

async function main() {
  console.log('='.repeat(50));
  console.log('🧹 U-Turn Database Cleanup');
  console.log('='.repeat(50));

  let grandTotal = 0;

  for (const table of TABLES_TO_CLEAN) {
    try {
      const count = await clearTable(table.name, table.key);
      grandTotal += count;
    } catch (err) {
      console.error(`   ❌ Error cleaning ${table.name}: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Cleanup complete! Total items deleted: ${grandTotal}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
