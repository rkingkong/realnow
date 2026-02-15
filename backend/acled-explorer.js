// ACLED Cookie-Based Authentication Test
// Save as: acled-cookie-test.js

const axios = require('axios');

async function testACLEDCookieAuth() {
  console.log('🍪 Testing ACLED Cookie-Based Authentication\n');
  
  // Create an axios instance to maintain cookies
  const client = axios.create({
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  try {
    // Step 1: Login to get session cookie
    console.log('1️⃣ Logging in to ACLED...');
    
    const loginResponse = await client.post('https://acleddata.com/user/login?_format=json', {
      name: 'rkong@armku.us',
      pass: 'Virgenmaria2014!'
    });
    
    console.log('✅ Login successful!');
    console.log('   User ID:', loginResponse.data.current_user.uid);
    console.log('   Username:', loginResponse.data.current_user.name);
    console.log('   CSRF Token:', loginResponse.data.csrf_token.substring(0, 20) + '...');
    
    // Extract cookies from response
    const cookies = loginResponse.headers['set-cookie'];
    if (cookies) {
      console.log('   Cookies received:', cookies.length);
    }
    
    // Step 2: Try to access API with session
    console.log('\n2️⃣ Testing API access with session...');
    
    const apiTests = [
      { name: 'Basic read', url: 'https://acleddata.com/api/acled/read?limit=1' },
      { name: 'With format', url: 'https://acleddata.com/api/acled/read?_format=json&limit=1' },
      { name: 'Recent data', url: 'https://acleddata.com/api/acled/read?limit=10&event_date=2025-01-01&event_date_where=%3E%3D' }
    ];
    
    for (const test of apiTests) {
      try {
        console.log(`\nTesting: ${test.name}`);
        console.log(`URL: ${test.url}`);
        
        const response = await client.get(test.url, {
          headers: {
            'Cookie': cookies ? cookies.join('; ') : '',
            'X-CSRF-Token': loginResponse.data.csrf_token
          }
        });
        
        console.log(`✅ Success! Status: ${response.status}`);
        
        if (response.data) {
          if (response.data.data && Array.isArray(response.data.data)) {
            console.log(`   Received ${response.data.data.length} events`);
            if (response.data.data.length > 0) {
              const sample = response.data.data[0];
              console.log(`   Sample: ${sample.event_type} in ${sample.country} on ${sample.event_date}`);
            }
          } else if (response.data.count !== undefined) {
            console.log(`   Total count: ${response.data.count}`);
          }
        }
        
        // If we got data, save a sample
        if (response.data && response.data.data && response.data.data.length > 0) {
          const fs = require('fs').promises;
          await fs.writeFile('acled-sample-cookie.json', JSON.stringify(response.data, null, 2));
          console.log('   Sample data saved to acled-sample-cookie.json');
        }
        
      } catch (error) {
        console.log(`❌ Failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
      }
    }
    
    // Step 3: Try manual browser instructions
    console.log('\n3️⃣ Manual Browser Test Instructions:');
    console.log('1. Open your browser and go to https://acleddata.com');
    console.log('2. Log in with your credentials');
    console.log('3. Once logged in, navigate to: https://acleddata.com/api/acled/read?limit=10');
    console.log('4. You should see JSON data in your browser');
    console.log('\nIf this works in your browser but not here, it means:');
    console.log('- Your account has access, but there may be additional browser-specific checks');
    console.log('- You might need to use a browser automation tool or different approach');
    
  } catch (error) {
    console.error('❌ Login failed:', error.response?.status, error.response?.data || error.message);
    
    if (error.response?.status === 403) {
      console.log('\n⚠️  403 on login itself - this suggests:');
      console.log('- Your account might be locked or suspended');
      console.log('- Too many failed login attempts');
      console.log('- IP might be blocked');
    }
  }
}

// Run the test
testACLEDCookieAuth().catch(console.error);