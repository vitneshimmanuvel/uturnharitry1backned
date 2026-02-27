const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require('fs');
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

async function inspectData() {
  let output = "";
  try {
    output += "\n--- Table: uturn-marketplace-requests ---\n";
    const res = await docClient.send(new ScanCommand({ TableName: "uturn-marketplace-requests" }));
    output += `Count: ${res.Items ? res.Items.length : 0}\n`;
    if (res.Items && res.Items.length > 0) {
        output += "Items:\n" + JSON.stringify(res.Items, null, 2) + "\n";
    }

    fs.writeFileSync('marketplacedump.json', output);
    console.log("Data dumped to marketplacedump.json");

  } catch (error) {
    console.error("Error:", error);
  }
}

inspectData();
