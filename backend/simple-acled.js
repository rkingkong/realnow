// Simple ACLED API Test
// Run this to test different approaches

const axios = require('axios');

async function testACLED() {
  console.log('🧪 ACLED API Simple Test\n');
  
  const credentials = {
    username: 'rkong@armku.us',
    password: 'Virgenmaria2014!',
    grant_type: 'password',
    client_id: 'acled'
  };

  // Step 1: Get token
  console.log('1️⃣ Getting authentication token...');
  let token;
  
  try {
    const formData = new URLSearchParams(credentials);
    const authResponse = await axios.post('https://acleddata.com/oauth/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    token = authResponse.data.access_token;
    console.log('✅ Got token:', token.substring(0, 50) + '...');
    console.log('   Token type:', authResponse.data.token_type);
    console.log('   Expires in:', authResponse.data.expires_in, 'seconds\n');
  } catch (error) {
    console.error('❌ Auth failed:', error.response?.data || error.message);
    return;
  }

  // Step 2: Try different API calls
  console.log('2️⃣ Testing API endpoints...\n');
  
  const tests = [
    {
      name: 'Minimal request',
      config: {
        method: 'GET',
        url: 'https://acleddata.com/api/acled/read',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    },
    {
      name: 'With Accept header',
      config: {
        method: 'GET',
        url: 'https://acleddata.com/api/acled/read?limit=1',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }
    },
    {
      name: 'With all headers',
      config: {
        method: 'GET',
        url: 'https://acleddata.com/api/acled/read',
        params: { limit: 1 },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    },
    {
      name: 'Cookie-based auth test',
      config: {
        method: 'POST',
        url: 'https://acleddata.com/user/login?_format=json',
        data: {
          name: 'rkong@armku.us',
          pass: 'Virgenmaria2014!'
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }
    }
  ];

  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    try {
      const response = await axios(test.config);
      console.log(`✅ Success! Status: ${response.status}`);
      
      // If we got data, show a sample
      if (response.data) {
        if (typeof response.data === 'object') {
          console.log('   Response keys:', Object.keys(response.data).join(', '));
          if (response.data.data && Array.isArray(response.data.data)) {
            console.log(`   Got ${response.data.data.length} events`);
          }
        } else {
          console.log('   Response type:', typeof response.data);
        }
      }
    } catch (error) {
      console.log(`❌ Failed: ${error.response?.status} - ${error.response?.statusText}`);
      if (error.response?.data) {
        console.log('   Error:', error.response.data);
      }
    }
    console.log('');
  }

  // Step 3: Check API documentation endpoint
  console.log('3️⃣ Checking API info endpoints...\n');
  
  const infoEndpoints = [
    'https://acleddata.com/api',
    'https://acleddata.com/api/acled',
    'https://acleddata.com/api/openapi',
    'https://acleddata.com/api/docs'
  ];

  for (const endpoint of infoEndpoints) {
    try {
      const response = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`✅ ${endpoint} - Status: ${response.status}`);
    } catch (error) {
      console.log(`❌ ${endpoint} - ${error.response?.status || error.message}`);
    }
  }
}

// Run the test
testACLED().catch(console.error);