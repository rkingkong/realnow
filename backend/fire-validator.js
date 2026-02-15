// fire-validator.js - Run this to check all fire data
const Redis = require('redis');

async function validateFireData() {
  const redis = Redis.createClient({
    socket: { host: 'localhost', port: 6379 }
  });
  
  await redis.connect();
  
  console.log('═══════════════════════════════════════════');
  console.log('🔥 FIRE DATA VALIDATION REPORT');
  console.log('═══════════════════════════════════════════\n');
  
  // Check NASA FIRMS fires
  const firesData = await redis.get('data:fires');
  const fires = firesData ? JSON.parse(firesData) : null;
  
  // Check GDACS wildfires
  const wildfiresData = await redis.get('data:wildfires');
  const wildfires = wildfiresData ? JSON.parse(wildfiresData) : null;
  
  console.log('📊 DATA SOURCES:');
  console.log('────────────────────────────────────────');
  console.log(`NASA FIRMS Fires: ${fires?.features?.length || 0} events`);
  console.log(`GDACS Wildfires: ${wildfires?.features?.length || 0} events`);
  console.log(`TOTAL: ${(fires?.features?.length || 0) + (wildfires?.features?.length || 0)} fire events\n`);
  
  // Analyze NASA FIRMS fires by region
  if (fires?.features?.length > 0) {
    console.log('🌍 NASA FIRMS REGIONAL BREAKDOWN:');
    console.log('────────────────────────────────────────');
    
    const regions = {
      'North America': { count: 0, bounds: { minLat: 15, maxLat: 72, minLon: -170, maxLon: -50 }},
      'South America': { count: 0, bounds: { minLat: -56, maxLat: 15, minLon: -82, maxLon: -34 }},
      'Europe': { count: 0, bounds: { minLat: 35, maxLat: 71, minLon: -25, maxLon: 45 }},
      'Africa': { count: 0, bounds: { minLat: -35, maxLat: 37, minLon: -20, maxLon: 52 }},
      'Asia': { count: 0, bounds: { minLat: -10, maxLat: 77, minLon: 26, maxLon: 180 }},
      'Australia': { count: 0, bounds: { minLat: -47, maxLat: -10, minLon: 112, maxLon: 154 }}
    };
    
    // Count fires by region
    fires.features.forEach(fire => {
      const lat = fire.latitude;
      const lon = fire.longitude;
      
      for (const [region, data] of Object.entries(regions)) {
        const b = data.bounds;
        if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) {
          data.count++;
          break;
        }
      }
    });
    
    for (const [region, data] of Object.entries(regions)) {
      console.log(`${region}: ${data.count} fires`);
    }
    
    // Show sample fires from Americas
    console.log('\n🔍 SAMPLE FIRES FROM AMERICAS:');
    console.log('────────────────────────────────────────');
    const americasFires = fires.features.filter(f => 
      f.longitude > -170 && f.longitude < -30 && f.latitude > -56 && f.latitude < 72
    ).slice(0, 3);
    
    americasFires.forEach((fire, i) => {
      console.log(`Fire ${i+1}:`);
      console.log(`  Location: ${fire.latitude?.toFixed(3)}, ${fire.longitude?.toFixed(3)}`);
      console.log(`  Intensity (FRP): ${fire.frp?.toFixed(1)} MW`);
      console.log(`  Brightness: ${fire.brightness?.toFixed(1)}K`);
      console.log(`  Confidence: ${fire.confidence}`);
      console.log(`  Date: ${fire.date} ${fire.time}`);
    });
  }
  
  // Analyze GDACS wildfires
  if (wildfires?.features?.length > 0) {
    console.log('\n🔥 GDACS WILDFIRES BREAKDOWN:');
    console.log('────────────────────────────────────────');
    
    const countries = {};
    wildfires.features.forEach(wf => {
      const country = wf.country || 'Unknown';
      countries[country] = (countries[country] || 0) + 1;
    });
    
    Object.entries(countries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([country, count]) => {
        console.log(`${country}: ${count} wildfires`);
      });
    
    // Show sample wildfires
    console.log('\n🔍 SAMPLE GDACS WILDFIRES:');
    console.log('────────────────────────────────────────');
    wildfires.features.slice(0, 3).forEach((wf, i) => {
      console.log(`Wildfire ${i+1}:`);
      console.log(`  Name: ${wf.name}`);
      console.log(`  Location: ${wf.latitude?.toFixed(3)}, ${wf.longitude?.toFixed(3)}`);
      console.log(`  Country: ${wf.country}`);
      console.log(`  Alert Level: ${wf.alertLevel}`);
      console.log(`  Affected Area: ${wf.affectedArea} km²`);
    });
  }
  
  // Check why Americas might not be showing
  console.log('\n⚠️ POTENTIAL ISSUES:');
  console.log('────────────────────────────────────────');
  
  // Check if frontend is receiving wildfires
  console.log('1. Wildfires category exists but may not be enabled in frontend');
  console.log('2. Both fires and wildfires should be merged into one category');
  
  // Check data freshness
  if (fires?.timestamp) {
    const age = Date.now() - new Date(fires.timestamp).getTime();
    const minutes = Math.floor(age / 60000);
    console.log(`3. NASA FIRMS data age: ${minutes} minutes`);
    if (minutes > 30) console.log('   ⚠️ Data may be stale!');
  }
  
  if (wildfires?.timestamp) {
    const age = Date.now() - new Date(wildfires.timestamp).getTime();
    const minutes = Math.floor(age / 60000);
    console.log(`4. GDACS wildfire data age: ${minutes} minutes`);
    if (minutes > 30) console.log('   ⚠️ Data may be stale!');
  }
  
  console.log('\n✅ RECOMMENDATIONS:');
  console.log('────────────────────────────────────────');
  console.log('1. Merge "fires" and "wildfires" into single "fires" category');
  console.log('2. Ensure frontend enables and displays merged fire data');
  console.log('3. Add more details to fire popups (area, duration, etc.)');
  console.log('4. Check if coordinate system is correct (lon, lat order)');
  
  await redis.quit();
}

validateFireData().catch(console.error);
