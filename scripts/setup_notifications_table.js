require('dotenv').config();
const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { TABLES } = require('../src/config/aws');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const createNotificationsTable = async () => {
    const tableName = TABLES.NOTIFICATIONS;
    console.log(`Creating table: ${tableName}...`);
    try {
        const command = new CreateTableCommand({
            TableName: tableName,
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' },
                { AttributeName: 'userId', AttributeType: 'S' },
                { AttributeName: 'createdAt', AttributeType: 'S' }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'UserIndex',
                    KeySchema: [
                        { AttributeName: 'userId', KeyType: 'HASH' },
                        { AttributeName: 'createdAt', KeyType: 'RANGE' }
                    ],
                    Projection: {
                        ProjectionType: 'ALL'
                    },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

        await client.send(command);
        console.log(`✅ Created table: ${tableName} with UserIndex GSI`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️  Table ${tableName} already exists.`);
        } else {
            console.error(`❌ Error creating ${tableName}:`, error.message);
        }
    }
};

createNotificationsTable();
