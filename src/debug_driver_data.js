const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);

const debugDrivers = async () => {
    try {
        console.log('Scanning drivers table...');
        // Assume table name is 'uturn-drivers' or 'Drivers' based on previous context
        // Let's list tables first to be sure or just try 'uturn-drivers' as it worked before
        const TABLE_NAME = 'uturn-drivers';
        
        const result = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));

        const drivers = result.Items || [];
        console.log(`Found ${drivers.length} drivers.`);
        
        // Sort by createdAt desc
        drivers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        console.log('\n--- Latest 5 Drivers ---');
        drivers.slice(0, 5).forEach(d => {
            console.log(`Name: ${d.name}`);
            console.log(`Phone: ${d.phone}`);
            console.log(`Referral Code: ${d.referralCode}`);
            console.log(`Referred By: ${d.referredBy}`);
            console.log(`Referral Count: ${d.referralCount}`);
            console.log('-------------------------');
        });

    } catch (error) {
        console.error('Error:', error);
    }
};

debugDrivers();
