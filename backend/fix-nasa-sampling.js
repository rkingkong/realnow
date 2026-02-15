// fix-nasa-sampling.js - Fix NASA FIRMS to sample from ALL regions, not just first 999

const fs = require('fs');

const fixedTransform = `  // Transform NASA FIRMS Fire Data - FIXED REGIONAL SAMPLING
  transformNASAFires(csvData) {
    if (!csvData || typeof csvData !== 'string') {
      console.log('No fire data received');
      return null;
    }

    const lines = csvData.split('\\n').filter(line => line.trim());
    if (lines.length <= 1) {
      return null;
    }

    console.log(\`📊 NASA FIRMS: Processing \${lines.length - 1} total fires\`);

    // Parse ALL fires first to understand distribution
    const allFires = [];
    const headers = lines[0].split(',');
    
    // Process ALL fires (not just first 999)
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length >= 13) {
        const lat = parseFloat(values[0]);
        const lon = parseFloat(values[1]);
        const brightness = parseFloat(values[2]);
        const frp = parseFloat(values[12]) || 0;
        
        if (!isNaN(lat) && !isNaN(lon)) {
          // Determine region
          let region = 'Other';
          if (lon > -170 && lon < -30) region = 'Americas';
          else if (lon > -25 && lon < 45 && lat > 35 && lat < 71) region = 'Europe';
          else if (lon > -20 && lon < 52 && lat > -35 && lat < 37) region = 'Africa';
          else if (lon > 45 && lon < 180 && lat > -10 && lat < 77) region = 'Asia';
          else if (lon > 110 && lon < 160 && lat > -50 && lat < -10) region = 'Australia';
          
          allFires.push({
            id: \`fire_\${i}_\${Date.now()}\`,
            type: 'fire',
            latitude: lat,
            longitude: lon,
            coordinates: [lon, lat],
            brightness: brightness,
            scan: parseFloat(values[3]),
            track: parseFloat(values[4]),
            date: values[5],
            time: values[6],
            satellite: values[7],
            confidence: values[9],
            version: values[10],
            bright_t31: parseFloat(values[11]),
            frp: frp,
            daynight: values[13] || 'D',
            source: 'NASA_FIRMS',
            intensity: this.calculateFireIntensity(frp, brightness),
            region: region
          });
        }
      }
    }

    // Group by region
    const byRegion = {};
    allFires.forEach(fire => {
      if (!byRegion[fire.region]) byRegion[fire.region] = [];
      byRegion[fire.region].push(fire);
    });

    // Log regional distribution
    console.log('🌍 NASA FIRMS Regional Distribution:');
    Object.entries(byRegion).forEach(([region, fires]) => {
      console.log(\`   \${region}: \${fires.length} fires\`);
    });

    // SMART SAMPLING: Take proportional samples from each region
    const maxFires = 2000; // Increase limit for better coverage
    const sampledFires = [];
    
    // Calculate how many to take from each region
    const totalFires = allFires.length;
    Object.entries(byRegion).forEach(([region, regionFires]) => {
      // Take proportional amount from each region
      const proportion = regionFires.length / totalFires;
      const toTake = Math.ceil(proportion * maxFires);
      
      // Sort by intensity (FRP) and take the most significant ones
      regionFires.sort((a, b) => (b.frp || 0) - (a.frp || 0));
      
      // Take top fires from this region
      const selected = regionFires.slice(0, toTake);
      sampledFires.push(...selected);
      
      console.log(\`   Taking \${selected.length} from \${region} (most intense)\`);
    });

    // Sort final list by intensity
    sampledFires.sort((a, b) => (b.frp || 0) - (a.frp || 0));
    
    // Limit to maxFires
    const finalFires = sampledFires.slice(0, maxFires);

    console.log(\`✅ Processed \${finalFires.length} fires from NASA FIRMS (sampled from \${allFires.length} total)\`);
    
    // Final regional count
    const finalRegions = {};
    finalFires.forEach(f => {
      finalRegions[f.region] = (finalRegions[f.region] || 0) + 1;
    });
    console.log('📍 Final sample distribution:', finalRegions);
    
    return {
      type: 'fires',
      timestamp: new Date().toISOString(),
      count: finalFires.length,
      features: finalFires,
      totalAvailable: allFires.length,
      regionCounts: finalRegions
    };
  }`;

// Read current server.js
let serverContent = fs.readFileSync('/var/www/realnow/backend/server.js', 'utf8');

// Find the transformNASAFires function
const startPattern = /transformNASAFires\(csvData\)\s*{/;
const startMatch = serverContent.match(startPattern);

if (startMatch) {
  const startIndex = serverContent.indexOf(startMatch[0]);
  
  // Find the matching closing brace
  let braceCount = 0;
  let endIndex = startIndex;
  let inFunction = false;
  
  for (let i = startIndex; i < serverContent.length; i++) {
    if (serverContent[i] === '{') {
      braceCount++;
      inFunction = true;
    } else if (serverContent[i] === '}') {
      braceCount--;
      if (inFunction && braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  
  // Replace the function
  serverContent = serverContent.substring(0, startIndex) + fixedTransform + serverContent.substring(endIndex);
  
  // Save the file
  fs.writeFileSync('/var/www/realnow/backend/server.js', serverContent);
  
  console.log('✅ Fixed NASA FIRMS transform to sample from ALL regions');
  console.log('✅ Increased limit to 2000 fires for better coverage');
  console.log('✅ Now takes proportional samples from each region');
} else {
  console.log('❌ Could not find transformNASAFires function');
}
