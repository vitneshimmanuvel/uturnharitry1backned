/**
 * Script to fix bookings assigned to placeholder 'DRIVER_ID'
 * Run: node src/fix_bookings.js
 */
require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'uturn-bookings';
const TARGET_DRIVER_ID = 'baf04f3d-eb0f-43ff-b45c-51b478fa9061'; // Your real Driver UUID

async function fixBookings() {
    console.log('🔍 Scanning for broken bookings...');
    
    try {
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'assignedDriverId = :placeholder',
            ExpressionAttributeValues: {
                ':placeholder': 'DRIVER_ID'
            }
        }));
        
        const brokenBookings = scanResult.Items || [];
        console.log(`Found ${brokenBookings.length} bookings with "DRIVER_ID".`);

        if (brokenBookings.length === 0) {
            console.log('✅ No broken bookings found.');
            return;
        }

        console.log(`🛠️ moving them to ${TARGET_DRIVER_ID}...`);

        for (const booking of brokenBookings) {
            await docClient.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { id: booking.id },
                UpdateExpression: 'SET assignedDriverId = :newId, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':newId': TARGET_DRIVER_ID,
                    ':now': new Date().toISOString()
                }
            }));
            console.log(`   - Fixed booking ${booking.id}`);
        }
        
        console.log('\n✅ All Done! Please refresh your "My Rides" tab.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

fixBookings();
