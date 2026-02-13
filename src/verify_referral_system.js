require('dotenv').config();
const axios = require('axios');
const referralModel = require('./models/referralModel');

const BASE_URL = 'http://localhost:3000/api';
const generatePhone = () => `9${Math.floor(Math.random() * 1000000000)}`;

async function registerDriver(name, phone, code = null) {
    const payload = {
        name,
        phone,
        driverType: 'driver',
        referredBy: code
    };
    const res = await axios.post(`${BASE_URL}/driver/register`, payload);
    return res.data.data.driver;
}

async function runTest() {
    try {
        console.log('--- Starting Referral System Verification ---\n');

        // 1. Register Driver A
        const phoneA = generatePhone();
        console.log(`1. Registering Driver A (${phoneA})...`);
        
        const driverA = await registerDriver('Driver A', phoneA);
        console.log(`   Success! Driver A ID: ${driverA.id}`);
        console.log(`   Referral Code: ${driverA.referralCode}`);

        // 2. Register Driver B with A's code
        const phoneB = generatePhone();
        console.log(`\n2. Registering Driver B (${phoneB}) with Code: ${driverA.referralCode}...`);
        
        const driverB = await registerDriver('Driver B', phoneB, driverA.referralCode);
        console.log(`   Success! Driver B ID: ${driverB.id}`);

        // 3. Verify Referral Record in UTurnReferrals
        console.log('\n3. Verifying Referral Stats in UTurnReferrals Table...');
        
        await new Promise(r => setTimeout(r, 1000));

        const referralRecord = await referralModel.getReferralByVendorId(driverA.id);
        
        if (!referralRecord) {
             console.error('   FAILURE: No referral record found for Driver A.');
        } else {
             console.log(`   Referral Record Found: ${JSON.stringify(referralRecord, null, 2)}`);
             
             // Check if Driver B is in the list
             const referredUser = referralRecord.referredUsers.find(u => u.userId === driverB.id);
             
             if (referredUser) {
                 console.log('   SUCCESS: Driver B found in Driver A\'s referral list.');
                 console.log(`   Bonus Paid: ${referredUser.bonusPaid}`);
                 
                 if (referredUser.bonusPaid === false) {
                     console.log('   SUCCESS: Bonus is correctly marked as PENDING (false).');
                 } else {
                     console.error('   FAILURE: Bonus should be pending, but is marked paid.');
                 }
             } else {
                 console.error('   FAILURE: Driver B NOT found in referral list.');
             }
             
             if (referralRecord.totalReferrals >= 1) {
                  console.log('   SUCCESS: Total referrals count incremented.');
             } else {
                  console.error('   FAILURE: Total referrals count is 0.');
             }
        }

        // 4. Simulate 5 Trips for Driver B to trigger bonus
        console.log('\n4. Simulating 5 Trips for Driver B to trigger bonus...');
        
        // HACK: Update Driver B trips to 4 directly in DB
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        const bookingModel = require('./models/bookingModel');

        const client = new DynamoDBClient({ region: process.env.AWS_REGION });
        const docClient = DynamoDBDocumentClient.from(client);

        await docClient.send(new UpdateCommand({
            TableName: 'uturn-drivers',
            Key: { id: driverB.id },
            UpdateExpression: 'SET totalTrips = :t',
            ExpressionAttributeValues: { ':t': 4 }
        }));
        console.log('   Set Driver B totalTrips to 4.');

        // Create a dummy booking and complete it
        const booking = await bookingModel.createBooking({
            vendorId: 'SOLO_RIDE',
            customerPhone: '9999999999',
            customerName: 'Test Bonus',
            pickupCity: 'Test City',
            dropCity: 'Test City',
            status: 'in_progress',
            paymentMode: 'customer_pays_driver'
        });
        
        // Assignment hack
        await docClient.send(new UpdateCommand({
            TableName: 'uturn-bookings',
            Key: { id: booking.id },
            UpdateExpression: 'SET assignedDriverId = :did, #status = :s, startOdometer = :odo',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { 
                ':did': driverB.id,
                ':s': 'in_progress',
                ':odo': 1000
            }
        }));
        
        // Complete the trip -> Should become trip #5
        console.log('   Completing dummy trip (Trip #5)...');
        await bookingModel.completeTrip(booking.id, 1010, 'cash', 'url', 0);
        
        // 5. Verify Bonus Paid
        console.log('\n5. Verifying Bonus Payment...');
        await new Promise(r => setTimeout(r, 1000));
        
        const referralRecordAfter = await referralModel.getReferralByVendorId(driverA.id);
        const userStat = referralRecordAfter.referredUsers.find(u => u.userId === driverB.id);
        
        if (userStat.bonusPaid === true) {
            console.log('   SUCCESS: Bonus marked as PAID (true).');
        } else {
            console.error('   FAILURE: Bonus still pending after 5 trips!');
        }
        
        if (referralRecordAfter.earnings >= (referralRecord.earnings + 500)) {
             console.log('   SUCCESS: Earnings increased by 500.');
        } else {
             console.error(`   FAILURE: Earnings mismatch.`);
        }

    } catch (error) {
        console.error('Test Failed:', error.response ? error.response.data : error.message);
        console.error(error); 
    }
}

runTest();
