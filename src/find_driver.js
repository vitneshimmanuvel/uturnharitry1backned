require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    try {
        console.log('Searching for driver with phone 1234567891...');
        const result = await docClient.send(new ScanCommand({
            TableName: 'uturn-drivers',
            FilterExpression: 'phone = :phone',
            ExpressionAttributeValues: { ':phone': '1234567891' }
        }));
        
        if (result.Items && result.Items.length > 0) {
            console.log('FOUND_DRIVER_ID:', result.Items[0].id);
            console.log('DRIVER_DATA:', JSON.stringify(result.Items[0]));
        } else {
            console.log('NOT FOUND');
        }
    } catch(e) { console.error('Error:', e); }
};
run();
