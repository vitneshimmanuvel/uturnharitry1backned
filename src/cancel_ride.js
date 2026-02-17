const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
require('dotenv').config();

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'uturn-bookings';

const findAndCancel = async () => {
    try {
        console.log(`Scanning table ${TABLE_NAME}...`);
        
        // Scan for non-completed rides
        const scanCmd = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: "#status <> :c AND #status <> :can",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: { 
                ":c": "completed",
                ":can": "cancelled"
            }
        });
        
        const data = await docClient.send(scanCmd);
        console.log(`Found ${data.Items.length} active bookings.`);
        
        for (const item of data.Items) {
            console.log(`ID: ${item.id}, Status: ${item.status}, DisplayID: ${item.id.substring(0, 8).toUpperCase()}`);
            
            if (item.id.substring(0, 8).toUpperCase() === '61BF01D1') {
                console.log(`MATCH FOUND! Cancelling ${item.id}...`);
                
                const updateCmd = new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { id: item.id },
                    UpdateExpression: "set #status = :s",
                    ExpressionAttributeNames: { "#status": "status" },
                    ExpressionAttributeValues: { ":s": "cancelled" },
                });
                await docClient.send(updateCmd);
                console.log('Cancelled.');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
};

findAndCancel();
