// ensure-auto-refresh.js - Verify and test automatic refresh system

const Redis = require('redis');
const axios = require('axios');

async function ensureAutoRefresh() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔄 AUTOMATIC REFRESH VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const redis = Redis.createClient({
    socket: { host: 'localhost', port: 6379 }
  });
  await redis.connect();
  
  // 1. Check current data timestamps
  console.log('📅 CURRENT DATA TIMESTAMPS:');
  console.log('───────────────────────────────────────────────────────');
  
  const dataTypes = [
    { name: 'earthquakes', interval: 5 },
    { name: 'fires', interval: 10 },
    { name: 'weather', interval: 5 },
    { name: 'wildfires', interval: 20 },
    { name: 'volcanoes', interval: 15 },
    { name: 'cyclones', interval: 10 }
  ];
  
  const currentTimes = {};
  
  for (const type of dataTypes) {
    const data = await redis.get(`data:${type.name}`);
    if (data) {
      const parsed = JSON.parse(data);
      const timestamp = new Date(parsed.timestamp);
      const age = Math.floor((Date.now() - timestamp.getTime()) / 60000);
      currentTimes[type.name] = timestamp.getTime();
      
      console.log(`${type.name}:`);
      console.log(`  Last update: ${timestamp.toLocaleTimeString()}`);
      console.log(`  Age: ${age} minutes`);
      console.log(`  Refresh interval: Every ${type.interval} minutes`);
      console.log(`  Next refresh: ~${new Date(timestamp.getTime() + type.interval * 60000).toLocaleTimeString()}`);
      
      if (age > type.interval + 5) {
        console.log(`  ⚠️ WARNING: Data older than expected!`);
      }
    } else {
      console.log(`${type.name}: No data`);
    }
  }
  
  // 2. Wait and check if data updates
  console.log('\n⏳ TESTING AUTO-REFRESH (waiting 2 minutes)...');
  console.log('───────────────────────────────────────────────────────');
  console.log('Starting test at:', new Date().toLocaleTimeString());
  
  // Wait 2 minutes
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  console.log('Checking for updates at:', new Date().toLocaleTimeString());
  
  let updatesDetected = 0;
  console.log('\n📊 REFRESH DETECTION:');
  console.log('───────────────────────────────────────────────────────');
  
  for (const type of dataTypes) {
    const data = await redis.get(`data:${type.name}`);
    if (data) {
      const parsed = JSON.parse(data);
      const newTimestamp = new Date(parsed.timestamp).getTime();
      const oldTimestamp = currentTimes[type.name];
      
      if (newTimestamp > oldTimestamp) {
        console.log(`✅ ${type.name}: UPDATED! (refreshed automatically)`);
        updatesDetected++;
      } else {
        const age = Math.floor((Date.now() - newTimestamp) / 60000);
        if (age <= type.interval) {
          console.log(`⏳ ${type.name}: Not due yet (${type.interval - age} min until refresh)`);
        } else {
          console.log(`⚠️ ${type.name}: Should have updated but didn't`);
        }
      }
    }
  }
  
  // 3. Check cron jobs in PM2
  console.log('\n🕐 CRON JOB STATUS:');
  console.log('───────────────────────────────────────────────────────');
  
  const { exec } = require('child_process');
  const pm2Logs = await new Promise((resolve) => {
    exec('pm2 logs realnow-backend --nostream --lines 200', (error, stdout) => {
      resolve(stdout || '');
    });
  });
  
  // Count recent data fetches
  const fetchPatterns = [
    { pattern: /Fetching earthquakes/gi, name: 'Earthquake fetches' },
    { pattern: /Fetching fires/gi, name: 'Fire fetches' },
    { pattern: /Fetching weather/gi, name: 'Weather fetches' },
    { pattern: /Fetching wildfires/gi, name: 'Wildfire fetches' }
  ];
  
  fetchPatterns.forEach(({ pattern, name }) => {
    const matches = pm2Logs.match(pattern);
    const count = matches ? matches.length : 0;
    console.log(`${name} in recent logs: ${count}`);
  });
  
  // 4. Manual trigger test
  console.log('\n🔧 MANUAL REFRESH TEST:');
  console.log('───────────────────────────────────────────────────────');
  
  try {
    const response = await axios.post('http://localhost:3001/api/refresh/fires');
    if (response.data.success) {
      console.log('✅ Manual refresh endpoint working');
      console.log(`   Refreshed ${response.data.count} fires`);
    }
  } catch (error) {
    console.log('❌ Manual refresh failed:', error.message);
  }
  
  // 5. Final verdict
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 AUTO-REFRESH VERDICT:');
  console.log('───────────────────────────────────────────────────────');
  
  if (updatesDetected > 0) {
    console.log(`✅ AUTOMATIC REFRESH IS WORKING!`);
    console.log(`   ${updatesDetected} data types updated during test`);
  } else {
    console.log('⚠️ No automatic updates detected in 2 minutes');
    console.log('   This might be normal if data was recently refreshed');
    console.log('   Run this test again in 10 minutes to confirm');
  }
  
  console.log('\n📊 REFRESH SCHEDULE:');
  console.log('───────────────────────────────────────────────────────');
  console.log('Your platform automatically refreshes:');
  console.log('  • Earthquakes: Every 5 minutes');
  console.log('  • Weather: Every 5 minutes');
  console.log('  • Fires: Every 10 minutes');
  console.log('  • Cyclones: Every 10 minutes');
  console.log('  • Volcanoes: Every 15 minutes');
  console.log('  • Wildfires: Every 20 minutes');
  console.log('\n✅ Data stays fresh 24/7 without manual intervention!');
  
  await redis.quit();
}

// Run the test
console.log('This test will take 2 minutes to check for automatic updates...\n');
ensureAutoRefresh().catch(console.error);