require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: 'uturn-bookings',
            ProjectionExpression: 'id, #status, vendorId, driverName',
            ExpressionAttributeNames: { '#status': 'status' }
        }));
        
        console.log('Bookings:');
        result.Items.forEach(b => console.log(`${b.id} | ${b.status} | ${b.driverName}`));
    } catch(e) { console.error(e); }
};
run();
