require('dotenv').config();
const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const TABLE_BOOKINGS = 'uturn-bookings';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'uturn-documents';

const cleanDynamoDB = async () => {
    console.log(`\n🧹 Cleaning DynamoDB Table: ${TABLE_BOOKINGS}...`);
    try {
        let items = [];
        let lastEvaluatedKey;
        
        // Scan all Items
        do {
            const command = new ScanCommand({
                TableName: TABLE_BOOKINGS,
                ProjectionExpression: 'id',
                ExclusiveStartKey: lastEvaluatedKey
            });
            const response = await dynamoClient.send(command);
            if (response.Items) items.push(...response.Items);
            lastEvaluatedKey = response.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        console.log(`   Found ${items.length} items to delete.`);
        
        if (items.length === 0) return;

        // Delete individually (BatchWrite is limited to 25, loop is simpler for script)
        let count = 0;
        for (const item of items) {
            await dynamoClient.send(new DeleteItemCommand({
                TableName: TABLE_BOOKINGS,
                Key: { id: item.id }
            }));
            process.stdout.write('.');
            count++;
        }
        console.log(`\n   ✅ Deleted ${count} bookings.`);

    } catch (e) {
        console.error('   ❌ DynamoDB Cleanup Failed:', e.message);
    }
};

const cleanS3 = async () => {
    console.log(`\n🧹 Cleaning S3 Bucket: ${BUCKET_NAME}...`);
    try {
        const listCommand = new ListObjectsV2Command({ Bucket: BUCKET_NAME });
        const listResponse = await s3Client.send(listCommand);

        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log('   Bucket is already empty.');
            return;
        }

        console.log(`   Found ${listResponse.Contents.length} objects.`);
        
        const deleteParams = {
            Bucket: BUCKET_NAME,
            Delete: {
                Objects: listResponse.Contents.map(item => ({ Key: item.Key }))
            }
        };

        await s3Client.send(new DeleteObjectsCommand(deleteParams));
        console.log('   ✅ Deleted all objects from S3.');

    } catch (e) {
        console.error('   ❌ S3 Cleanup Failed:', e.message);
    }
};

const run = async () => {
    console.log('⚠️  STARTING SYSTEM CLEANUP (Bookings & Videos ONLY) ⚠️');
    console.log('----------------------------------------------------');
    await cleanDynamoDB();
    await cleanS3();
    console.log('\n----------------------------------------------------');
    console.log('✨ System Cleaned. Vendors/Drivers accounts Preserved.');
};

run();
