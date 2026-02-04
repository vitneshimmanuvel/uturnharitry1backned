require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    console.log('--- System Check ---');
    
    // 1. Check Online Drivers
    try {
        const drivers = await docClient.send(new ScanCommand({
            TableName: 'uturn-drivers',
            FilterExpression: 'isOnline = :true',
            ExpressionAttributeValues: { ':true': true }
        }));
        console.log(`Online Drivers: ${drivers.Items.length}`);
        drivers.Items.forEach(d => console.log(`- ${d.name} (${d.phone})`));
    } catch (e) {
        console.log('Error checking drivers:', e.message);
    }

    // 2. Check Recent Bookings (Last 10 mins)
    try {
        const bookings = await docClient.send(new ScanCommand({
            TableName: 'uturn-bookings'
        }));
        
        const now = new Date();
        const tenMinsAgo = new Date(now.getTime() - 10 * 60000);
        
        const recent = bookings.Items.filter(b => {
            const date = new Date(b.createdAt || b.startTime || 0);
            return date > tenMinsAgo;
        });
        
        console.log(`\nRecent Bookings (<10m): ${recent.length}`);
        recent.forEach(b => {
             console.log(`- ID: ${b.id}`);
             console.log(`  Status: ${b.status}`);
             console.log(`  Driver: ${b.driverName || 'Unassigned'}`);
             console.log(`  Time: ${b.createdAt}`);
        });
    } catch (e) {
        console.log('Error checking bookings:', e.message);
    }
};

run();
