/**
 * Run: node src/showJack.js
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

async function showJack() {
    try {
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));
        
        const items = scanResult.Items || [];
        const matches = items.filter(item => 
            item.customerName && item.customerName.toLowerCase().includes('jack')
        );

        if (matches.length === 0) {
            console.log('No "Jack" found.');
            return;
        }

        console.log('\n✅ FOUND DATA FOR "JACK":');
        console.log('--------------------------------------------------');
        
        matches.forEach(b => {
             console.log(`Name      : ${b.customerName}`);
             console.log(`Phone     : ${b.customerPhone}`);
             console.log(`Pickup    : ${b.pickupAddress}`);
             console.log(`Drop      : ${b.dropAddress}`);
             console.log(`City      : ${b.pickupCity}`);
             console.log(`Amount    : ₹${b.packageAmount || b.estimatedFare}`);
             console.log(`Vehicle   : ${b.vehicleType}`);
             console.log(`Status    : ${b.status}`);
             console.log(`Created   : ${b.createdAt || 'N/A'}`);
             console.log('--------------------------------------------------\n');
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

showJack();
