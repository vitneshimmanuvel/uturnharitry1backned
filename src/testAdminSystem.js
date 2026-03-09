const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testAdmin() {
    try {
        console.log('--- Testing Admin Login ---');
        const loginRes = await axios.post(`${BASE_URL}/admin/login`, {
            username: 'admin',
            password: 'adminpassword123'
        });

        if (loginRes.data.success) {
            console.log('✅ Super-Admin Login Success');
            const token = loginRes.data.token;
            const headers = { Authorization: `Bearer ${token}` };

            // Test sub-admin list
            const subAdminsRes = await axios.get(`${BASE_URL}/admin/sub-admins`, { headers });
            console.log(`✅ Fetched ${subAdminsRes.data.data.length} Sub-Admins`);

            // Test logs
            const logsRes = await axios.get(`${BASE_URL}/admin/logs`, { headers });
            console.log(`✅ Fetched ${logsRes.data.data.length} Logs`);

            // Test creating a new sub-admin
            const newSubRes = await axios.post(`${BASE_URL}/admin/sub-admins`, {
                name: 'Test Sub',
                username: `testsub_${Date.now()}`,
                password: 'password123',
                role: 'sub-admin',
                permissions: ['drivers']
            }, { headers });
            console.log('✅ Sub-Admin Creation Success');

        } else {
            console.error('❌ Super-Admin Login Failed');
        }

    } catch (error) {
        console.error('❌ Test Failed:', error.response?.data || error.message);
    }
}

testAdmin();
