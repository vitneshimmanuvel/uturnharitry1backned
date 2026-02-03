/**
 * Script to find a specific customer in DynamoDB
 * Run: node src/findCustomer.js "Jack"
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

async function findCustomer(nameToFind) {
    if (!nameToFind) {
        console.log('Please provide a name. Example: node src/findCustomer.js "Jack"');
        return;
    }

    console.log(`🔍 Searching for customer "${nameToFind}" in DynamoDB...\n`);
    
    try {
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));
        
        const items = scanResult.Items || [];
        const matches = items.filter(item => 
            item.customerName && item.customerName.toLowerCase().includes(nameToFind.toLowerCase())
        );
        
        if (matches.length === 0) {
            console.log(`❌ No bookings found for customer "${nameToFind}"`);
            return;
        }

        console.log(`✅ Found ${matches.length} booking(s) for "${nameToFind}":\n`);
        console.log(JSON.stringify(matches, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Get name from command line arg or default to "jack"
const nameArg = process.argv[2] || 'jack';
findCustomer(nameArg);
