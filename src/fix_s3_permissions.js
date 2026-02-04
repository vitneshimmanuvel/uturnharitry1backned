require('dotenv').config();
const { S3Client, PutPublicAccessBlockCommand, PutBucketPolicyCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({ region: process.env.AWS_REGION });
const bucket = process.env.S3_BUCKET_NAME || 'uturn-documents';

const run = async () => {
    try {
        console.log(`🔧 Fixing Permissions for '${bucket}'...`);

        // 1. Disable "Block Public Access"
        console.log('1. Unblocking Public Access...');
        await client.send(new PutPublicAccessBlockCommand({
            Bucket: bucket,
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: false,
                IgnorePublicAcls: false,
                BlockPublicPolicy: false,
                RestrictPublicBuckets: false
            }
        }));
        console.log('   ✅ Public Access Unblocked.');

        // 2. Apply Public Read Policy
        console.log('2. Applying Public Read Policy...');
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
        console.log('   ✅ Public Policy Applied.');

        // 3. Set CORS (Required for Web Video Player)
        console.log('3. Configuring CORS...');
        await client.send(new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["GET", "HEAD"],
                        AllowedOrigins: ["*"], // Allow all for now (or specific flutter port)
                        ExposeHeaders: []
                    }
                ]
            }
        }));
        console.log('   ✅ CORS Configured.');

        console.log('\n🎉 S3 Bucket is now fully configured for Web Video Playback!');

    } catch (e) {
        console.error('❌ Error configuring S3:', e.message);
    }
};

run();
