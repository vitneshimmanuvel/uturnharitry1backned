/**
 * Script to create sample bookings in DynamoDB for testing
 * Run: node src/createSampleBookings.js
 */
require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// DynamoDB Setup
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'uturn-bookings';

// Sample bookings to create
const sampleBookings = [
    {
        id: uuidv4(),
        vendorId: 'test-vendor-1',
        customerPhone: '+917339121049',
        customerName: 'Hari Customer 1',
        customerLanguage: 'Tamil',
        numberOfPeople: 2,
        tripType: 'oneWay',
        vehicleType: 'Sedan',
        vehicleBrand: 'Toyota',
        vehicleModel: 'Innova',
        pickupLocation: { lat: 11.0168, lng: 76.9558 },
        pickupAddress: 'Gandhipuram Bus Stand, Coimbatore',
        pickupCity: 'Coimbatore',
        dropLocation: { lat: 11.3410, lng: 77.7172 },
        dropAddress: 'Tirupur Railway Station',
        dropCity: 'Tirupur',
        distanceKm: 52,
        estimatedDurationMins: 75,
        scheduleDate: '2025-01-30',
        scheduleTime: '09:00',
        baseFare: 150,
        perKmRate: 15,
        estimatedFare: 930,
        packageAmount: 1000,
        totalAmount: 1000,
        status: 'pending',  // Important: must be 'pending' for drivers to see
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: uuidv4(),
        vendorId: 'test-vendor-1',
        customerPhone: '+917339121049',
        customerName: 'Hari Customer 2',
        customerLanguage: 'Tamil',
        numberOfPeople: 4,
        tripType: 'roundTrip',
        vehicleType: 'Sedan',
        vehicleBrand: 'Honda',
        vehicleModel: 'City',
        pickupLocation: { lat: 11.0168, lng: 76.9558 },
        pickupAddress: 'RS Puram, Coimbatore',
        pickupCity: 'Coimbatore',
        dropLocation: { lat: 10.7905, lng: 78.7047 },
        dropAddress: 'Trichy Airport',
        dropCity: 'Trichy',
        distanceKm: 215,
        estimatedDurationMins: 240,
        scheduleDate: '2025-01-31',
        scheduleTime: '06:00',
        returnDate: '2025-01-31',
        returnTime: '20:00',
        baseFare: 200,
        perKmRate: 14,
        estimatedFare: 3210,
        packageAmount: 3500,
        totalAmount: 3500,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: uuidv4(),
        vendorId: 'test-vendor-2',
        customerPhone: '+919876543210',
        customerName: 'Test Customer 3',
        customerLanguage: 'English',
        numberOfPeople: 3,
        tripType: 'outstation',
        vehicleType: 'Sedan',
        vehicleBrand: 'Maruti',
        vehicleModel: 'Dzire',
        pickupLocation: { lat: 11.0168, lng: 76.9558 },
        pickupAddress: 'Coimbatore Junction Railway Station',
        pickupCity: 'Coimbatore',
        dropLocation: { lat: 11.9416, lng: 79.8083 },
        dropAddress: 'Pondicherry Beach',
        dropCity: 'Pondicherry',
        distanceKm: 350,
        estimatedDurationMins: 420,
        scheduleDate: '2025-02-01',
        scheduleTime: '05:00',
        baseFare: 300,
        perKmRate: 13,
        estimatedFare: 4850,
        packageAmount: 5000,
        totalAmount: 5000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];

async function createSampleBookings() {
    console.log('🚀 Creating sample bookings in DynamoDB...\n');
    
    for (const booking of sampleBookings) {
        try {
            await docClient.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: booking
            }));
            console.log(`✅ Created booking: ${booking.customerName}`);
            console.log(`   📍 ${booking.pickupAddress} → ${booking.dropAddress}`);
            console.log(`   💰 ₹${booking.packageAmount} | ${booking.distanceKm}km`);
            console.log(`   🚗 ${booking.vehicleType} | Status: ${booking.status}\n`);
        } catch (error) {
            console.error(`❌ Failed to create booking ${booking.customerName}:`, error.message);
        }
    }
    
    console.log('\n✅ Sample bookings created successfully!');
    console.log('📱 Open the Driver app → Go Online → Tap "Vendor Bookings" to see them.');
}

createSampleBookings();
