require('dotenv').config();
const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: '33647315-c0d8-456f-89f9-f148f752b371', userType: 'vendor' }, process.env.JWT_SECRET || 'your_jwt_secret');
//edgdfsfsfdbdbdsfs
async function testApi() {
    try {
        const url = 'http://localhost:3000/api/vendor/trips?status=pending,driver_accepted,vendor_approved,confirmed,started,in_progress,arrived,dropped,pickup,drop,payment_pending,payment_verification_pending,commission_pending,commission_verification_pending';
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
    } catch(e) {
        console.error("FAIL", e);
    }
}
testApi();
