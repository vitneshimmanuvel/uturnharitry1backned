/**
 * CLEANUP MEDIA SCRIPT
 * DANGER: This script deletes objects from S3, local files, and clears DB references.
 */
require('dotenv').config();
const { 
    ListObjectsV2Command, 
    DeleteObjectsCommand, 
    S3Client 
} = require('@aws-sdk/client-s3');
const { 
    DynamoDBClient 
} = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    ScanCommand, 
    UpdateCommand 
} = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

// Config
const awsConfig = {
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
};

const s3Client = new S3Client(awsConfig);
const ddbClient = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(ddbClient);

const S3_BUCKET = process.env.S3_BUCKET_NAME || "uturn-documents";
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');

const TABLES = {
    DRIVERS: "uturn-drivers",
    VENDORS: "uturn-vendors",
    BOOKINGS: "uturn-bookings",
    SOLO_RIDES: "uturn-solo-rides"
};

async function wipeS3() {
    console.log(`--- Wiping S3 Bucket: ${S3_BUCKET} ---`);
    try {
        let isTruncated = true;
        let continuationToken;

        while (isTruncated) {
            const listCommand = new ListObjectsV2Command({
                Bucket: S3_BUCKET,
                ContinuationToken: continuationToken
            });

            const response = await s3Client.send(listCommand);
            const objects = response.Contents || [];

            if (objects.length > 0) {
                const deleteParams = {
                    Bucket: S3_BUCKET,
                    Delete: {
                        Objects: objects.map(obj => ({ Key: obj.Key }))
                    }
                };

                await s3Client.send(new DeleteObjectsCommand(deleteParams));
                console.log(`Deleted ${objects.length} objects from S3`);
            }

            isTruncated = response.IsTruncated;
            continuationToken = response.NextContinuationToken;
        }
        console.log('S3 Wipe Complete.');
    } catch (error) {
        console.error('S3 Wipe Failed:', error.message);
    }
}

async function wipeLocal() {
    console.log(`--- Wiping Local Uploads: ${UPLOAD_DIR} ---`);
    try {
        if (fs.existsSync(UPLOAD_DIR)) {
            const files = fs.readdirSync(UPLOAD_DIR);
            for (const file of files) {
                if (file !== '.gitkeep') {
                    fs.unlinkSync(path.join(UPLOAD_DIR, file));
                    console.log(`Deleted local file: ${file}`);
                }
            }
        }
        console.log('Local Wipe Complete.');
    } catch (error) {
        console.error('Local Wipe Failed:', error.message);
    }
}

async function cleanupDrivers() {
    console.log('--- Cleaning Drivers Table ---');
    try {
        const scan = await docClient.send(new ScanCommand({ TableName: TABLES.DRIVERS }));
        const drivers = scan.Items || [];

        for (const driver of drivers) {
            const updates = {
                profilePic: null,
                documents: {
                    aadharFront: null,
                    aadharBack: null,
                    licenceFront: null,
                    licenceBack: null,
                    selfie: null
                }
            };

            // Also clean vehicle images if any
            if (driver.vehicles && Array.isArray(driver.vehicles)) {
                updates.vehicles = driver.vehicles.map(v => {
                    if (v.documents) {
                        v.documents.vehicleImage = null;
                    }
                    return v;
                });
            }

            const updateExpr = 'SET profilePic = :p, documents = :d' + (updates.vehicles ? ', vehicles = :v' : '');
            const exprVals = {
                ':p': null,
                ':d': updates.documents
            };
            if (updates.vehicles) exprVals[':v'] = updates.vehicles;

            await docClient.send(new UpdateCommand({
                TableName: TABLES.DRIVERS,
                Key: { id: driver.id },
                UpdateExpression: updateExpr,
                ExpressionAttributeValues: exprVals
            }));
            console.log(`Cleaned driver: ${driver.id}`);
        }
    } catch (error) {
        console.error('Drivers Cleanup Failed:', error.message);
    }
}

async function cleanupVendors() {
    console.log('--- Cleaning Vendors Table ---');
    try {
        const scan = await docClient.send(new ScanCommand({ TableName: TABLES.VENDORS }));
        const vendors = scan.Items || [];

        for (const vendor of vendors) {
            await docClient.send(new UpdateCommand({
                TableName: TABLES.VENDORS,
                Key: { id: vendor.id },
                UpdateExpression: 'SET profileImage = :p, documents = :d',
                ExpressionAttributeValues: {
                    ':p': '',
                    ':d': { aadhaar: null, pan: null, selfie: null }
                }
            }));
            console.log(`Cleaned vendor: ${vendor.id}`);
        }
    } catch (error) {
        console.error('Vendors Cleanup Failed:', error.message);
    }
}

async function cleanupBookings() {
    console.log('--- Cleaning Bookings Table ---');
    try {
        const scan = await docClient.send(new ScanCommand({ TableName: TABLES.BOOKINGS }));
        const bookings = scan.Items || [];

        for (const booking of bookings) {
            await docClient.send(new UpdateCommand({
                TableName: TABLES.BOOKINGS,
                Key: { id: booking.id },
                UpdateExpression: 'SET driverVideoUrl = :v, startOdometerUrl = :so, endOdometerUrl = :eo, driverProfilePic = :dp',
                ExpressionAttributeValues: {
                    ':v': null,
                    ':so': null,
                    ':eo': null,
                    ':dp': null
                }
            }));
            console.log(`Cleaned booking: ${booking.id}`);
        }
    } catch (error) {
        console.error('Bookings Cleanup Failed:', error.message);
    }
}

async function cleanupSoloRides() {
    console.log('--- Cleaning Solo Rides Table ---');
    try {
        const scan = await docClient.send(new ScanCommand({ TableName: TABLES.SOLO_RIDES }));
        const rides = scan.Items || [];

        for (const ride of rides) {
            await docClient.send(new UpdateCommand({
                TableName: TABLES.SOLO_RIDES,
                Key: { id: ride.id },
                UpdateExpression: 'SET startOdometerUrl = :so, endOdometerUrl = :eo',
                ExpressionAttributeValues: {
                    ':so': null,
                    ':eo': null
                }
            }));
            console.log(`Cleaned solo ride: ${ride.id}`);
        }
    } catch (error) {
        console.error('Solo Rides Cleanup Failed:', error.message);
    }
}

async function main() {
    console.log('🚀 Starting Global Media Cleanup...');
    await wipeS3();
    await wipeLocal();
    await cleanupDrivers();
    await cleanupVendors();
    await cleanupBookings();
    await cleanupSoloRides();
    console.log('✅ Global Media Cleanup Finished.');
}

main();
