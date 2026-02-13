require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function checkHealth() {
    console.log('--- SYSTEM HEALTH CHECK ---\n');
    let issues = 0;

    // 1. Check Drivers
    try {
        console.log('1. Checking Drivers Table...');
        const drivers = await docClient.send(new ScanCommand({ TableName: 'uturn-drivers' }));
        console.log(`   Found ${drivers.Items.length} drivers.`);
        
        const driversWithoutRef = drivers.Items.filter(d => !d.referralCode);
        if (driversWithoutRef.length > 0) {
            console.error(`   ⚠️  WARNING: ${driversWithoutRef.length} drivers missing referralCode!`);
            issues++;
        } else {
            console.log('   ✅ All drivers have referral codes.');
        }
    } catch (e) {
        console.error('   ❌ FAILED to scan drivers:', e.message);
        issues++;
    }

    // 2. Check Bookings
    try {
        console.log('\n2. Checking Bookings Table...');
        const bookings = await docClient.send(new ScanCommand({ TableName: 'uturn-bookings' }));
        console.log(`   Found ${bookings.Items.length} bookings.`);
        
        const invalidStatuses = bookings.Items.filter(b => !['draft', 'pending', 'driver_accepted', 'vendor_approved', 'in_progress', 'completed', 'cancelled', 'rejected'].includes(b.status));
        if (invalidStatuses.length > 0) {
            console.error(`   ⚠️  WARNING: ${invalidStatuses.length} bookings with invalid statuses!`);
            invalidStatuses.forEach(b => console.log(`      - ID: ${b.id}, Status: ${b.status}`));
            issues++;
        } else {
            console.log('   ✅ All bookings have valid statuses.');
        }
    } catch (e) {
        console.error('   ❌ FAILED to scan bookings:', e.message);
        issues++;
    }

    // 3. Check Referrals
    try {
        console.log('\n3. Checking Referrals Table...');
        const referrals = await docClient.send(new ScanCommand({ TableName: 'UTurnReferrals' }));
        console.log(`   Found ${referrals.Items.length} referral records.`);
        
        // Logical check: total referrals vs referredUsers length
        const mismatch = referrals.Items.filter(r => r.totalReferrals !== (r.referredUsers ? r.referredUsers.length : 0));
        if (mismatch.length > 0) {
            console.error(`   ⚠️  WARNING: ${mismatch.length} referral records have count mismatch!`);
            issues++;
        } else {
            console.log('   ✅ All referral counts match user lists.');
        }
    } catch (e) {
        console.error('   ❌ FAILED to scan referrals:', e.message);
        issues++;
    }

    console.log(`\n--- CHECK COMPLETE. Found ${issues} potential issues. ---`);
}

checkHealth();
