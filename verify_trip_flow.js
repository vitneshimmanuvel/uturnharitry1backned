const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

// create a dummy image file for testing
const dummyImagePath = path.join(__dirname, 'test_image.jpg');
if (!fs.existsSync(dummyImagePath)) {
    fs.writeFileSync(dummyImagePath, 'dummy image content');
}

async function runVerification() {
    console.log('🚀 Starting Trip Flow Verification...');

    let vendorId, token, driverId, bookingId;

    try {
        // 0. Health Check (Basic Get)
        try {
           await axios.get('http://localhost:3000/');
           console.log('✅ Backend is reachable');
        } catch (e) {
           console.warn('⚠️ Backend root check failed, but proceeding to API...');
        }

        // 1. Register/Login Vendor
        console.log('\n--- 1. Vendor Auth ---');
        // Randomize phone to avoid 'already registered' 409 error if run multiple times
        const randomPhone = '9' + Math.floor(Math.random() * 900000000); 
        const vendorRes = await axios.post(`${BASE_URL}/vendor/register`, {
            ownerName: 'Test Vendor',
            phone: randomPhone,
            businessName: 'Test Travels'
        });
        vendorId = vendorRes.data.data.vendor.id;
        token = vendorRes.data.data.token; 
        console.log('✅ Vendor Registered:', vendorId, 'Phone:', randomPhone);

        // 2. Create Booking
        console.log('\n--- 2. Create Booking ---');
        const bookingRes = await axios.post(`${BASE_URL}/bookings/create`, {
            vendorId: vendorId,
            customerName: 'Test Customer',
            customerPhone: '8888888888',
            pickupAddress: 'Point A',
            pickupCity: 'City X',
            dropAddress: 'Point B',
            dropCity: 'City Y',
            vehicleType: 'Sedan',
            tripType: 'drop',
            scheduleDate: new Date().toISOString().split('T')[0],
            scheduleTime: '10:00',
            packageAmount: 1000,
            distanceKm: 20,
            status: 'pending' // important
        });
        bookingId = bookingRes.data.data.id;
        console.log('✅ Booking Created:', bookingId);

        // 3. Register Driver
        console.log('\n--- 3. Driver Auth ---');
        const randomDriverPhone = '7' + Math.floor(Math.random() * 900000000);
        const driverRes = await axios.post(`${BASE_URL}/driver/register`, {
            name: 'Test Driver',
            phone: randomDriverPhone,
            driverType: 'driver'
        });
        driverId = driverRes.data.data.driver.id;
        console.log('✅ Driver Registered:', driverId, 'Phone:', randomDriverPhone);

        // 4. Accept Booking
        console.log('\n--- 4. Driver Accepts Booking ---');
        await axios.post(`${BASE_URL}/bookings/${bookingId}/accept`, {
            driverId: driverId
        });
        console.log('✅ Booking Accepted');
        
        // 5. Vendor Approves Driver
        console.log('\n--- 5. Vendor Approves Driver ---');
        await axios.post(`${BASE_URL}/bookings/${bookingId}/approve-driver`);
        console.log('✅ Driver Approved');

        // 6. Generate OTP (Backend internal logic, but we need it to start)
        const bookingDetail = await axios.get(`${BASE_URL}/bookings/${bookingId}`);
        const otp = bookingDetail.data.data.otp;
        console.log('✅ OTP Fetched:', otp);

        // 7. Start Trip (Multipart)
        console.log('\n--- 6. Start Trip (Multipart) ---');
        const startForm = new FormData();
        startForm.append('startOdometer', '1000');
        startForm.append('otp', otp);
        startForm.append('image', fs.createReadStream(dummyImagePath));

        await axios.post(`${BASE_URL}/bookings/${bookingId}/start-trip`, startForm, {
            headers: startForm.getHeaders()
        });
        console.log('✅ Trip Started');

        // 8. Add Waiting Time
        console.log('\n--- 7. Add Waiting Time ---');
        await axios.patch(`${BASE_URL}/bookings/${bookingId}/waiting-time`, {
            additionalMinutes: 30
        });
        console.log('✅ Waiting Time Added (30 mins)');

        // 9. Complete Trip (Multipart)
        console.log('\n--- 8. Complete Trip (Multipart) ---');
        const endForm = new FormData();
        endForm.append('endOdometer', '1050'); // 50km diff
        endForm.append('paymentMethod', 'cash');
        endForm.append('extraCharges', '100'); // Toll
        endForm.append('image', fs.createReadStream(dummyImagePath));

        const completeRes = await axios.post(`${BASE_URL}/bookings/${bookingId}/complete`, endForm, {
            headers: endForm.getHeaders()
        });
        
        console.log('✅ Trip Completed');
        const finalBooking = completeRes.data.data;
        console.log('   - Actual Distance:', finalBooking.actualDistanceKm); // Should be 50
        console.log('   - Waiting Time:', finalBooking.waitingTimeMins); // Should be 30
        console.log('   - Total Amount:', finalBooking.totalAmount); 
        
        // 10. Check Driver Status (Blocking)
        console.log('\n--- 9. Check Driver Status (Blocked) ---');
        const driverAfterTrip = await axios.get(`${BASE_URL}/driver/${driverId}`);
        const status = driverAfterTrip.data.data.status;
        console.log('   - Driver Status:', status);
        if (status !== 'blocked_for_payment') console.warn('⚠️ Driver NOT blocked!');
        else console.log('✅ Driver Blocked');

        // 11. Pay Commission
        console.log('\n--- 10. Pay Commission ---');
        await axios.post(`${BASE_URL}/bookings/${bookingId}/pay-commission`);
        console.log('✅ Commission Paid');

        // 12. Check Driver Status (Active)
        console.log('\n--- 11. Check Driver Status (Active) ---');
        const driverFinal = await axios.get(`${BASE_URL}/driver/${driverId}`);
        const finalStatus = driverFinal.data.data.status;
        console.log('   - Driver Status:', finalStatus);
        if (finalStatus !== 'active') console.warn('⚠️ Driver NOT active!');
        else console.log('✅ Driver Active');

    } catch (error) {
        console.error('❌ Verification Failed:', error.message);
        if (error.response) {
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Status:', error.response.status);
        }
    }
}

runVerification();
