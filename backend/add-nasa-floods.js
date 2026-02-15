// Create: add-nasa-floods.js
const axios = require('axios');
const Redis = require('redis');

const redis = Redis.createClient({
  socket: { host: 'localhost', port: 6379 }
});

async function fetchNASAFloods() {
  await redis.connect();
  
  console.log('🌊 Fetching floods from NASA EONET...');
  
  try {
    // NASA EONET Floods endpoint
    const response = await axios.get('https://eonet.gsfc.nasa.gov/api/v3/events?category=floods&status=open&limit=100');
    
    console.log(`Found ${response.data.events?.length || 0} flood events from NASA`);
    
    if (response.data.events && response.data.events.length > 0) {
      const floods = response.data.events.map(event => {
        const latestGeometry = event.geometry?.[0] || {};
        const coords = latestGeometry.coordinates || [0, 0];
        
        return {
          id: `nasa_fl_${event.id}`,
          type: 'flood',
          name: event.title,
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          alertLevel: 'Orange', // NASA doesn't provide alert levels
          status: event.closed ? 'closed' : 'active',
          date: latestGeometry.date || new Date().toISOString(),
          sources: event.sources?.map(s => s.url) || [],
          source: 'NASA_EONET'
        };
      });
      
      const floodData = {
        type: 'floods',
        timestamp: new Date().toISOString(),
        count: floods.length,
        features: floods
      };
      
      // Store in Redis
      await redis.set('data:floods', JSON.stringify(floodData), { EX: 600 });
      
      console.log('✅ Stored NASA floods in Redis');
      console.log('Sample flood:', floods[0]);
      
      return floodData;
    }
  } catch (error) {
    console.error('Error fetching NASA floods:', error.message);
  }
  
  await redis.quit();
}

fetchNASAFloods();