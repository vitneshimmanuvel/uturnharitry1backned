const axios = require('axios');

async function testGoogleMaps() {
  console.log('Testing Google Maps API Integration on Backend...');
  const baseUrl = 'http://localhost:3000/api/maps';

  try {
    // 1. Test Geocoding (Address -> Coords)
    console.log('\n1. Testing Geocoding (Bangalore)...');
    const geoRes = await axios.get(`${baseUrl}/geocode`, {
      params: { address: 'Bangalore' }
    });
    console.log('✅ Geocode Success:', geoRes.data);

    // 2. Test Autocomplete
    console.log('\n2. Testing Autocomplete (Majestic)...');
    const placeRes = await axios.get(`${baseUrl}/places/search`, {
      params: { query: 'Majestic' }
    });
    console.log('✅ Autocomplete Success:', placeRes.data.data.length, 'results found');

    // 3. Test Directions (Dummy coords)
    console.log('\n3. Testing Directions...');
    const dirRes = await axios.get(`${baseUrl}/directions`, {
      params: {
        origin: '12.9716,77.5946', // Bangalore
        destination: '12.2958,76.6394' // Mysore
      }
    });
    console.log('✅ Directions Success:');
    console.log('   Distance:', dirRes.data.distance);
    console.log('   Duration:', dirRes.data.duration);
    
    console.log('\n🎉 ALL GOOGLE MAPS TESTS PASSED!');
  } catch (error) {
    console.error('❌ Test Failed:', error.response ? error.response.data : error.message);
  }
}

testGoogleMaps();
