require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    try {
        const result = await docClient.send(new ScanCommand({ TableName: 'uturn-bookings' }));
        const groups = { pending: [], driver_accepted: [], rejected: [], vendor_approved: [], completed: [] };
        result.Items.forEach(b => { if(groups[b.status]) groups[b.status].push(b); });
        
        let output = `--- DATA REPORT ---\n`;
        output += `\n🔵 PENDING: ${groups.pending.length}\n`;
        if(groups.pending.length > 0) output += format(groups.pending[0]);
        
        output += `\n🟡 DRIVER ACCEPTED: ${groups.driver_accepted.length}\n`;
        if(groups.driver_accepted.length > 0) output += format(groups.driver_accepted[0]);
        
        output += `\n🔴 REJECTED: ${groups.rejected.length}\n`;
        if(groups.rejected.length > 0) output += format(groups.rejected[0]);
        
        output += `\n🟢 APPROVED: ${groups.vendor_approved.length}\n`;
        if(groups.vendor_approved.length > 0) output += format(groups.vendor_approved[0]);
        
        fs.writeFileSync('report.txt', output);
        console.log('Report written to report.txt');
    } catch (e) { console.error(e); }
};

function format(b) {
    return `- ID: ${b.id}\n  Customer: ${b.customerName} (${b.customerPhone})\n  Driver: ${b.driverName || 'N/A'}\n  Route: ${b.pickupCity} -> ${b.dropCity}\n  Status: ${b.status}\n---\n`;
}

run();
