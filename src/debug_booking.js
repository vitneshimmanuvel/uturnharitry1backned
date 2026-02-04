const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const docClient = DynamoDBDocumentClient.from(client);

const checkBooking = async () => {
    const id = 'a2d1e3ba-cc8c-4cbd-83ad-aee6f1f9aa9a';
    console.log(`Checking booking: ${id}`);
    
    try {
        const result = await docClient.send(new GetCommand({
            TableName: 'uturn-bookings',
            Key: { id }
        }));
        
        if (!result.Item) {
            console.log('Booking not found!');
        } else {
            const b = result.Item;
            console.log('--- BOOKING DATA ---');
            console.log(`ID: ${b.id}`);
            console.log(`DistanceKm: ${b.distanceKm} (Type: ${typeof b.distanceKm})`);
            console.log(`EstimatedDurationMins: ${b.estimatedDurationMins}`);
            console.log(`TotalAmount: ${b.totalAmount}`);
            console.log(`EstimatedFare: ${b.estimatedFare}`);
            console.log(`PickupLocation:`, b.pickupLocation);
            console.log(`DropLocation:`, b.dropLocation);
            console.log('--------------------');
        }
    } catch (error) {
        console.error('Error:', error);
    }
};

checkBooking();
