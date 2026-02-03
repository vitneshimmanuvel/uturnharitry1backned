/**
 * Script to find the LATEST booking in DynamoDB
 * Run: node src/getLatestBooking.js
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

async function getLatestBooking() {
    console.log('🔍 Fetching latest booking...\n');
    
    try {
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));
        
        const items = scanResult.Items || [];
        
        if (items.length === 0) {
            console.log('❌ Database is empty.');
            return;
        }

        // Sort by createdAt desc
        items.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA; // Newest first
        });

        const latest = items[0];
        
        console.log('✅ LATEST BOOKING FOUND:');
        console.log(JSON.stringify(latest, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

getLatestBooking();
