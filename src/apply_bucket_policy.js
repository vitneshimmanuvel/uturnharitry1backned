require('dotenv').config();
const { S3Client, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({ region: process.env.AWS_REGION });
const bucket = process.env.S3_BUCKET_NAME || 'uturn-documents';

const run = async () => {
    try {
        console.log(`Applying Public Read Policy to '${bucket}'...`);
        
        const policy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "PublicReadGetObject",
                    Effect: "Allow",
                    Principal: "*",
                    Action: "s3:GetObject",
                    Resource: `arn:aws:s3:::${bucket}/*`
                }
            ]
        };

        await client.send(new PutBucketPolicyCommand({
            Bucket: bucket,
            Policy: JSON.stringify(policy)
        }));
        
        console.log('✅ Bucket policy applied successfully!');
    } catch (e) {
        console.error('❌ Failed to apply policy:', e.message);
    }
};

run();
