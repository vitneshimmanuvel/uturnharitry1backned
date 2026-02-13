require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    try {
        const result = await docClient.send(new ScanCommand({ TableName: 'uturn-bookings' }));
        const groups = { 
            pending: [], 
            driver_accepted: [], 
            vendor_approved: [], 
            in_progress: [],
            completed: [], 
            cancelled: [],
            rejected: [], 
            draft: [],
            others: []
        };

        result.Items.forEach(b => { 
            if(groups[b.status]) {
                groups[b.status].push(b); 
            } else {
                groups.others.push(b);
            }
        });
        
        let output = `--- DATA REPORT (${new Date().toISOString()}) ---\n`;
        
        const sections = [
            { key: 'draft', label: '⚪ DRAFT' },
            { key: 'pending', label: '🔵 PENDING' },
            { key: 'driver_accepted', label: '🟡 DRIVER ACCEPTED' },
            { key: 'vendor_approved', label: '🟢 VENDOR APPROVED' },
            { key: 'in_progress', label: '🚗 IN PROGRESS' },
            { key: 'completed', label: '🏁 COMPLETED' },
            { key: 'cancelled', label: '❌ CANCELLED' },
            { key: 'rejected', label: '⚠️ REJECTED' },
            { key: 'others', label: '❓ OTHERS' }
        ];

        sections.forEach(sec => {
            output += `\n${sec.label}: ${groups[sec.key].length}\n`;
            if (groups[sec.key].length > 0) {
                // Show first 5 items to avoid huge logs, or all? Let's show all for now as requested.
                groups[sec.key].forEach(item => {
                    output += format(item);
                });
            }
        });
        
        fs.writeFileSync('report.txt', output);
        console.log('Report written to report.txt');
    } catch (e) { console.error(e); }
};

function format(b) {
    return `- ID: ${b.id}\n  Customer: ${b.customerName} (${b.customerPhone})\n  Driver: ${b.driverName || 'N/A'}\n  Route: ${b.pickupCity} -> ${b.dropCity}\n  Status: ${b.status}\n---\n`;
}

run();
