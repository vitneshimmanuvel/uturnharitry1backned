require('dotenv').config();
const { S3Client, ListBucketsCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({ region: process.env.AWS_REGION });

const run = async () => {
    try {
        console.log('--- Listing Buckets ---');
        const data = await client.send(new ListBucketsCommand({}));
        console.log('Buckets:', data.Buckets.map(b => b.Name));
        
        const target = process.env.S3_BUCKET_NAME;
        const exists = data.Buckets.find(b => b.Name === target);
        
        if (!exists) {
            console.log(`\nBucket '${target}' NOT found. Attempting to create...`);
            try {
                await client.send(new CreateBucketCommand({
                    Bucket: target,
                    CreateBucketConfiguration: {
                        LocationConstraint: process.env.AWS_REGION
                    }
                }));
                console.log(`✅ Bucket '${target}' created successfully!`);
            } catch (createErr) {
                console.error(`❌ Failed to create bucket: ${createErr.message}`);
                // Try simpler name if needed?
            }
        } else {
            console.log(`\n✅ Bucket '${target}' exists.`);
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
};

run();
