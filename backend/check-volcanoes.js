// fix-wildfire-transform.js - Test script to fix GDACS wildfire coordinates

const Redis = require('redis');
const axios = require('axios');

async function debugGDACSWildfires() {
  console.log('🔍 Fetching fresh GDACS wildfire data...\n');
  
  // Fetch directly from GDACS
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=WF&fromdate=${fromDate}&todate=${toDate}`;
  
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'RealNow-DisasterTracker/2.0',
        'Accept': 'application/json'
      }
    });
    
    const data = response.data;
    
    if (!data?.features || data.features.length === 0) {
      console.log('❌ No wildfire data from GDACS');
      return;
    }
    
    console.log(`✅ Found ${data.features.length} wildfires from GDACS\n`);
    
    // Analyze the data structure
    console.log('📊 FIRST WILDFIRE RAW DATA:');
    console.log('═══════════════════════════════════════');
    const first = data.features[0];
    console.log('Type:', first.type);
    console.log('Properties:', Object.keys(first.properties || {}).join(', '));
    console.log('Geometry type:', first.geometry?.type);
    console.log('Geometry coordinates:', first.geometry?.coordinates);
    
    // Check different possible coordinate locations
    console.log('\n🔍 CHECKING COORDINATE LOCATIONS:');
    console.log('───────────────────────────────────');
    console.log('geometry.coordinates:', first.geometry?.coordinates);
    console.log('properties.coordinates:', first.properties?.coordinates);
    console.log('properties.geo_lat:', first.properties?.geo_lat);
    console.log('properties.geo_long:', first.properties?.geo_long);
    console.log('properties.latitude:', first.properties?.latitude);
    console.log('properties.longitude:', first.properties?.longitude);
    console.log('properties.lat:', first.properties?.lat);
    console.log('properties.lon:', first.properties?.lon);
    console.log('properties.bbox:', first.properties?.bbox);
    console.log('properties.poly_geojson:', first.properties?.poly_geojson ? 'EXISTS' : 'null');
    
    // Try to extract coordinates from any available field
    console.log('\n🌍 WILDFIRES WITH EXTRACTED COORDINATES:');
    console.log('═══════════════════════════════════════');
    
    let wildfires = [];
    data.features.forEach((feature, index) => {
      const props = feature.properties || {};
      let lat = null, lon = null;
      
      // Try multiple possible coordinate sources
      if (feature.geometry?.coordinates && Array.isArray(feature.geometry.coordinates)) {
        lon = feature.geometry.coordinates[0];
        lat = feature.geometry.coordinates[1];
      } else if (props.geo_lat && props.geo_long) {
        lat = parseFloat(props.geo_lat);
        lon = parseFloat(props.geo_long);
      } else if (props.latitude && props.longitude) {
        lat = parseFloat(props.latitude);
        lon = parseFloat(props.longitude);
      } else if (props.lat && props.lon) {
        lat = parseFloat(props.lat);
        lon = parseFloat(props.lon);
      } else if (props.bbox) {
        // Use center of bounding box
        const bbox = props.bbox;
        if (Array.isArray(bbox) && bbox.length >= 4) {
          lon = (bbox[0] + bbox[2]) / 2;
          lat = (bbox[1] + bbox[3]) / 2;
        }
      } else if (props.poly_geojson) {
        // Try to parse polygon and get centroid
        try {
          const poly = JSON.parse(props.poly_geojson);
          if (poly.coordinates && poly.coordinates[0] && poly.coordinates[0][0]) {
            const coords = poly.coordinates[0];
            lon = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
            lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
          }
        } catch (e) {
          // Failed to parse polygon
        }
      }
      
      if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
        wildfires.push({
          id: `gdacs_wf_${props.eventid || index}`,
          type: 'wildfire',
          name: props.eventname || props.name || 'Wildfire',
          latitude: lat,
          longitude: lon,
          coordinates: [lon, lat],
          country: props.country || props.countryname || '',
          alertLevel: props.alertlevel || 'Green',
          alertScore: parseInt(props.alertscore || 0),
          affectedArea: parseInt(props.affectedarea || 0),
          fromDate: props.fromdate,
          toDate: props.todate,
          duration: parseInt(props.duration || 0),
          source: 'GDACS'
        });
      }
    });
    
    console.log(`\n✅ Successfully extracted coordinates for ${wildfires.length}/${data.features.length} wildfires\n`);
    
    // Group by country
    const byCountry = {};
    wildfires.forEach(wf => {
      const country = wf.country || 'Unknown';
      if (!byCountry[country]) byCountry[country] = [];
      byCountry[country].push(wf);
    });
    
    console.log('🌎 WILDFIRES BY COUNTRY:');
    console.log('───────────────────────────────────');
    Object.entries(byCountry).forEach(([country, fires]) => {
      console.log(`\n${country}: ${fires.length} wildfires`);
      fires.slice(0, 2).forEach(fire => {
        console.log(`  • ${fire.name}`);
        console.log(`    Location: ${fire.latitude.toFixed(3)}, ${fire.longitude.toFixed(3)}`);
        console.log(`    Alert: ${fire.alertLevel}, Area: ${fire.affectedArea} km²`);
      });
    });
    
    // Check for Americas fires
    const americasWildfires = wildfires.filter(wf => 
      wf.longitude > -170 && wf.longitude < -30
    );
    
    console.log('\n🔥 AMERICAS WILDFIRES:');
    console.log('───────────────────────────────────');
    console.log(`Found ${americasWildfires.length} wildfires in the Americas`);
    americasWildfires.forEach(wf => {
      console.log(`  • ${wf.name} (${wf.country})`);
      console.log(`    Location: ${wf.latitude.toFixed(3)}, ${wf.longitude.toFixed(3)}`);
    });
    
    // Save the fixed data to Redis
    const redis = Redis.createClient({
      socket: { host: 'localhost', port: 6379 }
    });
    await redis.connect();
    
    const fixedData = {
      type: 'wildfires',
      timestamp: new Date().toISOString(),
      count: wildfires.length,
      features: wildfires
    };
    
    await redis.set('data:wildfires_fixed', JSON.stringify(fixedData), { EX: 600 });
    
    console.log('\n✅ Fixed wildfire data saved to Redis as "data:wildfires_fixed"');
    console.log('You can check it with: redis-cli GET "data:wildfires_fixed" | jq ".features[0]"');
    
    await redis.quit();
    
  } catch (error) {
    console.error('❌ Error fetching GDACS data:', error.message);
  }
}

debugGDACSWildfires().catch(console.error);
