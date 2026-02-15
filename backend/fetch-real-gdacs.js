// fix-data.js - Fix data issues in RealNow
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
  cyan: '\x1b[36m'
};

class DataFixer {
  constructor() {
    this.redis = null;
  }

  async connect() {
    this.redis = Redis.createClient({
      socket: { host: 'localhost', port: 6379 }
    });
    await this.redis.connect();
    console.log(`${colors.green}✓ Connected to Redis${colors.reset}\n`);
  }

  log(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  // Fix NASA FIRMS Fire Data
  async fixFiresData() {
    this.log('\n1. FIXING FIRES DATA', 'yellow');
    console.log('─'.repeat(50));
    
    try {
      const firmsKey = process.env.FIRMS_MAP_KEY || '1ab1f40c11fa5a952619c58594702b1f';
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/world/2`;
      
      this.log('Fetching NASA FIRMS data...', 'cyan');
      const response = await axios.get(url, {
        timeout: 30000,
        headers: { 'User-Agent': 'RealNow/2.0' }
      });

      const csvData = response.data;
      const lines = csvData.split('\n').filter(line => line.trim());
      
      if (lines.length <= 1) {
        this.log('No fire data available', 'red');
        return;
      }

      this.log(`Processing ${lines.length - 1} fire points...`, 'cyan');
      
      const fires = [];
      const headers = lines[0].split(',');
      
      // Process up to 2000 fires
      for (let i = 1; i < Math.min(lines.length, 2001); i++) {
        const values = lines[i].split(',');
        if (values.length >= 13) {
          const lat = parseFloat(values[0]);
          const lon = parseFloat(values[1]);
          const brightness = parseFloat(values[2]);
          const frp = parseFloat(values[12]) || 0;
          
          if (!isNaN(lat) && !isNaN(lon)) {
            fires.push({
              id: `fire_${i}_${Date.now()}`,
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
              source: 'NASA_FIRMS'
            });
          }
        }
      }

      const fireData = {
        type: 'fires',
        timestamp: new Date().toISOString(),
        count: fires.length,
        features: fires
      };

      await this.redis.set('data:fires', JSON.stringify(fireData), { EX: 600 });
      this.log(`✓ Fixed! Stored ${fires.length} fires in Redis`, 'green');
      
    } catch (error) {
      this.log(`✗ Error fixing fires: ${error.message}`, 'red');
    }
  }

  // Fix GDACS Cyclones (filter out non-cyclones)
  async fixCyclonesData() {
    this.log('\n2. FIXING CYCLONES DATA', 'yellow');
    console.log('─'.repeat(50));
    
    try {
      const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
      
      this.log('Fetching all GDACS events...', 'cyan');
      const response = await axios.get(url, { timeout: 15000 });
      
      const allEvents = response.data.features || [];
      
      // Filter for REAL tropical cyclones (TC with wind speed > 0)
      const realCyclones = allEvents
        .filter(f => 
          f.properties && 
          f.properties.eventtype === 'TC' && 
          f.properties.windspeed > 0 &&
          f.geometry?.coordinates
        )
        .map(f => {
          const props = f.properties;
          const coords = f.geometry.coordinates;
          
          return {
            id: `gdacs_tc_${props.eventid || Math.random()}`,
            type: 'cyclone',
            name: props.eventname || props.name || 'Cyclone',
            coordinates: coords,
            latitude: coords[1],
            longitude: coords[0],
            alertLevel: props.alertlevel || 'Green',
            category: props.tc_category || this.getCycloneCategory(props.windspeed),
            windSpeed: parseInt(props.windspeed || 0),
            pressure: parseInt(props.pressure || 0),
            direction: props.direction || 0,
            speed: props.speed || 0,
            country: props.country || '',
            affectedCountries: props.affectedcountries || [],
            fromDate: props.fromdate,
            toDate: props.todate,
            source: 'GDACS'
          };
        });

      this.log(`Found ${realCyclones.length} REAL cyclones (from ${allEvents.length} total events)`, 'cyan');
      
      const cycloneData = {
        type: 'cyclones',
        timestamp: new Date().toISOString(),
        count: realCyclones.length,
        features: realCyclones
      };

      await this.redis.set('data:cyclones', JSON.stringify(cycloneData), { EX: 600 });
      this.log(`✓ Fixed! Stored ${realCyclones.length} real cyclones`, 'green');
      
      if (realCyclones.length > 0) {
        console.log('\nSample real cyclone:');
        const sample = realCyclones[0];
        console.log(`  Name: ${sample.name}`);
        console.log(`  Wind: ${sample.windSpeed} km/h`);
        console.log(`  Category: ${sample.category}`);
      }
      
    } catch (error) {
      this.log(`✗ Error fixing cyclones: ${error.message}`, 'red');
    }
  }

  getCycloneCategory(windSpeed) {
    if (windSpeed >= 252) return 'Category 5';
    if (windSpeed >= 209) return 'Category 4';
    if (windSpeed >= 178) return 'Category 3';
    if (windSpeed >= 154) return 'Category 2';
    if (windSpeed >= 119) return 'Category 1';
    if (windSpeed >= 63) return 'Tropical Storm';
    return 'Tropical Depression';
  }

  // Fix Space Weather Data
  async fixSpaceWeatherData() {
    this.log('\n3. FIXING SPACE WEATHER DATA', 'yellow');
    console.log('─'.repeat(50));
    
    try {
      const url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
      
      this.log('Fetching NOAA Space Weather data...', 'cyan');
      const response = await axios.get(url, { timeout: 10000 });
      
      if (!Array.isArray(response.data) || response.data.length < 2) {
        this.log('Invalid space weather data', 'red');
        return;
      }

      const readings = response.data.slice(1).map(reading => ({
        time: reading[0],
        kpIndex: parseFloat(reading[1]),
        estimated: reading[2] === '1'
      }));

      const latest = readings[readings.length - 1];
      if (!latest) return;

      const kp = latest.kpIndex || 0;
      
      const spaceWeatherData = {
        type: 'spaceweather',
        timestamp: new Date().toISOString(),
        count: 1,
        features: [{
          id: `space_${Date.now()}`,
          type: 'spaceweather',
          currentKp: kp,
          severity: this.getSpaceWeatherSeverity(kp),
          time: latest.time,
          coordinates: [0, 90],
          description: this.getSpaceWeatherDescription(kp),
          source: 'NOAA_SWPC'
        }]
      };

      await this.redis.set('data:spaceweather', JSON.stringify(spaceWeatherData), { EX: 1800 });
      this.log(`✓ Fixed! Space Weather Kp=${kp} (${this.getSpaceWeatherSeverity(kp)})`, 'green');
      
    } catch (error) {
      this.log(`✗ Error fixing space weather: ${error.message}`, 'red');
    }
  }

  getSpaceWeatherSeverity(kp) {
    if (kp >= 9) return 'G5_extreme';
    if (kp >= 8) return 'G4_severe';
    if (kp >= 7) return 'G3_strong';
    if (kp >= 6) return 'G2_moderate';
    if (kp >= 5) return 'G1_minor';
    return 'quiet';
  }

  getSpaceWeatherDescription(kp) {
    if (kp >= 9) return 'Extreme geomagnetic storm - Power grids and satellites at risk';
    if (kp >= 8) return 'Severe geomagnetic storm - Widespread voltage control problems';
    if (kp >= 7) return 'Strong geomagnetic storm - Voltage corrections required';
    if (kp >= 6) return 'Moderate geomagnetic storm - High-latitude power systems affected';
    if (kp >= 5) return 'Minor geomagnetic storm - Weak power grid fluctuations';
    return 'Quiet conditions - No significant impacts';
  }

  // Fix Wildfires Data
  async fixWildfiresData() {
    this.log('\n4. FIXING WILDFIRES DATA', 'yellow');
    console.log('─'.repeat(50));
    
    try {
      const toDate = new Date().toISOString().split('T')[0];
      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=WF&fromdate=${fromDate}&todate=${toDate}`;
      
      this.log('Fetching GDACS Wildfire data...', 'cyan');
      const response = await axios.get(url, { timeout: 15000 });
      
      const wildfires = (response.data.features || [])
        .filter(f => f.properties && f.geometry?.coordinates)
        .map(f => {
          const props = f.properties;
          const coords = f.geometry.coordinates;
          
          return {
            id: `gdacs_wf_${props.eventid || Math.random()}`,
            type: 'wildfire',
            name: props.eventname || props.name || 'Wildfire',
            coordinates: coords,
            latitude: coords[1],
            longitude: coords[0],
            alertLevel: props.alertlevel || 'Green',
            alertScore: parseInt(props.alertscore || 0),
            severity: props.severitydata?.severity || props.severity || 'Unknown',
            affectedArea: parseInt(props.affectedarea || 0),
            country: props.country || props.countryname || '',
            population: parseInt(props.population || 0),
            fromDate: props.fromdate,
            toDate: props.todate,
            duration: parseInt(props.duration || 0),
            source: 'GDACS',
            description: props.description || props.eventname || ''
          };
        });

      const wildfireData = {
        type: 'wildfires',
        timestamp: new Date().toISOString(),
        count: wildfires.length,
        features: wildfires
      };

      await this.redis.set('data:wildfires', JSON.stringify(wildfireData), { EX: 1200 });
      this.log(`✓ Fixed! Stored ${wildfires.length} wildfires`, 'green');
      
    } catch (error) {
      this.log(`✗ Error fixing wildfires: ${error.message}`, 'red');
    }
  }

  // Summary check
  async checkResults() {
    this.log('\n5. VERIFICATION', 'yellow');
    console.log('─'.repeat(50));
    
    const types = ['fires', 'cyclones', 'spaceweather', 'wildfires'];
    
    for (const type of types) {
      const data = await this.redis.get(`data:${type}`);
      if (data) {
        const parsed = JSON.parse(data);
        this.log(`✓ ${type}: ${parsed.count} events`, 'green');
      } else {
        this.log(`✗ ${type}: No data`, 'red');
      }
    }
  }

  async run() {
    console.clear();
    this.log('🔧 REALNOW DATA FIXER', 'cyan');
    this.log('Fixing known data issues...', 'blue');
    
    try {
      await this.connect();
      
      // Fix each problematic data type
      await this.fixFiresData();
      await this.fixCyclonesData();
      await this.fixSpaceWeatherData();
      await this.fixWildfiresData();
      
      // Verify results
      await this.checkResults();
      
      this.log('\n✅ Fix process complete!', 'green');
      this.log('Note: These are temporary fixes. Update server.js for permanent solution.', 'yellow');
      
    } catch (error) {
      this.log(`Fatal error: ${error.message}`, 'red');
    } finally {
      if (this.redis) {
        await this.redis.quit();
      }
    }
  }
}

// Run the fixer
const fixer = new DataFixer();
fixer.run().catch(console.error);