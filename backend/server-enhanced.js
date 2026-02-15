// Enhanced server with better data collection
const express = require('express');
const cors = require('cors');
const Redis = require('redis');
const { Server } = require('socket.io');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const redis = Redis.createClient({
  socket: { host: process.env.REDIS_HOST || 'localhost', port: 6379 }
});

redis.on('error', err => console.log('Redis Error:', err));
redis.connect();

app.use(cors());
app.use(express.json());

class EnhancedDataAggregator {
  constructor() {
    this.dataSources = {
      // Broader earthquake data - 7 days
      earthquakes: {
        url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
        interval: '*/5 * * * *',
        transform: this.transformEarthquakeData
      },

      // NASA FIRMS fires
      fires: {
        url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/1ab1f40c11fa5a952619c58594702b1f/VIIRS_SNPP_NRT/world/2`,
        interval: '*/10 * * * *',
        transform: this.transformFireData
      },

      // NOAA Weather
      weather: {
        url: 'https://api.weather.gov/alerts/active',
        interval: '*/5 * * * *',
        transform: this.transformWeatherData
      },

      // Individual GDACS endpoints for better control
      volcanoes: {
        url: () => {
          const toDate = new Date().toISOString().split('T')[0];
          const fromDate = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
          return `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=VO&fromdate=${fromDate}&todate=${toDate}&alertlevel=Green;Orange;Red`;
        },
        interval: '*/30 * * * *',
        transform: this.transformVolcanoData
      },

      cyclones: {
        url: () => {
          const toDate = new Date().toISOString().split('T')[0];
          const fromDate = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
          return `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=TC&fromdate=${fromDate}&todate=${toDate}&alertlevel=Green;Orange;Red`;
        },
        interval: '*/30 * * * *',
        transform: this.transformCycloneData
      },

      floods: {
        url: () => {
          const toDate = new Date().toISOString().split('T')[0];
          const fromDate = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
          return `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=FL&fromdate=${fromDate}&todate=${toDate}&alertlevel=Green;Orange;Red`;
        },
        interval: '*/30 * * * *',
        transform: this.transformFloodData
      }
    };
  }

  async fetchData(source) {
    try {
      const config = this.dataSources[source];
      const url = typeof config.url === 'function' ? config.url() : config.url;
      
      console.log(`📡 Fetching ${source} from:`, url.substring(0, 100) + '...');
      
      const response = await axios.get(url, {
        timeout: 30000,
        headers: { 'User-Agent': 'RealNow-Tracker/2.0' }
      });
      
      const transformedData = config.transform.call(this, response.data);
      
      if (transformedData && transformedData.features) {
        console.log(`✅ ${source}: ${transformedData.features.length} items processed`);
        
        await redis.set(`data:${source}`, JSON.stringify(transformedData), {
          EX: source.includes('earthquake') ? 300 : 600
        });

        io.emit(`update:${source}`, transformedData);
        return transformedData;
      }
    } catch (error) {
      console.error(`❌ Error fetching ${source}:`, error.message);
      const cached = await redis.get(`data:${source}`);
      return cached ? JSON.parse(cached) : null;
    }
  }

  transformEarthquakeData(data) {
    if (!data?.features) return { type: 'earthquakes', features: [], count: 0 };
    
    // Get ALL earthquakes >= 2.5, limit to most recent 200
    const earthquakes = data.features
      .filter(f => f.properties.mag >= 2.5)
      .sort((a, b) => b.properties.time - a.properties.time)
      .slice(0, 200)
      .map(f => ({
        id: f.id,
        magnitude: f.properties.mag,
        place: f.properties.place,
        time: f.properties.time,
        coordinates: f.geometry.coordinates,
        depth: f.geometry.coordinates[2],
        significance: f.properties.sig,
        alert: f.properties.alert,
        tsunami: f.properties.tsunami,
        felt: f.properties.felt || 0
      }));

    return {
      type: 'earthquakes',
      timestamp: new Date().toISOString(),
      count: earthquakes.length,
      features: earthquakes
    };
  }

  transformFireData(csvData) {
    if (!csvData || typeof csvData !== 'string') {
      return { type: 'fires', features: [], count: 0 };
    }

    const lines = csvData.split('\n').filter(line => line.trim());
    const fires = [];
    
    // Process up to 999 fires
    for (let i = 1; i < lines.length && fires.length < 999; i++) {
      const values = lines[i].split(',');
      if (values.length >= 13) {
        fires.push({
          id: `fire_${i}`,
          latitude: parseFloat(values[0]),
          longitude: parseFloat(values[1]),
          brightness: parseFloat(values[2]),
          date: values[5],
          time: values[6],
          confidence: values[9],
          frp: parseFloat(values[12]) || 0,
          coordinates: [parseFloat(values[1]), parseFloat(values[0])]
        });
      }
    }
    
    return {
      type: 'fires',
      timestamp: new Date().toISOString(),
      count: fires.length,
      features: fires
    };
  }

  transformWeatherData(data) {
    if (!data?.features) return { type: 'weather', features: [], count: 0 };
    
    const weather = data.features.slice(0, 500).map(alert => ({
      id: alert.id,
      severity: alert.properties.severity,
      urgency: alert.properties.urgency,
      event: alert.properties.event,
      headline: alert.properties.headline,
      areas: alert.properties.areaDesc,
      coordinates: alert.geometry?.coordinates?.[0]?.[0] || [0, 0]
    }));

    return {
      type: 'weather',
      timestamp: new Date().toISOString(),
      count: weather.length,
      features: weather
    };
  }

  transformVolcanoData(data) {
    if (!data?.features) return { type: 'volcanoes', features: [], count: 0 };
    
    const volcanoes = data.features
      .filter(f => f.properties?.eventtype === 'VO')
      .slice(0, 50)
      .map(f => ({
        id: f.properties.eventid,
        name: f.properties.eventname || 'Unknown Volcano',
        coordinates: f.geometry.coordinates,
        alertLevel: f.properties.alertlevel,
        country: f.properties.country || '',
        population: parseInt(f.properties.population || 0),
        vei: parseInt(f.properties.severity_value || 0),
        lastUpdate: f.properties.lastupdate || new Date().toISOString()
      }));

    return {
      type: 'volcanoes',
      timestamp: new Date().toISOString(),
      count: volcanoes.length,
      features: volcanoes
    };
  }

  transformCycloneData(data) {
    if (!data?.features) return { type: 'cyclones', features: [], count: 0 };
    
    const cyclones = data.features
      .filter(f => f.properties?.eventtype === 'TC')
      .slice(0, 50)
      .map(f => ({
        id: f.properties.eventid,
        name: f.properties.eventname || 'Tropical Cyclone',
        coordinates: f.geometry.coordinates,
        alertLevel: f.properties.alertlevel,
        category: f.properties.tc_category || 'Unknown',
        windSpeed: parseInt(f.properties.windspeed || 0),
        country: f.properties.country || '',
        population: parseInt(f.properties.population || 0),
        lastUpdate: f.properties.lastupdate || new Date().toISOString()
      }));

    return {
      type: 'cyclones',
      timestamp: new Date().toISOString(),
      count: cyclones.length,
      features: cyclones
    };
  }

  transformFloodData(data) {
    if (!data?.features) return { type: 'floods', features: [], count: 0 };
    
    const floods = data.features
      .filter(f => f.properties?.eventtype === 'FL')
      .slice(0, 50)
      .map(f => ({
        id: f.properties.eventid,
        name: f.properties.eventname || 'Flood Event',
        coordinates: f.geometry.coordinates,
        alertLevel: f.properties.alertlevel,
        country: f.properties.country || '',
        population: parseInt(f.properties.population || 0),
        affectedArea: parseInt(f.properties.affectedarea || 0),
        severity: f.properties.severity || 'Unknown',
        lastUpdate: f.properties.lastupdate || new Date().toISOString()
      }));

    return {
      type: 'floods',
      timestamp: new Date().toISOString(),
      count: floods.length,
      features: floods
    };
  }

  async startScheduledFetching() {
    console.log('🚀 Starting enhanced data collection...\n');
    
    // Initial fetch all sources
    for (const source of Object.keys(this.dataSources)) {
      await this.fetchData(source);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit
    }
    
    // Schedule regular updates
    Object.entries(this.dataSources).forEach(([source, config]) => {
      cron.schedule(config.interval, () => this.fetchData(source));
      console.log(`⏰ Scheduled ${source}: ${config.interval}`);
    });
  }
}

// Initialize aggregator
const aggregator = new EnhancedDataAggregator();

// API Routes
app.get('/api/data/:type', async (req, res) => {
  const cached = await redis.get(`data:${req.params.type}`);
  res.json(cached ? JSON.parse(cached) : { features: [], count: 0 });
});

app.get('/api/aggregate', async (req, res) => {
  const types = ['earthquakes', 'fires', 'weather', 'volcanoes', 'cyclones', 'floods'];
  const results = {};
  
  for (const type of types) {
    const cached = await redis.get(`data:${type}`);
    results[type] = cached ? JSON.parse(cached) : { type, features: [], count: 0 };
  }
  
  res.json(results);
});

app.get('/api/stats', async (req, res) => {
  const types = ['earthquakes', 'fires', 'weather', 'volcanoes', 'cyclones', 'floods'];
  const stats = {};
  
  for (const type of types) {
    const cached = await redis.get(`data:${type}`);
    const data = cached ? JSON.parse(cached) : null;
    stats[type] = {
      count: data?.count || 0,
      lastUpdate: data?.timestamp || 'Never',
      hasData: !!data?.features?.length
    };
  }
  
  res.json(stats);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    version: '2.0-enhanced',
    timestamp: new Date().toISOString()
  });
});

// WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe', async (types) => {
    for (const type of types) {
      const cached = await redis.get(`data:${type}`);
      if (cached) socket.emit(`update:${type}`, JSON.parse(cached));
    }
  });
  
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🌍 RealNow Enhanced Server running on port ${PORT}`);
  aggregator.startScheduledFetching();
});

process.on('SIGTERM', () => {
  server.close(() => {
    redis.quit();
    process.exit(0);
  });
});
