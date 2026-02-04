require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

// Helper to find a booking to test with
async function findBooking() {
    console.log('--- Finding Test Booking ---');
    const result = await docClient.send(new ScanCommand({
        TableName: 'uturn-bookings',
        Limit: 10
    }));
    
    // Look for one that driver has accepted (or any for testing)
    // Ideally one that is NOT 'completed'
    const booking = result.Items.find(b => b.status === 'driver_accepted' || b.status === 'pending');
    
    if (booking) {
        console.log(`Found Booking: ${booking.id} (${booking.status})`);
        return booking;
    } else {
        console.log('No suitable booking found. Creating new one...');
        // TODO: Create if needed, but for now just fail if empty
        return null;
    }
}

async function testUpload() {
    const booking = await findBooking();
    if (!booking) {
        console.error('CRITICAL: No bookings availble to test!');
        return;
    }

    const bookingId = booking.id;
    const driverId = booking.assignedDriverId || 'test-driver-id';
    
    console.log(`\n--- Simulating Upload for ID: '${bookingId}' ---`);
    
    // Create dummy video file
    fs.writeFileSync('test_vid.mp4', 'dummy content');
    
    const form = new FormData();
    form.append('driverId', driverId);
    form.append('video', fs.createReadStream('test_vid.mp4'));
    
    try {
        const response = await axios.post(
            `http://localhost:3000/api/bookings/${bookingId}/driver-video`,
            form,
            { headers: { ...form.getHeaders() } }
        );
        
        console.log('✅ Response:', response.data);
    } catch (e) {
        console.error('❌ Upload Failed:');
        if (e.response) {
            console.error(`Status: ${e.response.status}`);
            console.error('Data:', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error(e.message);
        }
    }
}

testUpload();
