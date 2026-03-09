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

async function test() {
    try {
        const res = await docClient.send(new ScanCommand({TableName: 'uturn-bookings'}));
        console.log("Total Bookings:", res.Items.length);
        res.Items.forEach(t => {
            console.log(`ID: ${t.id}, Status: ${t.status}, Vendor: ${t.vendorId}`);
        });
    } catch(e) {
        console.error(e);
    }
}
test();
