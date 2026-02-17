require('dotenv').config();
const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { TABLES } = require('../src/config/aws');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const createTable = async (tableName) => {
    console.log(`Checking table: ${tableName}...`);
    try {
        const command = new CreateTableCommand({
            TableName: tableName,
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

        await client.send(command);
        console.log(`✅ Created table: ${tableName}`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️  Table ${tableName} already exists.`);
        } else {
            console.error(`❌ Error creating ${tableName}:`, error.message);
        }
    }
};

const main = async () => {
    console.log('--- Database Setup Started ---');
    
    // Iterate over all tables defined in check
    const tables = Object.values(TABLES);
    // Remove duplicates if any (e.g. aliases)
    const uniqueTables = [...new Set(tables)];
    
    for (const tableName of uniqueTables) {
        await createTable(tableName);
    }
    
    console.log('--- Database Setup Complete ---');
};

main();
