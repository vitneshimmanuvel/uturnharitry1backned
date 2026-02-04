require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    const driverId = 'baf04f3d-eb0f-43ff-b45c-51b478fa9061'; // John Driver
    console.log(`Checking bookings for driver: ${driverId}`);
    
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: 'uturn-bookings',
            FilterExpression: 'assignedDriverId = :did',
            ExpressionAttributeValues: {
                ':did': driverId
            }
        }));
        
        console.log(`Found ${result.Items.length} bookings assigned to driver.`);
        result.Items.forEach(b => {
            console.log(`- ID: ${b.id}`);
            console.log(`  Status: ${b.status}`);
            console.log(`  Pickup: ${b.pickupCity}`);
            console.log(`  Video: ${b.driverVideoUrl ? 'YES' : 'NO'}`);
            console.log('---');
        });
    } catch (e) {
        console.error('Scan failed:', e);
    }
};

run();
