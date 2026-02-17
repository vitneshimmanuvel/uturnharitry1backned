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

const listData = async () => {
    try {
        console.log('--- DRIVERS ---');
      // Scan Drivers
const driverParams = { TableName: 'uturn-drivers' }; // Changed TABLE_NAMES.drivers to 'uturn-drivers'
const drivers = await docClient.send(new ScanCommand(driverParams)); // Changed dc to docClient
const targetPhone = '1234567891';
const filteredDrivers = drivers.Items.filter(d => d.phone === targetPhone);

console.log(`\nFound ${drivers.Items.length} drivers.`);
console.log(`Found ${filteredDrivers.length} drivers with phone ${targetPhone}:`);
filteredDrivers.forEach(d => console.log(JSON.stringify(d)));
        // The original closing brace was removed as it was syntactically incorrect in the new context.

        console.log('\n--- BOOKINGS ---');
        const bookings = await docClient.send(new ScanCommand({ TableName: 'uturn-bookings' }));
        console.log(`Found ${bookings.Items?.length || 0} bookings.`);
        bookings.Items?.forEach(b => {
             console.log(JSON.stringify(b));
        });
        
    } catch (error) {
        console.error('Error:', error);
    }
};

listData();
