// check-volcanoes.js - Check why volcano data is missing

const axios = require('axios');
const Redis = require('redis');

async function checkVolcanoes() {
  console.log('🌋 CHECKING VOLCANO DATA SOURCES');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const redis = Redis.createClient({
    socket: { host: 'localhost', port: 6379 }
  });
  await redis.connect();
  
  // 1. Check what's in Redis
  console.log('📦 CHECKING REDIS:');
  console.log('───────────────────────────────────────────────────────');
  
  const volcanoKeys = await redis.keys('data:volcano*');
  console.log(`Found keys: ${volcanoKeys.join(', ') || 'none'}`);
  
  for (const key of volcanoKeys) {
    const data = await redis.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      console.log(`${key}: ${parsed.count || parsed.features?.length || 0} events`);
    }
  }
  
  // 2. Try fetching from NASA EONET
  console.log('\n📡 FETCHING FROM NASA EONET:');
  console.log('───────────────────────────────────────────────────────');
  
  try {
    const response = await axios.get(
      'https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open&limit=100',
      { timeout: 10000 }
    );
    
    console.log(`Response status: ${response.status}`);
    console.log(`Events found: ${response.data?.events?.length || 0}`);
    
    if (response.data?.events?.length > 0) {
      console.log('\nActive volcanoes:');
      response.data.events.slice(0, 5).forEach(event => {
        const coords = event.geometry?.[0]?.coordinates || [];
        console.log(`  • ${event.title} at [${coords[1]?.toFixed(2)}, ${coords[0]?.toFixed(2)}]`);
      });
      
      // Store in Redis as 'volcanoes'
      const volcanoes = response.data.events.map(event => {
        const latestGeometry = event.geometry?.[0] || {};
        const coords = latestGeometry.coordinates || [0, 0];
        
        return {
          id: `eonet_${event.id}`,
          type: 'volcano',
          name: event.title,
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          status: event.closed ? 'closed' : 'active',
          date: latestGeometry.date || new Date().toISOString(),
          source: 'NASA_EONET'
        };
      });
      
      const volcanoData = {
        type: 'volcanoes',
        timestamp: new Date().toISOString(),
        count: volcanoes.length,
        features: volcanoes
      };
      
      await redis.set('data:volcanoes', JSON.stringify(volcanoData), { EX: 900 }); // 15 min cache
      console.log(`\n✅ Stored ${volcanoes.length} volcanoes in Redis`);
    } else {
      console.log('ℹ️ No active volcanoes from NASA EONET (this is normal - volcanoes are rare)');
    }
  } catch (error) {
    console.log(`❌ Error fetching NASA EONET: ${error.message}`);
  }
  
  // 3. Try fetching from GDACS
  console.log('\n📡 CHECKING GDACS FOR VOLCANOES:');
  console.log('───────────────────────────────────────────────────────');
  
  try {
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=VO&fromdate=${fromDate}&todate=${toDate}`;
    
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data?.features?.length > 0) {
      console.log(`Found ${response.data.features.length} GDACS volcano events`);
    } else {
      console.log('ℹ️ No active volcanoes from GDACS');
    }
  } catch (error) {
    console.log(`Note: GDACS volcano check: ${error.message}`);
  }
  
  // 4. Force refresh
  console.log('\n🔄 FORCING VOLCANO REFRESH:');
  console.log('───────────────────────────────────────────────────────');
  
  try {
    const refreshResponse = await axios.post('http://localhost:3001/api/refresh/volcanoes');
    console.log(`Refresh result: ${refreshResponse.data.success ? 'Success' : 'Failed'}`);
    if (refreshResponse.data.count !== undefined) {
      console.log(`Volcanoes found: ${refreshResponse.data.count}`);
    }
  } catch (error) {
    console.log(`Could not refresh: ${error.message}`);
  }
  
  // 5. Final check
  console.log('\n📊 FINAL STATUS:');
  console.log('───────────────────────────────────────────────────────');
  
  const finalData = await redis.get('data:volcanoes');
  if (finalData) {
    const parsed = JSON.parse(finalData);
    console.log(`✅ Volcanoes in Redis: ${parsed.count || parsed.features?.length || 0}`);
  } else {
    console.log('ℹ️ No volcano data - this is often normal as active volcanoes are rare');
    console.log('   The platform will automatically check every 15 minutes');
  }
  
  await redis.quit();
  
  console.log('\n💡 NOTE:');
  console.log('───────────────────────────────────────────────────────');
  console.log('Volcanoes are rare events. It\'s normal to have 0 active volcanoes.');
  console.log('Your platform will automatically check for new volcanic activity');
  console.log('every 15 minutes and display them when they occur.');
}

checkVolcanoes().catch(console.error);