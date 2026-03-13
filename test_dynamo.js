const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const docClient = DynamoDBDocumentClient.from(client);

async function testUpdate() {
    try {
        await docClient.send(new PutCommand({
            TableName: 'uturn-bookings',
            Item: { id: 'TEST-123', status: 'draft', vendorId: 'test' }
        }));
        
        await docClient.send(new UpdateCommand({
            TableName: 'uturn-bookings',
            Key: { id: 'TEST-123' },
            UpdateExpression: 'SET #a1 = :v1, #a2 = :v2',
            ExpressionAttributeNames: { '#a1': 'something', '#a2': 'another' },
            ExpressionAttributeValues: { ':v1': null, ':v2': '' }
        }));
        console.log('Update worked!');
    } catch(e) {
        console.error('DynamoDB Error:', e.name, e.message);
    }
}
testUpdate();
