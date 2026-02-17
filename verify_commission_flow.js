const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

const fs = require('fs');

function log(msg) {
    console.log(msg);
    fs.appendFileSync('verification_result.txt', msg + '\n');
}

async function verifyFlow() {
    try {
        fs.writeFileSync('verification_result.txt', ''); // Clear file
        log('Starting verification flow...');

        // 1. Create a Booking (Mocking Vendor Trip Creation)
        log('1. Creating a dummy booking...');
        const createRes = await axios.post(`${BASE_URL}/bookings/create`, {
            vendorId: 'vendor_123', // Assuming this exists or is allowed
            customerName: 'Test Customer',
            customerPhone: '9876543210',
            pickupAddress: 'Test Pickup',
            dropAddress: 'Test Drop',
            scheduledDate: new Date().toISOString().split('T')[0],
            scheduledTime: '10:00',
            vehicleType: 'Sedan',
            tripType: 'oneWay',
            baseFare: 100,
            totalAmount: 500,
            vendorCommission: 50,
            status: 'pending' // Initial status
        });
        const createData = createRes.data;
        
        const bookingId = createData.data?.booking?.id || createData.data?.id;
        log(`Booking Created: ${bookingId}`);
        
        if (!bookingId) throw new Error('No Booking ID returned');
        
        log('2. Attempting to Verify Cash Payment (Vendor Action)...');
        const verifyRes = await axios.post(`${BASE_URL}/bookings/${bookingId}/verify-payment`);
        const verifyData = verifyRes.data;
        log(`Verify Payment Response: ${JSON.stringify(verifyData)}`);
        
        // Expect status: commission_pending
        if (verifyData.data?.status === 'commission_pending') {
            log('SUCCESS: Status is commission_pending');
        } else {
            log('FAILURE: Status is ' + verifyData.data?.status);
        }

        log('3. Attempting to Pay Commission (Driver Action)...');
        const payRes = await axios.post(`${BASE_URL}/bookings/${bookingId}/pay-commission`);
        const payData = payRes.data;
        log(`Pay Commission Response: ${JSON.stringify(payData)}`);

        // Expect status: commission_verification_pending
         if (payData.data?.status === 'commission_verification_pending') {
            log('SUCCESS: Status is commission_verification_pending');
        } else {
            log('FAILURE: Status is ' + payData.data?.status);
        }

        log('4. Attempting to Approve Commission (Vendor Action)...');
        const approveRes = await axios.post(`${BASE_URL}/bookings/${bookingId}/approve-commission`);
        const approveData = approveRes.data;
        log(`Approve Commission Response: ${JSON.stringify(approveData)}`);

        // Expect status: completed
         if (approveData.data?.status === 'completed') {
            log('SUCCESS: Status is completed');
        } else {
            log('FAILURE: Status is ' + approveData.data?.status);
        }
        
        log('Verification Complete.');

    } catch (e) {
        log(`Verification Error: ${JSON.stringify(e.response?.data || e.message)}`);
    }
}

verifyFlow();
