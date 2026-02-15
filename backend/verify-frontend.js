// verify-frontend.js - Check what the frontend API is serving

const axios = require('axios');

async function verifyFrontend() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🌍 VERIFYING FRONTEND DATA DELIVERY');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Test the aggregate endpoint (what frontend uses)
  try {
    const response = await axios.get('http://localhost:3001/api/aggregate');
    const data = response.data;
    
    console.log('📊 DATA AVAILABLE TO FRONTEND:');
    console.log('───────────────────────────────────────────────────');
    
    Object.entries(data).forEach(([type, typeData]) => {
      const count = typeData?.features?.length || typeData?.count || 0;
      console.log(`${type}: ${count} events`);
      
      // For fires, show regional breakdown
      if (type === 'fires' && typeData?.features?.length > 0) {
        const americas = typeData.features.filter(f => f.longitude > -170 && f.longitude < -30).length;
        const europe = typeData.features.filter(f => f.longitude > -25 && f.longitude < 45 && f.latitude > 35).length;
        console.log(`  → Americas: ${americas}, Europe: ${europe}`);
        
        // Show most intense Americas fire
        const americasFires = typeData.features
          .filter(f => f.longitude > -170 && f.longitude < -30)
          .sort((a, b) => (b.frp || 0) - (a.frp || 0));
        
        if (americasFires.length > 0) {
          const top = americasFires[0];
          console.log(`  → Strongest Americas fire: ${top.latitude.toFixed(2)}, ${top.longitude.toFixed(2)} (FRP: ${top.frp?.toFixed(0)} MW)`);
        }
      }
      
      // For wildfires, show countries
      if (type === 'wildfires' && typeData?.features?.length > 0) {
        const countries = [...new Set(typeData.features.map(w => w.country?.split(',')[0]))];
        console.log(`  → Countries: ${countries.slice(0, 5).join(', ')}`);
      }
    });
    
    console.log('\n📱 FRONTEND CHECKLIST:');
    console.log('───────────────────────────────────────────────────');
    
    const checks = [
      {
        name: 'Fires endpoint working',
        pass: data.fires?.features?.length > 0
      },
      {
        name: 'Americas fires available',
        pass: data.fires?.features?.some(f => f.longitude > -170 && f.longitude < -30)
      },
      {
        name: 'Europe fires available',
        pass: data.fires?.features?.some(f => f.longitude > -25 && f.longitude < 45 && f.latitude > 35)
      },
      {
        name: 'Wildfires available',
        pass: data.wildfires?.features?.length > 0
      },
      {
        name: 'Wildfires have coordinates',
        pass: data.wildfires?.features?.some(w => w.latitude && w.longitude)
      },
      {
        name: 'High intensity fires included',
        pass: data.fires?.features?.some(f => f.frp > 500)
      }
    ];
    
    checks.forEach(check => {
      console.log(`${check.pass ? '✅' : '❌'} ${check.name}`);
    });
    
    const passed = checks.filter(c => c.pass).length;
    console.log(`\n${passed}/${checks.length} checks passed`);
    
    if (passed === checks.length) {
      console.log('\n🎉 ALL DATA IS READY FOR FRONTEND DISPLAY!');
      console.log('\n📍 You should now see on the map:');
      console.log('  • Orange fire markers in Canada, USA, Brazil');
      console.log('  • Orange fire markers in Europe');
      console.log('  • Orange wildfire markers (larger circles)');
      console.log('  • Click any marker for detailed info');
    }
    
  } catch (error) {
    console.error('❌ Error checking frontend data:', error.message);
  }
  
  console.log('\n🔗 Visit https://realnow.com to see the updated map');
  console.log('   Zoom to Canada (around 56°N, -103°W) to see intense fires');
  console.log('   Zoom to Brazil (around -6°S, -60°W) to see Amazon fires');
}

verifyFrontend().catch(console.error);
