/**
 * Script to delete all bookings from DynamoDB
 * Run: node src/clearAllBookings.js
 */
require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// DynamoDB Setup
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'uturn-bookings';

async function clearAllBookings() {
    console.log('🗑️  Scanning all bookings in DynamoDB...\n');
    
    try {
        // First, scan to get all items
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));
        
        const items = scanResult.Items || [];
        console.log(`📊 Found ${items.length} bookings to delete\n`);
        
        if (items.length === 0) {
            console.log('✅ Database is already empty!');
            return;
        }
        
        // Delete each item
        for (const item of items) {
            await docClient.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { id: item.id }
            }));
            console.log(`❌ Deleted: ${item.customerName || item.id}`);
        }
        
        console.log('\n✅ All bookings deleted successfully!');
        console.log('💡 The Driver app will now show empty ride list.');
        console.log('📱 Create new bookings from Vendor app to test the flow.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

clearAllBookings();
