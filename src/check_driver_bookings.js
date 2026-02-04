/**
 * Script to check all bookings and their assigned drivers
 * Run: node src/check_driver_bookings.js
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

async function checkBookings() {
    console.log('🔍 Scanning all bookings...\n');
    
    try {
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));
        
        const items = scanResult.Items || [];
        console.log(`Found ${items.length} total bookings.\n`);

        const summary = {};

        items.forEach(booking => {
            const driverId = booking.assignedDriverId || 'UNASSIGNED';
            const status = booking.status || 'NO_STATUS';
            
            if (!summary[driverId]) {
                summary[driverId] = [];
            }
            summary[driverId].push({
                id: booking.id,
                status: status,
                createdAt: booking.createdAt,
                tripType: booking.tripType
            });
        });

        console.log('--- BOOKINGS BY DRIVER ID ---');
        Object.keys(summary).forEach(driverId => {
            console.log(`\nDriver ID: "${driverId}" (${summary[driverId].length} bookings)`);
            summary[driverId].forEach(b => {
                console.log(`   - [${b.status}] ${b.id} (${b.createdAt})`);
            });
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkBookings();
