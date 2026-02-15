// COMPLETE PRODUCTION SERVER.JS - v2.5 WITH FLOOD STALENESS CLEANUP
// Fixes: GDACS flood staleness, NASA closed-event window, ReliefWeb age filter,
//        merge staleness gate, always-run merge, computeEventStatus for floods

const express = require('express');
const cors = require('cors');
const Redis = require('redis');
const { Server } = require('socket.io');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Redis setup
const redis = Redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379
  }
});

redis.on('error', err => console.log('Redis Client Error', err));
redis.connect();

app.use(cors());
app.use(express.json());

// =====================================
// COMPREHENSIVE DISASTER DATA AGGREGATOR
// =====================================
class DisasterDataAggregator {
  constructor() {
    this.processedEvents = new Map();
    this.lastFetchTime = {};
    
    this.dataSources = {
      // 1. EARTHQUAKES - USGS (Most reliable source)
      earthquakes: {
        url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
        interval: '*/5 * * * *',
        transform: this.transformUSGSEarthquakes.bind(this),
        priority: 1
      },

      // 2. FIRES - NASA FIRMS (Active fire data)
      fires: {
        url: () => {
          const key = process.env.FIRMS_MAP_KEY || '1ab1f40c11fa5a952619c58594702b1f';
          return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/world/3`;
        },
        interval: '*/10 * * * *',
        transform: this.transformNASAFires.bind(this),
        priority: 2
      },

      // 3. WEATHER ALERTS - NOAA
      weather: {
        url: 'https://api.weather.gov/alerts/active',
        interval: '*/5 * * * *',
        transform: this.transformNOAAWeather.bind(this),
        priority: 3
      },

      // 4. VOLCANOES - NASA EONET
      volcanoes_eonet: {
        url: 'https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open&limit=100',
        interval: '*/15 * * * *',
        transform: this.transformEONETVolcanoes.bind(this),
        priority: 4
      },

      // 5. FLOODS - NASA EONET (PRIMARY)
      // FIX: Added &status=open so we only fetch active floods
      floods_nasa: {
        url: 'https://eonet.gsfc.nasa.gov/api/v3/events?category=floods&status=open&limit=100',
        interval: '*/10 * * * *',
        transform: this.transformNASAFloods.bind(this),
        priority: 5
      },

      // 6. FLOODS - RELIEFWEB (HUMANITARIAN)
      floods_reliefweb: {
        url: 'https://api.reliefweb.int/v1/disasters?appname=realnow&preset=latest&limit=100&profile=list',
        interval: '*/15 * * * *',
        transform: this.transformReliefWebFloods.bind(this),
        priority: 6
      },

      // 7. GDACS COMBINED - Due to API bug, we fetch all and filter manually
      gdacs_combined: {
        url: 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH',
        interval: '*/15 * * * *',
        transform: this.transformGDACSSplitData.bind(this),
        priority: 7
      },

      // 8. SPACE WEATHER - NOAA SWPC
      spaceweather: {
        url: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
        interval: '*/30 * * * *',
        transform: this.transformSpaceWeather.bind(this),
        priority: 8
      }
    };
  }

  // ===================
  // GDACS SPLIT TRANSFORM - FIXED FOR DATA MIXING BUG
  // ===================
  async transformGDACSSplitData(data) {
    console.log('📊 Processing GDACS combined data...');
    
    if (!data?.features) {
      console.log('No GDACS data received');
      return null;
    }

    console.log(`Total GDACS events received: ${data.features.length}`);
    
    // Count event types for logging
    const typeCounts = {};
    data.features.forEach(f => {
      const type = f.properties?.eventtype;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    console.log('🐛 GDACS BUG - Mixed event types in response:', typeCounts);
    
    // IMPORTANT: Due to GDACS bug, we must filter ALL data properly
    // Split into separate arrays by ACTUAL event type
    const earthquakes = data.features.filter(f => f.properties?.eventtype === 'EQ');
    const cyclones = data.features.filter(f => f.properties?.eventtype === 'TC');
    const floods = data.features.filter(f => f.properties?.eventtype === 'FL');
    const wildfires = data.features.filter(f => f.properties?.eventtype === 'WF');
    const droughts = data.features.filter(f => f.properties?.eventtype === 'DR');
    const volcanoes = data.features.filter(f => f.properties?.eventtype === 'VO');
    
    console.log(`✅ Filtered counts - TC: ${cyclones.length}, FL: ${floods.length}, WF: ${wildfires.length}, DR: ${droughts.length}`);
    
    // Transform each type with the FILTERED data
    const transformedCyclones = this.transformGDACSCyclones({ features: cyclones });
    const transformedFloods = this.transformGDACSFloods({ features: floods });
    const transformedWildfires = this.transformGDACSWildfires({ features: wildfires });
    const transformedDroughts = this.transformGDACSDroughts({ features: droughts });
    
    // Store each type
    if (transformedCyclones?.features?.length > 0) {
      await this.storeInRedis('cyclones', transformedCyclones);
    } else {
      await this.storeInRedis('cyclones', {
        type: 'cyclones',
        timestamp: new Date().toISOString(),
        count: 0,
        features: [],
        note: 'No active tropical cyclones currently'
      });
    }
    
    if (transformedFloods?.features?.length > 0) {
      await this.storeInRedis('floods_gdacs', transformedFloods);
    }
    
    if (transformedWildfires?.features?.length > 0) {
      await this.storeInRedis('wildfires', transformedWildfires);
    }
    
    if (transformedDroughts?.features?.length > 0) {
      await this.storeInRedis('droughts', transformedDroughts);
    }

    // FIX: ALWAYS merge flood data to clean up stale entries,
    // even if GDACS returned 0 floods this cycle
    await this.mergeFloodData();

    return { 
      processed: true, 
      counts: typeCounts,
      filtered: {
        cyclones: cyclones.length,
        floods: floods.length,
        wildfires: wildfires.length,
        droughts: droughts.length
      }
    };
  }

  // ===================
  // TRANSFORM FUNCTIONS
  // ===================

  // Transform USGS Earthquake Data
  transformUSGSEarthquakes(data) {
    if (!data?.features) {
      console.log('No earthquake data received');
      return null;
    }

    const earthquakes = data.features
      .filter(f => {
        return f.properties.mag >= 2.5 && 
               f.geometry?.coordinates?.length >= 2;
      })
      .map(f => ({
        id: f.id,
        type: 'earthquake',
        magnitude: f.properties.mag,
        place: f.properties.place,
        time: f.properties.time,
        updated: f.properties.updated,
        coordinates: f.geometry.coordinates,
        depth: f.geometry.coordinates[2],
        felt: f.properties.felt || 0,
        cdi: f.properties.cdi || 0,
        mmi: f.properties.mmi || 0,
        alert: f.properties.alert,
        status: f.properties.status,
        tsunami: f.properties.tsunami || 0,
        significance: f.properties.sig,
        source: 'USGS',
        url: f.properties.url
      }))
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 500);

    console.log(`✅ Processed ${earthquakes.length} earthquakes from USGS`);
    
    return {
      type: 'earthquakes',
      timestamp: new Date().toISOString(),
      count: earthquakes.length,
      features: earthquakes
    };
  }

  // Transform NASA FIRMS Fire Data
  transformNASAFires(csvData) {
    console.log('🔥 Processing NASA FIRMS fires...');
    
    if (!csvData || typeof csvData !== 'string') {
      console.log('❌ No fire CSV data received');
      return null;
    }

    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length <= 1) {
      console.log('❌ No fire data lines found');
      return null;
    }

    console.log(`📊 NASA FIRMS: Processing ${lines.length - 1} total fires`);

    const allFires = [];
    const headers = lines[0].split(',');
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length >= 13) {
        const lat = parseFloat(values[0]);
        const lon = parseFloat(values[1]);
        const brightness = parseFloat(values[2]);
        const frp = parseFloat(values[12]) || 0;
        
        if (!isNaN(lat) && !isNaN(lon)) {
          let region = 'Other';
          if (lon > -170 && lon < -30) region = 'Americas';
          else if (lon > -25 && lon < 45 && lat > 35 && lat < 71) region = 'Europe';
          else if (lon > -20 && lon < 52 && lat > -35 && lat < 37) region = 'Africa';
          else if (lon > 45 && lon < 180 && lat > -10 && lat < 77) region = 'Asia';
          else if (lon > 110 && lon < 160 && lat > -50 && lat < -10) region = 'Australia';
          
          allFires.push({
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
            source: 'NASA_FIRMS',
            intensity: this.calculateFireIntensity(frp, brightness),
            region: region
          });
        }
      }
    }

    // Sample fires by region for better global coverage
    const byRegion = {};
    allFires.forEach(fire => {
      if (!byRegion[fire.region]) byRegion[fire.region] = [];
      byRegion[fire.region].push(fire);
    });

    const maxFires = 2000;
    const sampledFires = [];
    const totalFires = allFires.length;
    
    Object.entries(byRegion).forEach(([region, regionFires]) => {
      const proportion = regionFires.length / totalFires;
      const toTake = Math.ceil(proportion * maxFires);
      regionFires.sort((a, b) => (b.frp || 0) - (a.frp || 0));
      const selected = regionFires.slice(0, toTake);
      sampledFires.push(...selected);
    });

    sampledFires.sort((a, b) => (b.frp || 0) - (a.frp || 0));
    const finalFires = sampledFires.slice(0, maxFires);

    console.log(`✅ Processed ${finalFires.length} fires from NASA FIRMS (sampled from ${allFires.length} total)`);
    
    return {
      type: 'fires',
      timestamp: new Date().toISOString(),
      count: finalFires.length,
      features: finalFires,
      totalAvailable: allFires.length
    };
  }

  calculateFireIntensity(frp, brightness) {
    if (frp > 500) return 'extreme';
    if (frp > 200) return 'very_high';
    if (frp > 100) return 'high';
    if (frp > 50) return 'moderate';
    return 'low';
  }

  // Transform NOAA Weather Alerts
  transformNOAAWeather(data) {
    if (!data?.features) {
      console.log('No weather data received');
      return null;
    }

    const alerts = data.features
      .filter(alert => alert.properties && alert.geometry)
      .map(alert => {
        let coordinates = [0, 0];
        if (alert.geometry?.coordinates?.length > 0) {
          if (alert.geometry.type === 'Polygon' && alert.geometry.coordinates[0]?.length > 0) {
            coordinates = alert.geometry.coordinates[0][0];
          } else if (alert.geometry.type === 'Point') {
            coordinates = alert.geometry.coordinates;
          }
        }

        return {
          id: alert.id,
          type: 'weather',
          severity: alert.properties.severity,
          urgency: alert.properties.urgency,
          event: alert.properties.event,
          headline: alert.properties.headline,
          description: alert.properties.description?.substring(0, 500),
          instruction: alert.properties.instruction?.substring(0, 500),
          areas: alert.properties.areaDesc,
          coordinates: coordinates,
          onset: alert.properties.onset,
          expires: alert.properties.expires,
          source: 'NOAA',
          category: this.categorizeWeatherEvent(alert.properties.event)
        };
      })
      .slice(0, 500);

    console.log(`✅ Processed ${alerts.length} weather alerts from NOAA`);
    
    return {
      type: 'weather',
      timestamp: new Date().toISOString(),
      count: alerts.length,
      features: alerts
    };
  }

  categorizeWeatherEvent(event) {
    const eventLower = (event || '').toLowerCase();
    if (eventLower.includes('tornado')) return 'tornado';
    if (eventLower.includes('hurricane') || eventLower.includes('typhoon')) return 'hurricane';
    if (eventLower.includes('flood')) return 'flood';
    if (eventLower.includes('fire')) return 'wildfire';
    if (eventLower.includes('earthquake')) return 'earthquake';
    if (eventLower.includes('tsunami')) return 'tsunami';
    if (eventLower.includes('volcano')) return 'volcano';
    if (eventLower.includes('storm')) return 'storm';
    if (eventLower.includes('blizzard') || eventLower.includes('snow')) return 'winter';
    if (eventLower.includes('heat')) return 'heat';
    return 'other';
  }

  // Transform EONET Volcano Data
  transformEONETVolcanoes(data) {
    if (!data?.events) {
      console.log('No EONET volcano data received');
      return null;
    }

    const volcanoes = data.events.map(event => {
      const latestGeometry = event.geometry?.[0] || {};
      const coords = latestGeometry.coordinates || [0, 0];
      
      return {
        id: `eonet_${event.id}`,
        type: 'volcano',
        name: event.title,
        coordinates: coords,
        latitude: coords[1],
        longitude: coords[0],
        status: event.closed ? 'closed' : 'active',
        category: event.categories?.[0]?.title || 'Volcano',
        date: latestGeometry.date || new Date().toISOString(),
        sources: event.sources?.map(s => ({
          id: s.id,
          url: s.url
        })) || [],
        alertLevel: 'monitoring',
        source: 'NASA_EONET'
      };
    });

    console.log(`✅ Processed ${volcanoes.length} volcanoes from NASA EONET`);
    
    return {
      type: 'volcanoes',
      timestamp: new Date().toISOString(),
      count: volcanoes.length,
      features: volcanoes
    };
  }

  // =====================================================================
  // Transform NASA EONET Flood Data
  // FIX: Tightened closed-event window from 7 → 3 days, added isActive/freshness
  // =====================================================================
  transformNASAFloods(data) {
    console.log('🌊 Processing NASA EONET floods...');
    
    if (!data?.events) {
      console.log('No NASA flood data received');
      return null;
    }

    const now = new Date();

    const floods = data.events
      .filter(event => {
        // Only keep open events, or events closed within last 3 days
        if (!event.closed) return true;
        const closedDate = new Date(event.closed);
        const daysSinceClosed = (now - closedDate) / (1000 * 60 * 60 * 24);
        if (daysSinceClosed > 3) {
          console.log(`  ⏭️ Filtering out closed NASA flood: "${event.title}" (closed ${Math.floor(daysSinceClosed)} days ago)`);
          return false;
        }
        return true;
      })
      .map(event => {
        const latestGeometry = event.geometry?.[0] || {};
        const coords = latestGeometry.coordinates || [0, 0];
        
        const titleParts = event.title.split(',');
        const country = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : 'Unknown';

        const isClosed = !!event.closed;
        const eventDate = latestGeometry.date ? new Date(latestGeometry.date) : null;
        const daysSinceStart = eventDate ? Math.floor((now - eventDate) / (1000 * 60 * 60 * 24)) : null;
        
        return {
          id: `nasa_fl_${event.id}`,
          type: 'flood',
          name: event.title,
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          alertLevel: isClosed ? 'Green' : 'Orange',
          severity: isClosed ? 'Recovering' : 'Active',
          status: isClosed ? 'closed' : 'active',
          isActive: !isClosed,
          freshness: isClosed ? 'aging' : 'current',
          date: latestGeometry.date || now.toISOString(),
          fromDate: latestGeometry.date,
          toDate: event.closed || now.toISOString(),
          daysSinceStart,
          country: country,
          sources: event.sources?.map(s => ({
            id: s.id,
            url: s.url
          })) || [],
          source: 'NASA_EONET',
          description: `${isClosed ? 'Recent' : 'Active'} flood event: ${event.title}`
        };
      });

    console.log(`✅ Processed ${floods.length} floods from NASA EONET`);
    
    return {
      type: 'floods_nasa',
      timestamp: new Date().toISOString(),
      count: floods.length,
      features: floods
    };
  }

  // =====================================================================
  // Transform ReliefWeb Flood Data
  // FIX: Added 30-day max age filter — skips ancient disasters
  // =====================================================================
  transformReliefWebFloods(data) {
    console.log('🌊 Processing ReliefWeb humanitarian disasters...');
    
    if (!data?.data) {
      console.log('No ReliefWeb data received');
      return null;
    }

    const now = new Date();
    const MAX_AGE_DAYS = 30; // Only show disasters from last 30 days

    const floodDisasters = data.data.filter(disaster => {
      const name = disaster.fields?.name || '';
      if (!name.toLowerCase().includes('flood')) return false;

      // Check age — skip disasters older than MAX_AGE_DAYS
      const eventDate = disaster.fields?.date?.created || 
                        disaster.fields?.date?.changed;
      if (eventDate) {
        const daysSince = (now - new Date(eventDate)) / (1000 * 60 * 60 * 24);
        if (daysSince > MAX_AGE_DAYS) {
          console.log(`  ⏭️ Filtering out old ReliefWeb flood: "${name}" (${Math.floor(daysSince)} days old)`);
          return false;
        }
      }

      return true;
    });

    console.log(`Found ${floodDisasters.length} recent flood disasters from ${data.data.length} total disasters`);

    const floods = floodDisasters.map(disaster => {
      const name = disaster.fields?.name || 'Flood Event';
      const nameParts = name.split(':');
      const country = nameParts.length > 1 ? nameParts[0].trim() : 'Unknown';
      const floodName = nameParts.length > 1 ? nameParts[1].trim() : name;
      
      const coords = this.getApproximateCoordinates(country);
      
      const eventDate = disaster.fields?.date?.created || 
                        disaster.fields?.date?.changed || 
                        now.toISOString();
      
      const daysSinceStart = Math.floor((now - new Date(eventDate)) / (1000 * 60 * 60 * 24));
      
      let alertLevel = 'Orange';
      let severity = 'Moderate';
      
      if (name.toLowerCase().includes('severe') || 
          name.toLowerCase().includes('major') ||
          name.toLowerCase().includes('emergency')) {
        alertLevel = 'Red';
        severity = 'Severe';
      }
      
      return {
        id: `reliefweb_fl_${disaster.id}`,
        type: 'flood',
        name: floodName,
        coordinates: coords,
        latitude: coords[1],
        longitude: coords[0],
        alertLevel: alertLevel,
        severity: severity,
        status: 'ongoing',
        isActive: true,
        freshness: daysSinceStart <= 3 ? 'current' : daysSinceStart <= 7 ? 'recent' : 'aging',
        date: eventDate,
        fromDate: eventDate,
        toDate: now.toISOString(),
        daysSinceStart,
        country: country,
        source: 'ReliefWeb',
        url: disaster.href || `https://reliefweb.int/node/${disaster.id}`,
        description: `Humanitarian flood disaster: ${floodName} in ${country}`
      };
    });

    console.log(`✅ Processed ${floods.length} floods from ReliefWeb`);
    
    return {
      type: 'floods_reliefweb',
      timestamp: new Date().toISOString(),
      count: floods.length,
      features: floods
    };
  }

  // =====================================================================
  // Transform GDACS Flood Data
  // FIX: Now uses computeEventStatus() + filters ended >7 days (mirrors wildfires)
  // =====================================================================
  transformGDACSFloods(data) {
    console.log('🌊 Processing GDACS floods...');
    
    if (!data?.features) {
      console.log('No GDACS flood data received');
      return null;
    }

    const now = new Date();

    const floods = data.features
      .filter(f => f.properties && f.geometry?.coordinates)
      .map(f => {
        const props = f.properties;
        const coords = f.geometry.coordinates;
        
        // Compute active/ended status (same pattern as wildfires)
        const eventStatus = this.computeEventStatus(props);
        
        return {
          id: `gdacs_fl_${props.eventid || Math.random()}`,
          type: 'flood',
          name: props.eventname || props.name || 'Flood',
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          alertLevel: props.alertlevel || 'Green',
          alertScore: parseInt(props.alertscore || 0),
          severity: props.severitydata?.severity || props.severity || 'Unknown',
          affectedArea: parseInt(props.affectedarea || 0),
          country: props.country || '',
          population: parseInt(props.population || 0),
          fromDate: props.fromdate,
          toDate: props.todate,
          duration: parseInt(props.duration || 0),
          source: 'GDACS',
          mainEvent: props.iscurrent === 'true',
          // Validation fields (same as wildfires)
          isActive: eventStatus.isActive,
          status: eventStatus.status,
          freshness: eventStatus.freshness,
          daysSinceStart: eventStatus.daysSinceStart,
          daysSinceEnd: eventStatus.daysSinceEnd,
          lastUpdate: props.lastupdate || props.modified || now.toISOString(),
          isCurrent: props.iscurrent === 'true' || props.iscurrent === true
        };
      })
      // FILTER: Only active OR recently ended (≤7 days)
      .filter(fl => {
        if (fl.isActive) return true;
        if (fl.status === 'just_ended') return true;
        if (fl.daysSinceEnd !== null && fl.daysSinceEnd <= 7) return true;
        console.log(`  ⏭️ Filtering out ended GDACS flood: "${fl.name}" (ended ${fl.daysSinceEnd} days ago)`);
        return false;
      })
      // SORT: Active first, then by alert severity
      .sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        const levelOrder = { 'Red': 0, 'Orange': 1, 'Yellow': 2, 'Green': 3 };
        return (levelOrder[a.alertLevel] || 4) - (levelOrder[b.alertLevel] || 4);
      });

    const activeCount = floods.filter(f => f.isActive).length;
    const endedCount = floods.filter(f => !f.isActive).length;

    console.log(`✅ Processed ${floods.length} active/recent floods from GDACS (${activeCount} active, ${endedCount} recently ended)`);
    
    return {
      type: 'floods_gdacs',
      timestamp: new Date().toISOString(),
      count: floods.length,
      activeCount,
      features: floods
    };
  }

  computeEventStatus(props) {
    const now = new Date();
    const fromDate = props.fromdate ? new Date(props.fromdate) : null;
    const toDate = props.todate ? new Date(props.todate) : null;
    const isCurrent = props.iscurrent === 'true' || props.iscurrent === true;

    let isActive = true;
    let status = 'active';
    let daysSinceStart = null;
    let daysSinceEnd = null;
    let freshness = 'current';

    if (fromDate) {
      daysSinceStart = Math.floor((now - fromDate) / (1000 * 60 * 60 * 24));
    }

    if (toDate) {
      if (toDate.getTime() < now.getTime()) {
        daysSinceEnd = Math.floor((now - toDate) / (1000 * 60 * 60 * 24));
        isActive = false;
        status = daysSinceEnd <= 1 ? 'just_ended' : 'ended';
      }
    }

    // If GDACS says it's current, trust that
    if (isCurrent) {
      isActive = true;
      status = 'active';
    }

    // Compute freshness based on last update
    const lastUpdate = props.lastupdate || props.modified || null;
    if (lastUpdate) {
      const hoursSinceUpdate = (now - new Date(lastUpdate)) / (1000 * 60 * 60);
      if (hoursSinceUpdate <= 6) freshness = 'current';
      else if (hoursSinceUpdate <= 24) freshness = 'recent';
      else if (hoursSinceUpdate <= 72) freshness = 'aging';
      else freshness = 'stale';
    }

    return { isActive, status, daysSinceStart, daysSinceEnd, freshness };
  }

  // Transform GDACS Wildfire Data (with proper filtering)
  transformGDACSWildfires(data) {
    console.log('🔥 Processing GDACS wildfires...');
    
    if (!data?.features) {
      console.log('No GDACS wildfire data received');
      return null;
    }

    const now = new Date();

    const wildfires = data.features
      .filter(f => f.properties && f.geometry?.coordinates)
      .map(f => {
        const props = f.properties;
        const coords = f.geometry.coordinates;
        
        const eventStatus = this.computeEventStatus(props);
        
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
          description: props.description || props.eventname || '',
          url: props.url || '',
          episodeId: props.episodeid || '',
          isActive: eventStatus.isActive,
          status: eventStatus.status,
          freshness: eventStatus.freshness,
          daysSinceStart: eventStatus.daysSinceStart,
          daysSinceEnd: eventStatus.daysSinceEnd,
          lastUpdate: props.lastupdate || props.modified || now.toISOString(),
          isCurrent: props.iscurrent === 'true' || props.iscurrent === true
        };
      })
      .filter(wf => {
        if (wf.isActive) return true;
        if (wf.status === 'just_ended') return true;
        if (wf.daysSinceEnd !== null && wf.daysSinceEnd <= 3) return true;
        console.log(`  ⏭️ Filtering out ended wildfire: "${wf.name}" (ended ${wf.daysSinceEnd} days ago)`);
        return false;
      })
      .sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        const alertOrder = { 'Red': 3, 'Orange': 2, 'Green': 1 };
        const diff = (alertOrder[b.alertLevel] || 0) - (alertOrder[a.alertLevel] || 0);
        if (diff !== 0) return diff;
        return new Date(b.fromDate || 0) - new Date(a.fromDate || 0);
      });

    const activeCount = wildfires.filter(w => w.isActive).length;
    const endedCount = wildfires.filter(w => !w.isActive).length;
    
    console.log(`✅ Processed ${wildfires.length} wildfires (${activeCount} active, ${endedCount} recently ended)`);
    
    return {
      type: 'wildfires',
      timestamp: new Date().toISOString(),
      count: wildfires.length,
      activeCount,
      features: wildfires
    };
  }

  // Transform GDACS Cyclone Data
  transformGDACSCyclones(data) {
    console.log('🌀 Processing GDACS cyclones/hurricanes/typhoons...');
    
    if (!data?.features) {
      console.log('No cyclone features to process');
      return null;
    }
    
    console.log(`Processing ${data.features.length} potential cyclone features`);
    
    const cyclones = data.features
      .filter(f => f.properties && f.geometry?.coordinates)
      .map(f => {
        const props = f.properties;
        const coords = f.geometry.coordinates;
        
        let windSpeed = 0;
        if (props.windspeed !== undefined && props.windspeed !== null) {
          windSpeed = parseInt(props.windspeed) || parseFloat(props.windspeed) || 0;
        }
        
        const eventName = props.eventname || props.name || `Tropical System ${props.eventid}`;
        let stormType = 'Tropical Depression';
        
        const nameLower = eventName.toLowerCase();
        if (nameLower.includes('hurricane')) stormType = 'Hurricane';
        else if (nameLower.includes('typhoon')) stormType = 'Typhoon';
        else if (nameLower.includes('cyclone')) stormType = 'Cyclone';
        else if (nameLower.includes('storm')) stormType = 'Tropical Storm';
        else if (windSpeed > 0) {
          if (windSpeed >= 119) stormType = 'Hurricane/Typhoon';
          else if (windSpeed >= 63) stormType = 'Tropical Storm';
        }
        
        return {
          id: `gdacs_tc_${props.eventid || Math.random()}`,
          type: 'cyclone',
          name: eventName,
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          alertLevel: props.alertlevel || 'Yellow',
          alertScore: parseInt(props.alertscore || 0),
          category: props.tc_category || this.getCycloneCategory(windSpeed),
          windSpeed: windSpeed,
          pressure: parseInt(props.pressure || 0) || 1000,
          direction: props.direction || 0,
          speed: props.speed || 0,
          country: props.country || this.extractCountryName(props.affectedcountries?.[0]) || 'Ocean',
          affectedCountries: this.normalizeAffectedCountries(props.affectedcountries, props.country),
          population: parseInt(props.population || 0),
          fromDate: props.fromdate,
          toDate: props.todate,
          source: 'GDACS',
          stormType: stormType,
          isActive: !props.todate || new Date(props.todate) > new Date(),
          severity: props.severitydata?.severity || props.severity || windSpeed,
          description: props.description || `${stormType} with winds ${windSpeed} km/h`
        };
      });

    console.log(`✅ Processed ${cyclones.length} cyclones/hurricanes/typhoons from GDACS`);
    
    if (cyclones.length > 0) {
      console.log('Sample cyclones:', cyclones.slice(0, 3).map(c => ({
        name: c.name,
        windSpeed: c.windSpeed,
        stormType: c.stormType
      })));
    }
    
    return {
      type: 'cyclones',
      timestamp: new Date().toISOString(),
      count: cyclones.length,
      features: cyclones
    };
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

  // Extract a country name from a GDACS country entry (could be string or object)
  extractCountryName(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
      return entry.countryname || entry.country_name || entry.name || entry.iso3 || null;
    }
    return null;
  }

  // Normalize GDACS affectedcountries array (may contain objects or strings) into plain string array
  normalizeAffectedCountries(affectedcountries, fallbackCountry) {
    if (!affectedcountries) {
      return fallbackCountry ? [fallbackCountry] : [];
    }
    // If it's already a string (comma-separated), split it
    if (typeof affectedcountries === 'string') {
      return affectedcountries.split(',').map(s => s.trim()).filter(Boolean);
    }
    // If it's an array, extract names from each entry
    if (Array.isArray(affectedcountries)) {
      const names = affectedcountries
        .map(entry => this.extractCountryName(entry))
        .filter(Boolean);
      return names.length > 0 ? names : (fallbackCountry ? [fallbackCountry] : []);
    }
    return fallbackCountry ? [fallbackCountry] : [];
  }

  // Transform GDACS Drought Data (with proper filtering)
  transformGDACSDroughts(data) {
    console.log('🏜️ Processing GDACS droughts...');
    
    if (!data?.features) {
      console.log('No GDACS drought data received');
      return null;
    }

    const droughts = data.features
      .filter(f => f.properties && f.geometry?.coordinates)
      .map(f => {
        const props = f.properties;
        const coords = f.geometry.coordinates;
        
        return {
          id: `gdacs_dr_${props.eventid || Math.random()}`,
          type: 'drought',
          name: props.eventname || props.name || 'Drought',
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          alertLevel: props.alertlevel || 'Green',
          alertScore: parseInt(props.alertscore || 0),
          affectedArea: parseInt(props.affectedarea || 0),
          severity: props.severitydata?.severity || props.severity || 'Unknown',
          country: props.country || '',
          population: parseInt(props.population || 0),
          fromDate: props.fromdate,
          toDate: props.todate,
          duration: parseInt(props.duration || 0),
          source: 'GDACS'
        };
      });

    console.log(`✅ Processed ${droughts.length} droughts from GDACS`);
    
    return {
      type: 'droughts',
      timestamp: new Date().toISOString(),
      count: droughts.length,
      features: droughts
    };
  }

  // Transform Space Weather Data
  transformSpaceWeather(data) {
    if (!Array.isArray(data) || data.length < 2) {
      console.log('No space weather data received');
      return null;
    }

    const readings = data.slice(1).map(reading => ({
      time: reading[0],
      kpIndex: parseFloat(reading[1]),
      estimated: reading[2] === '1'
    }));

    const latest = readings[readings.length - 1];
    if (!latest) return null;

    const kp = latest.kpIndex || 0;
    
    console.log(`✅ Space Weather: Kp index ${kp}`);
    
    return {
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

  // Helper function to get approximate coordinates for countries
  getApproximateCoordinates(country) {
    const countryCoords = {
      'Bangladesh': [90.356, 23.685],
      'India': [78.962, 20.594],
      'Pakistan': [69.345, 30.375],
      'Philippines': [121.774, 12.880],
      'Indonesia': [113.921, -0.789],
      'Thailand': [100.993, 15.870],
      'Vietnam': [108.277, 14.058],
      'China': [104.195, 35.861],
      'Myanmar': [95.956, 21.914],
      'Brazil': [-51.925, -14.235],
      'Colombia': [-74.297, 4.571],
      'Peru': [-75.015, -9.190],
      'Mexico': [-102.553, 23.635],
      'United States': [-95.712, 37.090],
      'Nigeria': [8.676, 9.082],
      'Kenya': [37.906, -0.023],
      'Somalia': [46.200, 5.152],
      'Sudan': [30.217, 12.863],
      'South Sudan': [31.307, 6.877],
      'Ethiopia': [40.490, 9.145],
      'Mozambique': [35.530, -18.666],
      'South Africa': [22.937, -30.560],
      'Australia': [133.775, -25.274],
      'Honduras': [-86.241, 15.200],
      'Guatemala': [-90.231, 15.784],
      'Nicaragua': [-85.207, 12.865],
      'El Salvador': [-88.897, 13.794],
      'Venezuela': [-66.590, 6.423],
      'Germany': [10.452, 51.166],
      'Japan': [138.253, 36.204]
    };
    
    for (const [countryName, coords] of Object.entries(countryCoords)) {
      if (country.includes(countryName) || countryName.includes(country)) {
        return coords;
      }
    }
    
    return [0, 0];
  }

  // =====================================================================
  // Merge flood data from multiple sources
  // FIX: Added staleness gate — hard 14-day ceiling + 90-day sanity check
  // =====================================================================
  async mergeFloodData() {
    try {
      const [nasaData, reliefwebData, gdacsData] = await Promise.all([
        redis.get('data:floods_nasa'),
        redis.get('data:floods_reliefweb'),
        redis.get('data:floods_gdacs')
      ]);

      const nasa = nasaData ? JSON.parse(nasaData) : { features: [] };
      const reliefweb = reliefwebData ? JSON.parse(reliefwebData) : { features: [] };
      const gdacs = gdacsData ? JSON.parse(gdacsData) : { features: [] };

      const now = new Date();
      const MAX_STALE_DAYS = 14; // Hard ceiling: nothing older than 14 days past its end date

      const allFloods = [
        ...(nasa.features || []),
        ...(reliefweb.features || []),
        ...(gdacs.features || [])
      ];

      // STEP 1: Staleness gate
      const freshFloods = allFloods.filter(flood => {
        // If the flood has a toDate in the past, check how long ago
        if (flood.toDate) {
          const toDate = new Date(flood.toDate);
          if (toDate < now) {
            const daysSinceEnd = Math.floor((now - toDate) / (1000 * 60 * 60 * 24));
            if (daysSinceEnd > MAX_STALE_DAYS) {
              console.log(`  🧹 Removing stale flood from merge: "${flood.name}" (ended ${daysSinceEnd} days ago, source: ${flood.source})`);
              return false;
            }
          }
        }
        
        // If the flood has a fromDate but no toDate, check if it's absurdly old
        if (flood.fromDate && !flood.toDate) {
          const fromDate = new Date(flood.fromDate);
          const daysSinceStart = Math.floor((now - fromDate) / (1000 * 60 * 60 * 24));
          // A flood going on for over 90 days with no update is suspect
          if (daysSinceStart > 90 && flood.freshness === 'stale') {
            console.log(`  🧹 Removing suspiciously old flood: "${flood.name}" (started ${daysSinceStart} days ago, source: ${flood.source})`);
            return false;
          }
        }

        return true;
      });
      
      // STEP 2: Deduplicate
      const uniqueFloods = [];
      const seen = new Set();
      
      freshFloods.forEach(flood => {
        if (!flood.latitude || !flood.longitude || (flood.latitude === 0 && flood.longitude === 0)) {
          if (flood.source !== 'ReliefWeb') {
            return;
          }
        }
        
        const key = `${Math.round(flood.latitude * 2)}_${Math.round(flood.longitude * 2)}`;
        const nameKey = flood.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
        const uniqueKey = `${key}_${nameKey}`;
        
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          uniqueFloods.push(flood);
        }
      });

      // STEP 3: Sort — active first, then by severity
      uniqueFloods.sort((a, b) => {
        const aActive = a.isActive !== false;
        const bActive = b.isActive !== false;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        const levelOrder = { 'Red': 0, 'Orange': 1, 'Yellow': 2, 'Green': 3 };
        return (levelOrder[a.alertLevel] || 4) - (levelOrder[b.alertLevel] || 4);
      });

      const mergedData = {
        type: 'floods',
        timestamp: now.toISOString(),
        count: uniqueFloods.length,
        features: uniqueFloods,
        sources: {
          nasa: nasa.count || 0,
          reliefweb: reliefweb.count || 0,
          gdacs: gdacs.count || 0
        }
      };

      await this.storeInRedis('floods', mergedData);
      console.log(`🌊 Merged ${uniqueFloods.length} unique floods from all sources (filtered ${allFloods.length - freshFloods.length} stale)`);
      console.log(`   NASA: ${nasa.count || 0}, ReliefWeb: ${reliefweb.count || 0}, GDACS: ${gdacs.count || 0}`);
      
      return mergedData;
    } catch (error) {
      console.error('Error merging flood data:', error);
      return null;
    }
  }

  // ====================
  // HELPER FUNCTIONS
  // ====================

  async storeInRedis(type, data) {
    try {
      await redis.set(`data:${type}`, JSON.stringify(data), {
        EX: 600 // 10 minutes expiry
      });
      io.emit(`update:${type}`, data);
      console.log(`💾 Stored ${data.count} ${type} in Redis`);
    } catch (error) {
      console.error(`Error storing ${type} in Redis:`, error.message);
    }
  }

  async fetchData(source) {
    try {
      const config = this.dataSources[source];
      const url = typeof config.url === 'function' ? config.url() : config.url;
      
      console.log(`📡 Fetching ${source}...`);
      
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'RealNow-DisasterTracker/2.5',
          'Accept': 'application/json, text/csv, */*'
        }
      });

      const transformedData = config.transform(response.data);
      
      // Special handling for combined GDACS data
      if (source === 'gdacs_combined') {
        // Data is stored separately by transformGDACSSplitData
        return transformedData;
      }
      
      // Handle flood data merging
      if (source.startsWith('floods_')) {
        if (transformedData?.features?.length > 0) {
          await this.storeInRedis(source, transformedData);
        }
        await this.mergeFloodData();
      } else if (transformedData?.features?.length > 0) {
        await this.storeInRedis(transformedData.type || source, transformedData);
      }

      this.lastFetchTime[source] = new Date();
      return transformedData;
      
    } catch (error) {
      console.error(`❌ Error fetching ${source}:`, error.message);
      
      try {
        const cached = await redis.get(`data:${source}`);
        if (cached) {
          console.log(`   Using cached data for ${source}`);
          return JSON.parse(cached);
        }
      } catch (e) {
        console.error(`   No cached data for ${source}`);
      }
      
      return null;
    }
  }

  async startScheduledFetching() {
    console.log('🚀 Starting scheduled data fetching...\n');
    
    // Initial fetch for all sources
    for (const [source, config] of Object.entries(this.dataSources)) {
      await this.fetchData(source);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Schedule regular fetches
    Object.entries(this.dataSources).forEach(([source, config]) => {
      cron.schedule(config.interval, () => {
        this.fetchData(source);
      });
      console.log(`📅 Scheduled ${source}: ${config.interval}`);
    });
  }
}

// ====================
// API ROUTES
// ====================

const aggregator = new DisasterDataAggregator();

// Get specific disaster type
app.get('/api/data/:type', async (req, res) => {
  try {
    const cached = await redis.get(`data:${req.params.type}`);
    if (cached) {
      res.json(JSON.parse(cached));
    } else {
      res.status(404).json({ 
        error: 'Data not available', 
        type: req.params.type 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all disaster data
app.get('/api/aggregate', async (req, res) => {
  const types = [
    'earthquakes', 'fires', 'weather', 
    'volcanoes', 'cyclones', 'floods', 
    'droughts', 'wildfires', 'spaceweather'
  ];
  
  const results = {};
  
  for (const type of types) {
    try {
      const cached = await redis.get(`data:${type}`);
      results[type] = cached ? JSON.parse(cached) : { 
        type, 
        features: [], 
        count: 0, 
        timestamp: new Date().toISOString() 
      };
    } catch (e) {
      results[type] = { type, features: [], count: 0 };
    }
  }
  
  res.json(results);
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  const types = [
    'earthquakes', 'fires', 'weather', 
    'volcanoes', 'cyclones', 'floods', 
    'droughts', 'wildfires', 'spaceweather'
  ];
  
  const stats = {
    timestamp: new Date().toISOString(),
    lastFetch: aggregator.lastFetchTime,
    data: {}
  };
  
  for (const type of types) {
    try {
      const cached = await redis.get(`data:${type}`);
      const data = cached ? JSON.parse(cached) : null;
      stats.data[type] = {
        count: data?.count || 0,
        hasData: !!data?.features?.length,
        lastUpdate: data?.timestamp || 'Never',
        sources: data?.sources || null
      };
    } catch (e) {
      stats.data[type] = { count: 0, hasData: false };
    }
  }
  
  res.json(stats);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    version: '2.5',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Force refresh specific data type
app.post('/api/refresh/:type', async (req, res) => {
  const type = req.params.type;
  
  if (type === 'floods') {
    console.log('Manual flood refresh requested');
    await aggregator.fetchData('floods_nasa');
    await aggregator.fetchData('floods_reliefweb');
    await aggregator.fetchData('gdacs_combined');
    const result = await aggregator.mergeFloodData();
    res.json({ 
      success: true, 
      type: 'floods', 
      count: result?.count || 0,
      sources: result?.sources || {}
    });
  } else if (type === 'gdacs') {
    console.log('Manual GDACS refresh requested');
    await aggregator.fetchData('gdacs_combined');
    res.json({ success: true, type: 'gdacs', message: 'All GDACS data refreshed' });
  } else if (type === 'cyclones') {
    console.log('Manual cyclone refresh requested');
    await aggregator.fetchData('gdacs_combined');
    const cached = await redis.get('data:cyclones');
    const data = cached ? JSON.parse(cached) : { count: 0 };
    res.json({ 
      success: true, 
      type: 'cyclones', 
      count: data.count 
    });
  } else if (aggregator.dataSources[type]) {
    console.log(`Manual refresh requested for ${type}`);
    const result = await aggregator.fetchData(type);
    res.json({ 
      success: !!result, 
      type, 
      count: result?.count || 0 
    });
  } else {
    res.status(404).json({ error: 'Unknown data type' });
  }
});

// ====================
// WEBSOCKET HANDLING
// ====================

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  socket.on('subscribe', async (types) => {
    console.log(`   Client subscribing to: ${types.join(', ')}`);
    
    for (const type of types) {
      try {
        const cached = await redis.get(`data:${type}`);
        if (cached) {
          socket.emit(`update:${type}`, JSON.parse(cached));
        }
      } catch (e) {
        console.error(`Error sending ${type} to client:`, e.message);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ====================
// START SERVER
// ====================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════');
  console.log('🌍 REALNOW DISASTER TRACKER v2.5');
  console.log('═══════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔥 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🌊 Flood sources: NASA EONET + ReliefWeb + GDACS');
  console.log('🌊 Flood staleness: 3d NASA / 30d ReliefWeb / 7d GDACS / 14d merge ceiling');
  console.log('🌋 Volcano monitoring: NASA EONET');
  console.log('🌀 GDACS: Fixed filtering for mixed data bug');
  console.log('═══════════════════════════════════════\n');
  
  aggregator.startScheduledFetching();
});

// ====================
// GRACEFUL SHUTDOWN
// ====================

process.on('SIGTERM', async () => {
  console.log('\n📴 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    redis.quit();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n📴 SIGINT received, shutting down gracefully...');
  server.close(() => {
    redis.quit();
    process.exit(0);
  });
});