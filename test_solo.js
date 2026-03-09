require('dotenv').config();
const soloRideModel = require('./src/models/soloRideModel');
async function test() {
    try {
        const vendorId = '33647315-c0d8-456f-89f9-f148f752b371';
        const statusStr = 'pending,driver_accepted,vendor_approved,confirmed,started,in_progress,arrived,dropped,pickup,drop,payment_pending,payment_verification_pending,commission_pending,commission_verification_pending';
        console.log("Fetching for vendor solo", vendorId, "with statuses", statusStr);
        const res = await soloRideModel.getVendorSoloRides(vendorId, statusStr);
        console.log("Got solo items:", res.length);
    } catch(e) {
        console.error("FAILED SOLO", e);
    }
}
test();
