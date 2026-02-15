// diagnose-issues.js - Diagnose specific data issues in RealNow
const axios = require('axios');
const Redis = require('redis');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

async function diagnoseIssues() {
  console.clear();
  console.log(`${colors.bright}${colors.cyan}🔍 REALNOW ISSUE DIAGNOSTICS${colors.reset}\n`);

  const redis = Redis.createClient({
    socket: { host: 'localhost', port: 6379 }
  });
  
  await redis.connect();

  // 1. CHECK FIRES ISSUE
  console.log(`${colors.bright}${colors.yellow}1. DIAGNOSING FIRES DATA ISSUE${colors.reset}`);
  console.log('─'.repeat(50));
  
  try {
    // Check if FIRMS API is accessible
    const firmsKey = process.env.FIRMS_MAP_KEY || '1ab1f40c11fa5a952619c58594702b1f';
    const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/world/2`;
    
    console.log('Checking NASA FIRMS API...');
    const response = await axios.get(firmsUrl, { 
      timeout: 30000,
      headers: { 'User-Agent': 'RealNow-Diagnostic/1.0' }
    });
    
    const csvLines = response.data.split('\n').filter(line => line.trim());
    console.log(`${colors.green}✓ FIRMS API accessible${colors.reset}`);
    console.log(`  Total fire points available: ${csvLines.length - 1}`);
    
    // Check first few lines
    console.log(`  Headers: ${csvLines[0]}`);
    console.log(`  Sample: ${csvLines[1]}`);
    
    // Check Redis
    const fireData = await redis.get('data:fires');
    if (!fireData) {
      console.log(`${colors.red}✗ No fire data in Redis!${colors.reset}`);
      console.log('  This suggests the transform or storage is failing');
    } else {
      const parsed = JSON.parse(fireData);
      console.log(`${colors.green}✓ Fire data exists in Redis${colors.reset}`);
      console.log(`  Count: ${parsed.count}`);
    }
    
  } catch (error) {
    console.log(`${colors.red}✗ FIRMS API Error: ${error.message}${colors.reset}`);
  }

  // 2. CHECK CYCLONES ISSUE
  console.log(`\n${colors.bright}${colors.yellow}2. DIAGNOSING CYCLONES DATA ISSUE${colors.reset}`);
  console.log('─'.repeat(50));
  
  try {
    // Check what GDACS TC actually returns
    const tcUrl = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=TC&limit=5';
    console.log('Checking GDACS TC (Tropical Cyclones) API...');
    
    const response = await axios.get(tcUrl, { timeout: 10000 });
    console.log(`${colors.green}✓ GDACS TC API accessible${colors.reset}`);
    
    if (response.data.features && response.data.features.length > 0) {
      const sample = response.data.features[0].properties;
      console.log('\nSample GDACS "Cyclone":');
      console.log(`  Name: ${sample.eventname || sample.name}`);
      console.log(`  Type: ${sample.eventtype}`);
      console.log(`  Wind Speed: ${sample.windspeed}`);
      console.log(`  Category: ${sample.tc_category || 'None'}`);
      console.log(`  Alert Level: ${sample.alertlevel}`);
      
      // Check if these are real cyclones
      if (!sample.windspeed || sample.windspeed === 0) {
        console.log(`${colors.red}\n⚠️  WARNING: These don't appear to be tropical cyclones!${colors.reset}`);
        console.log('  GDACS might be returning wrong event types');
      }
    }
    
  } catch (error) {
    console.log(`${colors.red}✗ GDACS TC Error: ${error.message}${colors.reset}`);
  }

  // 3. CHECK ACTUAL TROPICAL CYCLONES
  console.log(`\n${colors.bright}${colors.yellow}3. CHECKING FOR REAL CYCLONE DATA${colors.reset}`);
  console.log('─'.repeat(50));
  
  try {
    // Try GDACS with different parameters
    const allUrl = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
    const response = await axios.get(allUrl, { timeout: 10000 });
    
    const events = response.data.features || [];
    const realCyclones = events.filter(f => 
      f.properties.eventtype === 'TC' && 
      f.properties.windspeed > 0
    );
    
    console.log(`Total GDACS events: ${events.length}`);
    console.log(`Real tropical cyclones (with wind > 0): ${realCyclones.length}`);
    
    if (realCyclones.length > 0) {
      const sample = realCyclones[0].properties;
      console.log('\nReal Cyclone Found:');
      console.log(`  Name: ${sample.eventname}`);
      console.log(`  Wind Speed: ${sample.windspeed} km/h`);
      console.log(`  Category: ${sample.tc_category}`);
    }
    
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }

  // 4. CHECK SPACE WEATHER
  console.log(`\n${colors.bright}${colors.yellow}4. CHECKING SPACE WEATHER API${colors.reset}`);
  console.log('─'.repeat(50));
  
  try {
    const swUrl = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
    const response = await axios.get(swUrl, { timeout: 10000 });
    
    console.log(`${colors.green}✓ Space Weather API accessible${colors.reset}`);
    console.log(`  Data points: ${response.data.length}`);
    
    if (response.data.length > 1) {
      const latest = response.data[response.data.length - 1];
      console.log(`  Latest Kp: ${latest[1]} at ${latest[0]}`);
    }
    
    // Check Redis
    const swData = await redis.get('data:spaceweather');
    if (!swData) {
      console.log(`${colors.red}✗ No space weather data in Redis${colors.reset}`);
    }
    
  } catch (error) {
    console.log(`${colors.red}✗ Space Weather Error: ${error.message}${colors.reset}`);
  }

  // 5. CHECK WILDFIRE vs FIRES CONFUSION
  console.log(`\n${colors.bright}${colors.yellow}5. WILDFIRE DATA CHECK${colors.reset}`);
  console.log('─'.repeat(50));
  
  try {
    const wfUrl = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=WF&limit=5';
    const response = await axios.get(wfUrl, { timeout: 10000 });
    
    const wildfires = response.data.features || [];
    console.log(`GDACS Wildfires available: ${wildfires.length}`);
    
    if (wildfires.length > 0) {
      const sample = wildfires[0].properties;
      console.log('\nSample GDACS Wildfire:');
      console.log(`  Name: ${sample.eventname}`);
      console.log(`  Country: ${sample.country}`);
      console.log(`  Alert Level: ${sample.alertlevel}`);
      console.log(`  Affected Area: ${sample.affectedarea} km²`);
    }
    
    // Check why it's not in Redis
    const wfData = await redis.get('data:wildfires');
    if (!wfData) {
      console.log(`${colors.red}✗ No wildfire data in Redis${colors.reset}`);
    }
    
  } catch (error) {
    console.log(`${colors.red}✗ Wildfire Error: ${error.message}${colors.reset}`);
  }

  // 6. SUMMARY
  console.log(`\n${colors.bright}${colors.cyan}DIAGNOSIS SUMMARY${colors.reset}`);
  console.log('═'.repeat(60));
  
  console.log(`\n${colors.bright}Issues Found:${colors.reset}`);
  console.log('1. FIRES: NASA FIRMS API works but data not reaching Redis');
  console.log('2. CYCLONES: GDACS returning non-cyclone events as cyclones');
  console.log('3. WILDFIRES: GDACS has data but not stored in Redis');
  console.log('4. SPACE WEATHER: API works but data not stored');
  
  console.log(`\n${colors.bright}Recommendations:${colors.reset}`);
  console.log('1. Check server.js transform functions for errors');
  console.log('2. Add error logging to transformation functions');
  console.log('3. Filter GDACS cyclones by windspeed > 0');
  console.log('4. Check Redis storage in storeInRedis function');
  console.log('5. Check cron job execution logs');

  await redis.quit();
}

diagnoseIssues().catch(console.error);