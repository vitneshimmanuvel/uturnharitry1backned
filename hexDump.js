const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
require("dotenv").config();

const config = {
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const client = new DynamoDBClient(config);
const docClient = DynamoDBDocumentClient.from(client);

async function hexDump() {
  const res = await docClient.send(new ScanCommand({ TableName: "uturn-bookings" }));
  for (const item of res.Items) {
    console.log(`ID: '${item.id}'`);
    console.log(`ID Hex: ${Buffer.from(item.id).toString('hex')}`);
    console.log(`Status: '${item.status}'`);
    console.log(`Status Hex: ${Buffer.from(item.status).toString('hex')}`);
  }
}

hexDump();
