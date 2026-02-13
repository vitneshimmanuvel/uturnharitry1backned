const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
require('dotenv').config(); // looks for .env in current directory (backend)

// AWS Config
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);

const generateReferralCode = (phone) => {
    const suffix = phone ? phone.slice(-4) : '0000';
    const random = crypto.randomBytes(1).toString('hex').toUpperCase();
    return `DRV${suffix}${random}`;
};

const fixDrivers = async () => {
    try {
        console.log('Listing tables...');
        const tables = await client.send(new ListTablesCommand({}));
        console.log('Tables:', tables.TableNames);

        let TABLE_NAME = 'uturn-drivers';
        if (tables.TableNames.includes('Drivers')) TABLE_NAME = 'Drivers';
        if (tables.TableNames.includes('uturn-drivers')) TABLE_NAME = 'uturn-drivers';
        
        console.log('Using table:', TABLE_NAME);

        console.log('Scanning drivers from table:', TABLE_NAME);
        const scanResult = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME
        }));

        const drivers = scanResult.Items || [];
        console.log(`Found ${drivers.length} drivers.`);

        let updatedCount = 0;

        for (const driver of drivers) {
            if (!driver.referralCode) {
                const newCode = generateReferralCode(driver.phone);
                console.log(`Updating driver ${driver.name} (${driver.phone}) with code: ${newCode}`);

                await docClient.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { id: driver.id },
                    UpdateExpression: 'SET referralCode = :code, referralCount = :count',
                    ExpressionAttributeValues: {
                        ':code': newCode,
                        ':count': driver.referralCount || 0
                    }
                }));
                updatedCount++;
            } else {
                console.log(`Driver ${driver.name} already has code: ${driver.referralCode}`);
            }
        }

        console.log(`Process complete. Updated ${updatedCount} drivers.`);
    } catch (error) {
        console.error('Error:', error);
    }
};

fixDrivers();
