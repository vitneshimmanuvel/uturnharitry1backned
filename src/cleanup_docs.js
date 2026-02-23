require('dotenv').config();
const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const TABLE_DRIVERS = 'uturn-drivers';

const cleanupDriverDocs = async () => {
    console.log(`\n🧹 Starting Cleanup for Driver Documents in ${TABLE_DRIVERS}...`);
    try {
        let items = [];
        let lastEvaluatedKey;
        
        // 1. Scan all Drivers
        do {
            const command = new ScanCommand({
                TableName: TABLE_DRIVERS,
                ExclusiveStartKey: lastEvaluatedKey
            });
            const response = await dynamoClient.send(command);
            if (response.Items) {
                items.push(...response.Items.map(item => unmarshall(item)));
            }
            lastEvaluatedKey = response.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        console.log(`   Found ${items.length} drivers to inspect.`);
        
        let updateCount = 0;

        for (const driver of items) {
            let needsUpdate = false;
            let updatedVehicles = driver.vehicles ? JSON.parse(JSON.stringify(driver.vehicles)) : [];
            let updatedDocuments = driver.documents ? JSON.parse(JSON.stringify(driver.documents)) : {};

            // A. Clean up root-level documents (Legacy)
            const rootRedundant = ['rcFront', 'rcBack', 'insuranceFront', 'insuranceBack', 'permit', 'selfie'];
            rootRedundant.forEach(field => {
                if (updatedDocuments[field] !== undefined) {
                    console.log(`   [${driver.id}] Removing root legacy document: ${field}`);
                    delete updatedDocuments[field];
                    needsUpdate = true;
                }
            });

            // B. Clean up vehicle-level documents
            updatedVehicles.forEach((vehicle, idx) => {
                const vDocs = vehicle.documents || {};
                
                // If has insuranceBack, remove it (Switching to single 'insurance' photo)
                if (vDocs.insuranceBack) {
                    console.log(`   [${driver.id}] Removing insuranceBack for vehicle ${idx}`);
                    // If insuranceFront exists, rename it to 'insurance' if 'insurance' doesn't exist
                    if (vDocs.insuranceFront && !vDocs.insurance) {
                        vDocs.insurance = vDocs.insuranceFront;
                    }
                    delete vDocs.insuranceFront;
                    delete vDocs.insuranceBack;
                    needsUpdate = true;
                } else if (vDocs.insuranceFront) {
                    // Just insuranceFront exists, rename to insurance
                    if (!vDocs.insurance) vDocs.insurance = vDocs.insuranceFront;
                    delete vDocs.insuranceFront;
                    needsUpdate = true;
                }

                // If has permitBack, remove it
                if (vDocs.permitBack) {
                    console.log(`   [${driver.id}] Removing permitBack for vehicle ${idx}`);
                    if (vDocs.permitFront && !vDocs.permit) {
                        vDocs.permit = vDocs.permitFront;
                    }
                    delete vDocs.permitFront;
                    delete vDocs.permitBack;
                    needsUpdate = true;
                } else if (vDocs.permitFront) {
                    if (!vDocs.permit) vDocs.permit = vDocs.permitFront;
                    delete vDocs.permitFront;
                    needsUpdate = true;
                }
            });

            if (needsUpdate) {
                const updateCmd = new UpdateItemCommand({
                    TableName: TABLE_DRIVERS,
                    Key: marshall({ id: driver.id }),
                    UpdateExpression: 'SET documents = :docs, vehicles = :vehicles',
                    ExpressionAttributeValues: marshall({
                        ':docs': updatedDocuments,
                        ':vehicles': updatedVehicles
                    })
                });
                await dynamoClient.send(updateCmd);
                updateCount++;
                console.log(`   ✅ Updated driver: ${driver.phone}`);
            }
        }

        console.log(`\n✨ Cleanup complete! Updated ${updateCount} drivers.`);

    } catch (e) {
        console.error('   ❌ Cleanup Failed:', e.message);
    }
};

cleanupDriverDocs();
