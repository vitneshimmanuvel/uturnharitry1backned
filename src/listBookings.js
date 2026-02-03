/**
 * Script to LIST all bookings from DynamoDB
 * Run: node src/listBookings.js
 */
require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'uturn-bookings';

async function listBookings() {
    console.log('🔍 Scanning bookings in DynamoDB...\n');
    
    try {
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));
        
        const items = scanResult.Items || [];
        console.log(`📊 Total Bookings: ${items.length}\n`);
        
        if (items.length === 0) {
            console.log('❌ No bookings found.');
            return;
        }

        console.log('| Status      | City         | Vehicle | Customer       | Amount');
        console.log('|-------------|--------------|---------|----------------|--------');
        
        items.forEach(b => {
            console.log(`| ${b.status.padEnd(11)} | ${(b.pickupCity || 'N/A').padEnd(12)} | ${(b.vehicleType || 'N/A').padEnd(7)} | ${(b.customerName || 'Unknown').padEnd(14)} | ₹${b.packageAmount || b.estimatedFare}`);
        });
        
        console.log('\n✅ Data check complete.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

listBookings();
