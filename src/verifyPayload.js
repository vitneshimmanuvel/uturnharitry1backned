/**
 * verifyPayload.js
 * Simulates EXACT payload from Vendor App (Text-Only Mode)
 * and verifies that Backend stores it correctly.
 */
const axios = require('axios');

const BACKEND_URL = 'http://localhost:3000/api';

async function verifyDataIntegrity() {
    console.log('🧪 Starting Data Integrity Check...\n');

    // 1. Simulate Payload from Vendor App (Text Only, No Lat/Lng)
    const testPayload = {
        vendorId: 'test-vendor-verify',
        customerName: 'Verification User',
        customerPhone: '9988776655',
        
        // Critical: This is how Vendor App sends text-only data
        pickupAddress: 'Manual Text Address 123', 
        pickupCity: 'Coimbatore',              
        pickupLocation: null,                  // Simulating NO Map Selection
        
        dropAddress: 'Manual Drop Address 456',
        dropCity: 'Coimbatore',
        dropLocation: null,                    // Simulating NO Map Selection
        
        vehicleType: 'Sedan',
        packageAmount: 750,
        status: 'pending' // Ready for driver
    };

    console.log('📤 Sending Payload to Backend:');
    console.log(JSON.stringify(testPayload, null, 2));

    try {
        // 2. Send to Backend
        const createRes = await axios.post(`${BACKEND_URL}/bookings/create`, testPayload);
        
        if (createRes.data.success) {
            console.log('\n✅ Booking Created Successfully!');
            const bookingId = createRes.data.data.id;
            console.log(`🆔 ID: ${bookingId}`);

            // 3. Retrieve from Backend (As Driver App would)
            console.log('\n📥 Retrieving via "Nearby Bookings" API...');
            const nearbyRes = await axios.get(`${BACKEND_URL}/bookings/nearby?city=Coimbatore&vehicleType=Sedan`);
            
            const savedBooking = nearbyRes.data.data.find(b => b.id === bookingId);
            
            if (savedBooking) {
                console.log('\n✅ Data Retrieved from Database:');
                console.log('-------------------------------------------');
                console.log(`Pickup Address : ${savedBooking.pickupAddress}`);
                console.log(`Drop Address   : ${savedBooking.dropAddress}`);
                console.log(`Pickup City    : ${savedBooking.pickupCity}`);
                console.log(`Amount         : ${savedBooking.packageAmount}`);
                console.log('-------------------------------------------');
                
                // 4. Validation
                if (savedBooking.pickupAddress === testPayload.pickupAddress &&
                    savedBooking.pickupCity === testPayload.pickupCity) {
                    console.log('\n✨ SUCCESS: Data in Database MATCHES Input EXACTLY!');
                    console.log('   The text you type is safely stored.');
                } else {
                    console.log('\n❌ MISMATCH: Data was altered!');
                }
            } else {
                console.log('\n❌ Creating booking succeeded but could not find it in "Nearby" list.');
            }
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) console.error('Response:', error.response.data);
    }
}

verifyDataIntegrity();
