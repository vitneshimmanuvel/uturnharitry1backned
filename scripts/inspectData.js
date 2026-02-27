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
    const tables = ["uturn-bookings", "UTurnBookings"];
    for (const t of tables) {
        output += `\n--- Table: ${t} ---\n`;
        try {
            const res = await docClient.send(new ScanCommand({ TableName: t }));
            output += `Count: ${res.Items ? res.Items.length : 0}\n`;
            if (res.Items && res.Items.length > 0) {
                output += "Recent Items:\n" + JSON.stringify(res.Items, null, 2) + "\n";
            }
        } catch (e) {
            output += `Error reading ${t}: ${e.message}\n`;
        }
    }

    output += "\n--- DRIVERS ---\n";
    const dRes = await docClient.send(new ScanCommand({ TableName: "uturn-drivers" }));
    output += `Count: ${dRes.Items ? dRes.Items.length : 0}\n`;
    const vijay = dRes.Items.find(d => d.name && d.name.toLowerCase().includes("vijay"));
    if (vijay) {
        output += "Vijay Profile:\n" + JSON.stringify(vijay, null, 2) + "\n";
    }

    fs.writeFileSync('datadump.json', output);
    console.log("Data dumped to datadump.json");

  } catch (error) {
    console.error("Error:", error);
  }
}

inspectData();
