// validator.js - Comprehensive Data Validator for RealNow
const Redis = require('redis');
const axios = require('axios');
require('dotenv').config();

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

class DataValidator {
  constructor() {
    this.redis = null;
    this.issues = [];
    this.stats = {};
  }

  async connect() {
    this.redis = Redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379
      }
    });
    
    await this.redis.connect();
    console.log(`${colors.green}✓ Connected to Redis${colors.reset}\n`);
  }

  log(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  logHeader(title) {
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log('='.repeat(80));
  }

  logSubHeader(title) {
    console.log(`\n${colors.bright}${colors.yellow}▶ ${title}${colors.reset}`);
    console.log('-'.repeat(60));
  }

  logError(message) {
    this.issues.push(message);
    console.log(`${colors.red}❌ ERROR: ${message}${colors.reset}`);
  }

  logWarning(message) {
    this.issues.push(`WARNING: ${message}`);
    console.log(`${colors.yellow}⚠️  WARNING: ${message}${colors.reset}`);
  }

  logSuccess(message) {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
  }

  async validateDataType(type) {
    this.logSubHeader(`Validating ${type.toUpperCase()}`);
    
    try {
      const data = await this.redis.get(`data:${type}`);
      if (!data) {
        this.logError(`No data found for ${type}`);
        return null;
      }

      const parsed = JSON.parse(data);
      this.stats[type] = {
        count: parsed.count || 0,
        timestamp: parsed.timestamp,
        hasFeatures: !!parsed.features,
        featureCount: parsed.features?.length || 0
      };

      // Basic validation
      if (!parsed.features) {
        this.logError(`${type} missing 'features' array`);
        return parsed;
      }

      if (parsed.count !== parsed.features.length) {
        this.logWarning(`${type} count mismatch: reported ${parsed.count}, actual ${parsed.features.length}`);
      }

      this.logSuccess(`Found ${parsed.features.length} ${type} events`);
      
      // Analyze data structure
      if (parsed.features.length > 0) {
        this.analyzeDataStructure(type, parsed.features);
      }

      return parsed;
    } catch (error) {
      this.logError(`Failed to validate ${type}: ${error.message}`);
      return null;
    }
  }

  analyzeDataStructure(type, features) {
    console.log(`\n${colors.magenta}Data Structure Analysis:${colors.reset}`);
    
    // Get first 3 items as samples
    const samples = features.slice(0, 3);
    
    // Find all unique keys across all features
    const allKeys = new Set();
    features.forEach(f => Object.keys(f).forEach(k => allKeys.add(k)));
    
    console.log(`Total unique fields: ${allKeys.size}`);
    console.log(`Fields: ${Array.from(allKeys).sort().join(', ')}`);
    
    // Check for required fields based on type
    const requiredFields = this.getRequiredFields(type);
    const missingRequired = requiredFields.filter(field => !allKeys.has(field));
    
    if (missingRequired.length > 0) {
      this.logWarning(`Missing required fields: ${missingRequired.join(', ')}`);
    }

    // Show sample data
    console.log(`\n${colors.cyan}Sample Data (first item):${colors.reset}`);
    if (samples[0]) {
      this.prettyPrintObject(samples[0], 2);
    }

    // Field analysis
    this.analyzeFields(type, features);
  }

  getRequiredFields(type) {
    const requirements = {
      earthquakes: ['magnitude', 'coordinates', 'time', 'place'],
      fires: ['latitude', 'longitude', 'brightness', 'frp'],
      weather: ['severity', 'event', 'coordinates'],
      volcanoes: ['name', 'coordinates', 'alertLevel'],
      cyclones: ['name', 'coordinates', 'windSpeed', 'category'],
      floods: ['name', 'coordinates', 'alertLevel'],
      droughts: ['name', 'coordinates', 'severity'],
      wildfires: ['name', 'coordinates', 'alertLevel'],
      spaceweather: ['currentKp', 'severity']
    };
    
    return requirements[type] || ['coordinates', 'name'];
  }

  analyzeFields(type, features) {
    console.log(`\n${colors.cyan}Field Analysis:${colors.reset}`);
    
    const fieldStats = {};
    
    features.forEach(feature => {
      Object.entries(feature).forEach(([key, value]) => {
        if (!fieldStats[key]) {
          fieldStats[key] = {
            count: 0,
            types: new Set(),
            nullCount: 0,
            samples: []
          };
        }
        
        fieldStats[key].count++;
        
        if (value === null || value === undefined) {
          fieldStats[key].nullCount++;
        } else {
          fieldStats[key].types.add(typeof value);
          if (fieldStats[key].samples.length < 3) {
            fieldStats[key].samples.push(value);
          }
        }
      });
    });

    // Print field statistics
    Object.entries(fieldStats).forEach(([field, stats]) => {
      const coverage = ((stats.count / features.length) * 100).toFixed(1);
      const nullPercent = ((stats.nullCount / stats.count) * 100).toFixed(1);
      
      console.log(`\n  ${colors.bright}${field}:${colors.reset}`);
      console.log(`    Coverage: ${coverage}% (${stats.count}/${features.length})`);
      console.log(`    Types: ${Array.from(stats.types).join(', ')}`);
      console.log(`    Null values: ${nullPercent}%`);
      
      if (stats.samples.length > 0) {
        console.log(`    Samples: ${stats.samples.slice(0, 2).map(s => 
          typeof s === 'object' ? JSON.stringify(s) : String(s)
        ).join(', ')}`);
      }
    });
  }

  prettyPrintObject(obj, indent = 0) {
    const spaces = ' '.repeat(indent);
    
    Object.entries(obj).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        console.log(`${spaces}${colors.bright}${key}:${colors.reset} ${colors.red}null${colors.reset}`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        console.log(`${spaces}${colors.bright}${key}:${colors.reset}`);
        this.prettyPrintObject(value, indent + 2);
      } else if (Array.isArray(value)) {
        console.log(`${spaces}${colors.bright}${key}:${colors.reset} [${value.length} items]`);
        if (value.length > 0 && typeof value[0] !== 'object') {
          console.log(`${spaces}  ${value.slice(0, 3).join(', ')}${value.length > 3 ? '...' : ''}`);
        }
      } else {
        let displayValue = String(value);
        if (displayValue.length > 100) {
          displayValue = displayValue.substring(0, 100) + '...';
        }
        console.log(`${spaces}${colors.bright}${key}:${colors.reset} ${displayValue}`);
      }
    });
  }

  async checkDataSources() {
    this.logHeader('CHECKING ORIGINAL DATA SOURCES');
    
    const sources = {
      'USGS Earthquakes': {
        url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
        check: async (data) => {
          console.log(`Total earthquakes in feed: ${data.features?.length || 0}`);
          const mag6Plus = data.features?.filter(f => f.properties.mag >= 6).length || 0;
          console.log(`Magnitude 6.0+: ${mag6Plus}`);
        }
      },
      'NASA FIRMS': {
        url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.FIRMS_MAP_KEY || '1ab1f40c11fa5a952619c58594702b1f'}/VIIRS_SNPP_NRT/world/2`,
        check: async (data) => {
          const lines = data.split('\n').length - 1;
          console.log(`Total fire points: ${lines}`);
        }
      },
      'NOAA Weather': {
        url: 'https://api.weather.gov/alerts/active',
        check: async (data) => {
          console.log(`Total weather alerts: ${data.features?.length || 0}`);
          const severe = data.features?.filter(f => f.properties.severity === 'Severe').length || 0;
          console.log(`Severe alerts: ${severe}`);
        }
      },
      'GDACS Combined': {
        url: 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH',
        check: async (data) => {
          const types = {};
          data.features?.forEach(f => {
            const type = f.properties.eventtype;
            types[type] = (types[type] || 0) + 1;
          });
          console.log('Event types found:', types);
        }
      }
    };

    for (const [name, config] of Object.entries(sources)) {
      this.logSubHeader(`Checking ${name}`);
      try {
        const response = await axios.get(config.url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'RealNow-Validator/1.0'
          }
        });
        
        this.logSuccess(`Connected to ${name}`);
        await config.check(response.data);
      } catch (error) {
        this.logError(`Failed to check ${name}: ${error.message}`);
      }
    }
  }

  async checkGDACSBug() {
    this.logHeader('TESTING GDACS API BUG');
    
    const eventTypes = ['EQ', 'TC', 'FL', 'WF', 'VO', 'DR'];
    
    for (const type of eventTypes) {
      console.log(`\nTesting eventtype=${type}:`);
      
      try {
        const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=${type}`;
        const response = await axios.get(url, { timeout: 10000 });
        
        const actualTypes = {};
        response.data.features?.forEach(f => {
          const actualType = f.properties.eventtype;
          actualTypes[actualType] = (actualTypes[actualType] || 0) + 1;
        });
        
        console.log(`  Requested: ${type}`);
        console.log(`  Received: ${JSON.stringify(actualTypes)}`);
        
        if (Object.keys(actualTypes).length > 0 && !actualTypes[type]) {
          this.logError(`GDACS BUG CONFIRMED: Requested ${type} but got ${Object.keys(actualTypes).join(', ')}`);
        }
      } catch (error) {
        console.log(`  Error: ${error.message}`);
      }
    }
  }

  async validateCoordinates() {
    this.logHeader('COORDINATE VALIDATION');
    
    const types = ['earthquakes', 'fires', 'weather', 'volcanoes', 'cyclones', 'floods', 'droughts', 'wildfires'];
    
    for (const type of types) {
      const data = await this.redis.get(`data:${type}`);
      if (!data) continue;
      
      const parsed = JSON.parse(data);
      if (!parsed.features || parsed.features.length === 0) continue;
      
      console.log(`\n${colors.bright}${type.toUpperCase()}:${colors.reset}`);
      
      let validCoords = 0;
      let invalidCoords = 0;
      let missingCoords = 0;
      
      parsed.features.forEach((feature, idx) => {
        let lat, lon;
        
        // Try different coordinate formats
        if (feature.coordinates && Array.isArray(feature.coordinates)) {
          lon = feature.coordinates[0];
          lat = feature.coordinates[1];
        } else if (feature.latitude !== undefined && feature.longitude !== undefined) {
          lat = feature.latitude;
          lon = feature.longitude;
        } else if (feature.geometry?.coordinates) {
          lon = feature.geometry.coordinates[0];
          lat = feature.geometry.coordinates[1];
        } else {
          missingCoords++;
          if (idx < 3) {
            console.log(`  Missing coords: ${feature.name || feature.id || 'Unknown'}`);
          }
          return;
        }
        
        // Validate coordinates
        if (isNaN(lat) || isNaN(lon)) {
          invalidCoords++;
        } else if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          invalidCoords++;
          if (idx < 3) {
            console.log(`  Invalid coords: [${lat}, ${lon}] for ${feature.name || 'Unknown'}`);
          }
        } else {
          validCoords++;
        }
      });
      
      console.log(`  Valid: ${validCoords}, Invalid: ${invalidCoords}, Missing: ${missingCoords}`);
    }
  }

  async generateReport() {
    this.logHeader('VALIDATION SUMMARY REPORT');
    
    console.log(`\n${colors.bright}Data Statistics:${colors.reset}`);
    console.table(this.stats);
    
    if (this.issues.length > 0) {
      console.log(`\n${colors.bright}Issues Found (${this.issues.length}):${colors.reset}`);
      this.issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue}`);
      });
    } else {
      this.logSuccess('No major issues found!');
    }
    
    // Recommendations
    console.log(`\n${colors.bright}${colors.cyan}RECOMMENDATIONS:${colors.reset}`);
    
    // Check for empty data sources
    const emptyTypes = Object.entries(this.stats)
      .filter(([type, stats]) => stats.count === 0)
      .map(([type]) => type);
    
    if (emptyTypes.length > 0) {
      console.log(`\n1. Empty data sources: ${emptyTypes.join(', ')}`);
      console.log('   Consider adding alternative data sources for these types.');
    }
    
    // Check for miscategorization
    if (this.issues.some(issue => issue.includes('GDACS BUG'))) {
      console.log('\n2. GDACS API Bug Detected:');
      console.log('   - GDACS returns wrong event types for some queries');
      console.log('   - Implement filtering by eventtype property after fetching');
    }
    
    console.log('\n3. Data Source Recommendations:');
    console.log('   - Volcanoes: Add NASA EONET (https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes)');
    console.log('   - Floods: Add ReliefWeb API for humanitarian disasters');
    console.log('   - Consider regional APIs for better coverage');
  }

  async testSpecificAPIs() {
    this.logHeader('TESTING ADDITIONAL DATA SOURCES');
    
    // Test NASA EONET
    this.logSubHeader('NASA EONET - Volcanoes');
    try {
      const response = await axios.get('https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&limit=10');
      const events = response.data.events || [];
      console.log(`Found ${events.length} volcano events`);
      if (events.length > 0) {
        console.log('Sample event:', {
          title: events[0].title,
          date: events[0].geometry?.[0]?.date,
          coordinates: events[0].geometry?.[0]?.coordinates
        });
      }
    } catch (error) {
      this.logError(`NASA EONET error: ${error.message}`);
    }

    // Test ReliefWeb
    this.logSubHeader('ReliefWeb - Disasters');
    try {
      const response = await axios.get('https://api.reliefweb.int/v1/disasters?appname=realnow&preset=latest&limit=10');
      const disasters = response.data.data || [];
      console.log(`Found ${disasters.length} recent disasters`);
      const floods = disasters.filter(d => d.fields?.name?.toLowerCase().includes('flood'));
      console.log(`Floods: ${floods.length}`);
    } catch (error) {
      this.logError(`ReliefWeb error: ${error.message}`);
    }
  }

  async run() {
    console.clear();
    console.log(`${colors.bright}${colors.green}🔍 REALNOW DATA VALIDATOR v2.0${colors.reset}`);
    console.log(`${colors.cyan}Validating all disaster data sources...${colors.reset}\n`);
    
    try {
      await this.connect();
      
      // Validate each data type
      const types = ['earthquakes', 'fires', 'weather', 'volcanoes', 'cyclones', 
                     'floods', 'droughts', 'wildfires', 'spaceweather'];
      
      for (const type of types) {
        await this.validateDataType(type);
      }
      
      // Check original data sources
      await this.checkDataSources();
      
      // Test GDACS bug
      await this.checkGDACSBug();
      
      // Validate coordinates
      await this.validateCoordinates();
      
      // Test additional APIs
      await this.testSpecificAPIs();
      
      // Generate report
      await this.generateReport();
      
    } catch (error) {
      this.logError(`Fatal error: ${error.message}`);
    } finally {
      if (this.redis) {
        await this.redis.quit();
      }
    }
  }
}

// Run the validator
const validator = new DataValidator();
validator.run().catch(console.error);