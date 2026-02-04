require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    console.log('--- Inspecting Booking Data ---');
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: 'uturn-bookings',
            Limit: 5 // Get last 5
        }));
        
        console.log(`Total Bookings Found: ${result.Count}`);
        
        if (result.Items.length > 0) {
            // Sort by createdAt descending to get the LATEST
            const sorted = result.Items.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            const fs = require('fs');
            fs.writeFileSync('booking_dump.txt', JSON.stringify(latest, null, 2));
            console.log('Dumped latest booking to booking_dump.txt');
            
            sorted.forEach(b => {
                console.log(`ID: ${b.id} | Status: ${b.status}`);
            });
        } else {
            console.log('No bookings found.');
        }
    } catch (e) {
        console.error('Error:', e);
    }
};

run();
