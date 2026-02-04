
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamoDb } = require('../src/config/aws');

const docClient = DynamoDBDocumentClient.from(dynamoDb);

const listUsers = async () => {
    try {
        console.log('--- DRIVERS ---');
        const drivers = await docClient.send(new ScanCommand({ TableName: 'uturn-drivers' }));
        if (drivers.Items.length === 0) {
            console.log('No drivers found.');
        } else {
            drivers.Items.forEach(d => {
                console.log(`[${d.id}] ${d.name} (${d.phone}) - Online: ${d.isOnline}`);
            });
        }

        console.log('\n--- VENDORS ---');
        const vendors = await docClient.send(new ScanCommand({ TableName: 'uturn-vendors' }));
        if (vendors.Items.length === 0) {
            console.log('No vendors found.');
        } else {
            vendors.Items.forEach(v => {
                console.log(`[${v.id}] ${v.ownerName} (${v.phone}) - Business: ${v.businessName}`);
            });
        }
    } catch (error) {
        console.error('Error listing users:', error);
    }
};

listUsers();
