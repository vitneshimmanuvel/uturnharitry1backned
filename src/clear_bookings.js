/**
 * Clear ALL bookings from uturn-bookings table
 * Also unblocks any drivers that were blocked for payment
 */
require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const BOOKINGS_TABLE = 'uturn-bookings';
const DRIVERS_TABLE = 'uturn-drivers';

async function clearAllBookings() {
    console.log('=== CLEARING ALL BOOKINGS ===\n');
    
    // 1. Scan all bookings
    let allBookings = [];
    let lastKey = undefined;
    
    do {
        const result = await docClient.send(new ScanCommand({
            TableName: BOOKINGS_TABLE,
            ExclusiveStartKey: lastKey
        }));
        allBookings = allBookings.concat(result.Items || []);
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`Found ${allBookings.length} bookings to delete.`);
    
    if (allBookings.length === 0) {
        console.log('No bookings to delete. Table is already empty.');
        return;
    }
    
    // 2. Collect driver IDs that might be blocked
    const driverIds = new Set();
    for (const booking of allBookings) {
        if (booking.assignedDriverId) {
            driverIds.add(booking.assignedDriverId);
        }
    }
    
    // 3. Delete all bookings
    let deleted = 0;
    for (const booking of allBookings) {
        await docClient.send(new DeleteCommand({
            TableName: BOOKINGS_TABLE,
            Key: { id: booking.id }
        }));
        deleted++;
        if (deleted % 10 === 0) {
            console.log(`  Deleted ${deleted}/${allBookings.length}...`);
        }
    }
    console.log(`\n✅ Deleted ${deleted} bookings.`);
    
    // 4. Unblock all drivers that had bookings
    console.log(`\nUnblocking ${driverIds.size} drivers...`);
    for (const driverId of driverIds) {
        try {
            await docClient.send(new UpdateCommand({
                TableName: DRIVERS_TABLE,
                Key: { id: driverId },
                UpdateExpression: 'SET #status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':status': 'active' }
            }));
            console.log(`  ✅ Unblocked driver: ${driverId}`);
        } catch (e) {
            console.log(`  ⚠️ Could not unblock driver ${driverId}: ${e.message}`);
        }
    }
    
    console.log('\n=== DONE! All bookings cleared. All drivers unblocked. ===');
}

clearAllBookings().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
