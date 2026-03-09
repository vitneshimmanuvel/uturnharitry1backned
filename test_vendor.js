require('dotenv').config();
const bookingModel = require('./src/models/bookingModel');
async function test() {
    try {
        const vendorId = '33647315-c0d8-456f-89f9-f148f752b371';
        const statusStr = 'pending,driver_accepted,vendor_approved,confirmed,started,in_progress,arrived,dropped,pickup,drop,payment_pending,payment_verification_pending,commission_pending,commission_verification_pending';
        console.log("Fetching for vendor", vendorId, "with statuses", statusStr);
        const res = await bookingModel.getVendorBookings(vendorId, statusStr);
        console.log("Got items:", res.length);
        res.forEach(t => console.log(t.id, t.status));
    } catch(e) {
        console.error("FAILED", e);
    }
}
test();
