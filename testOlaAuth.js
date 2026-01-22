require('dotenv').config();
const axios = require('axios');

const testAuth = async () => {
    const urls = [
        'https://api.olamaps.io/oauth2/token',
        'https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token'
    ];

    for (const url of urls) {
        console.log(`Testing URL: ${url}`);
        try {
            const params = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.OLA_MAPS_CLIENT_ID,
                client_secret: process.env.OLA_MAPS_CLIENT_SECRET,
                scope: 'openid email profile offline_access roles'
            });

            const response = await axios.post(url, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            console.log(`SUCCESS! Token length: ${response.data.access_token.length}`);
            
            // Test Directions
            const token = response.data.access_token;
            console.log('Testing Directions API...');
            try {
                const dirUrl = 'https://api.olamaps.io/routing/v1/directions';
                const dirParams = {
                    origin: '13.0827,80.2707',
                    destination: '12.9941,80.1709',
                    mode: 'driving',
                    api_key: process.env.OLA_MAPS_API_KEY
                };
                const dirRes = await axios.post(dirUrl + `?origin=${dirParams.origin}&destination=${dirParams.destination}&mode=${dirParams.mode}&api_key=${dirParams.api_key}`, {}, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                console.log('Directions SUCCESS!', dirRes.data.routes[0].legs[0].distance);
                console.log('POLYLINE FULL:', JSON.stringify(dirRes.data.routes[0].overview_polyline));
                console.log('ROUTE KEYS:', Object.keys(dirRes.data.routes[0]));
            } catch (dirErr) {
                console.log(`Directions FAILED: ${dirErr.message}`);
                console.log(dirErr.response?.data);
            }
            return;
        } catch (error) {
            console.log(`FAILED: ${error.message} - ${error.response?.status} ${error.response?.statusText}`);
            if (error.response?.data) console.log('Response data:', error.response.data);
        }
    }
};

testAuth();
