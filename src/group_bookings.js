require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const run = async () => {
    try {
        console.log('Scanning all bookings...');
        const result = await docClient.send(new ScanCommand({
            TableName: 'uturn-bookings'
        }));
        
        const bookings = result.Items;
        
        const groups = {
            pending: [],
            driver_accepted: [],
            rejected: [],
            vendor_approved: [],
            completed: [],
            other: []
        };
        
        bookings.forEach(b => {
            if (groups[b.status]) {
                groups[b.status].push(b);
            } else {
                groups.other.push(b);
            }
        });
        
        console.log('\n--- DATA REPORT ---');
        
        console.log(`\n🔵 PENDING: ${groups.pending.length}`);
        if(groups.pending.length > 0) printBooking(groups.pending[0]);

        console.log(`\n🟡 DRIVER ACCEPTED: ${groups.driver_accepted.length}`);
        if(groups.driver_accepted.length > 0) printBooking(groups.driver_accepted[0]);

        console.log(`\n🔴 REJECTED: ${groups.rejected.length}`);
        if(groups.rejected.length > 0) printBooking(groups.rejected[0]);
        
        console.log(`\n🟢 APPROVED: ${groups.vendor_approved.length}`);
        if(groups.vendor_approved.length > 0) printBooking(groups.vendor_approved[0]);

    } catch (e) {
        console.error('Error:', e);
    }
};

function printBooking(b) {
    console.log(`- ID: ${b.id}`);
    console.log(`  Customer: ${b.customerName} (${b.customerPhone})`);
    console.log(`  Driver: ${b.driverName || 'N/A'}`);
    console.log(`  Route: ${b.pickupCity} -> ${b.dropCity}`);
    if (b.status === 'rejected') console.log(`  Reason: ${b.rejectionReason}`);
    console.log('---');
}

run();
