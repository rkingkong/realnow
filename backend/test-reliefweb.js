// Create: test-reliefweb.js
const axios = require('axios');

async function testReliefWeb() {
  console.log('Testing ReliefWeb API formats...\n');
  
  // Try different API formats
  const attempts = [
    {
      name: 'Attempt 1: Simple query',
      url: 'https://api.reliefweb.int/v1/disasters',
      params: {
        appname: 'realnow',
        'filter[field]': 'type.id',
        'filter[value]': '4611',  // Flood type ID
        limit: 10
      }
    },
    {
      name: 'Attempt 2: With preset',
      url: 'https://api.reliefweb.int/v1/disasters',
      params: {
        appname: 'realnow',
        preset: 'latest',
        'filter[field]': 'type.name',
        'filter[value]': 'Flood',
        limit: 10
      }
    },
    {
      name: 'Attempt 3: Query parameter',
      url: 'https://api.reliefweb.int/v1/disasters?appname=realnow&query[value]=flood&limit=10',
      params: null
    },
    {
      name: 'Attempt 4: Just latest disasters',
      url: 'https://api.reliefweb.int/v1/disasters?appname=realnow&preset=latest&limit=20',
      params: null
    }
  ];

  for (const attempt of attempts) {
    console.log(`\n${attempt.name}:`);
    console.log(`URL: ${attempt.url}`);
    
    try {
      const config = attempt.params ? 
        { params: attempt.params, timeout: 5000 } : 
        { timeout: 5000 };
      
      const response = await axios.get(attempt.url, config);
      const disasters = response.data?.data || [];
      
      console.log(`✅ SUCCESS! Found ${disasters.length} disasters`);
      
      // Check for floods
      const floods = disasters.filter(d => 
        d.fields?.type?.[0]?.name === 'Flood' || 
        d.fields?.name?.toLowerCase().includes('flood')
      );
      
      console.log(`   Floods: ${floods.length}`);
      
      if (floods.length > 0) {
        console.log('   Sample flood:');
        const flood = floods[0];
        console.log(`     Name: ${flood.fields?.name}`);
        console.log(`     Type: ${flood.fields?.type?.[0]?.name}`);
        console.log(`     Country: ${flood.fields?.country?.[0]?.name}`);
        console.log(`     Date: ${flood.fields?.date?.created}`);
      }
      
    } catch (error) {
      console.log(`❌ Failed: ${error.response?.status || error.message}`);
      if (error.response?.data?.error) {
        console.log(`   Error details: ${JSON.stringify(error.response.data.error)}`);
      }
    }
  }
}

testReliefWeb();