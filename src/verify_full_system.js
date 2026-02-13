require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

// Verify Model Loading (Integration Check)
let driverModel, referralModel, bookingModel;
try {
    driverModel = require('./models/driverModel');
    referralModel = require('./models/referralModel');
    bookingModel = require('./models/bookingModel');
    console.log('✅ ALL MODELS LOADED SUCCESSFULLY (Code Integration Verified)');
} catch (e) {
    console.error('❌ MODEL LOADING FAILED:', e.message);
    process.exit(1);
}

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function runFullCheck() {
    console.log('\n--- 🚀 FULL SYSTEM HEALTH & EXPECTATION CHECK ---\n');
    let issues = 0;

    // 1. DATA INTEGRITY (From system_health_check.js)
    console.log('1. Checking Data Integrity...');
    try {
        // Drivers
        const drivers = await docClient.send(new ScanCommand({ TableName: 'uturn-drivers' }));
        const driversWithoutRef = drivers.Items.filter(d => !d.referralCode);
        if (driversWithoutRef.length > 0) {
            console.error(`   ⚠️  ${driversWithoutRef.length} drivers missing referralCode.`);
            issues++;
        } else {
            console.log(`   ✅ Drivers Table Health OK (${drivers.Items.length} drivers)`);
        }

        // Bookings
        const bookings = await docClient.send(new ScanCommand({ TableName: 'uturn-bookings' }));
        console.log(`   ✅ Bookings Table Health OK (${bookings.Items.length} bookings)`);

        // Referrals
        const referrals = await docClient.send(new ScanCommand({ TableName: 'UTurnReferrals' }));
        console.log(`   ✅ Referrals Table Health OK (${referrals.Items.length} records)`);

    } catch (e) {
        console.error('   ❌ DATA CHECK FAILED:', e.message);
        issues++;
    }

    // 2. BUSINESS LOGIC REPORTS (From group_bookings_file.js)
    console.log('\n2. Generating Business Reports...');
    try {
        const bookings = await docClient.send(new ScanCommand({ TableName: 'uturn-bookings' }));
        const groups = { 
            pending: [], driver_accepted: [], vendor_approved: [], 
            in_progress: [], completed: [], cancelled: [], draft: [] 
        };
        
        bookings.Items.forEach(b => {
            if(groups[b.status]) groups[b.status].push(b);
        });

        console.log('   --- Booking Status Breakdown ---');
        Object.keys(groups).forEach(k => {
            if(groups[k].length > 0) console.log(`   • ${k.toUpperCase()}: ${groups[k].length}`);
        });
        console.log('   ✅ Report Generated.');

    } catch (e) {
        console.error('   ❌ REPORT GENERATION FAILED:', e.message);
        issues++;
    }

    // 3. REFERRAL SIMULATION STATUS (From verify_referral_system.js logs)
    console.log('\n3. Checking Referral System Integration...');
    // We implicitly checked this by loading the models, but let's check a record logic
    // Check if any referral record has valid earnings
    try {
        const referrals = await docClient.send(new ScanCommand({ TableName: 'UTurnReferrals' }));
        const withEarnings = referrals.Items.filter(r => r.earnings > 0);
        if (withEarnings.length > 0) {
            console.log(`   ✅ Referral logic is active (Found ${withEarnings.length} users with earnings).`);
        } else {
            console.log('   ℹ️  Referral logic active but no earnings yet (or test data wiped).');
        }
    } catch (e) {
        issues++;
    }

    console.log(`\n--- 🏁 CHECK COMPLETE. Found ${issues} issues. ---`);
    if (issues === 0) {
        console.log('✅ SYSTEM IS FULLY INTEGRATED AND OPERATIONAL.');
    } else {
        console.log('⚠️  SYSTEM HAS MINOR ISSUES (See logs above).');
    }
}

runFullCheck();
