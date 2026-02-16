// COMPLETE PRODUCTION SERVER.JS - v5.0
// Based on v3.0 + v5 ENHANCEMENTS:
// - Circuit breaker for resilient data fetching
// - Rate limiting on all API routes
// - Geo-deduplication across data sources
// - Redis TTL safety net (2hr expiration)
// - User preferences API (anonymous UUID sessions)
// - Email/SMS digest service (daily/weekly)
// - Circuit status monitoring endpoint
// All existing v3.0 functionality preserved exactly

const express = require('express');
const cors = require('cors');
const Redis = require('redis');
const { Server } = require('socket.io');
const axios = require('axios');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
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
app.use(cookieParser());

// =====================================================================
// v5: LOAD ENHANCEMENTS
// =====================================================================
const enhancements = require('./enhancements');

// =====================================================================
// v5: APPLY MIDDLEWARE (rate limiting, preferences, circuit status)
// Must be BEFORE route definitions
// =====================================================================
enhancements.applyMiddleware(app, redis);

// =====================================
// COMPREHENSIVE DISASTER DATA AGGREGATOR
// =====================================
class DisasterDataAggregator {
  constructor() {
    this.processedEvents = new Map();
    this.lastFetchTime = {};
    
    this.dataSources = {
      // 1. EARTHQUAKES - USGS
      earthquakes: {
        url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
        interval: '*/5 * * * *',
        transform: this.transformUSGSEarthquakes.bind(this),
        priority: 1
      },

      // 2. FIRES - NASA FIRMS
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

      // 7. GDACS COMBINED - fetch all and filter by type
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
      },

      // 9. LANDSLIDES - NASA EONET
      landslides: {
        url: 'https://eonet.gsfc.nasa.gov/api/v3/events?category=landslides&status=open&limit=50',
        interval: '*/30 * * * *',
        transform: this.transformLandslides.bind(this),
        priority: 9
      },

      // 10. TSUNAMIS - NOAA PTWC
      tsunamis: {
        url: 'https://www.tsunami.gov/events/xml/PAAQAtom.xml',
        interval: '*/5 * * * *',
        transform: this.transformTsunamis.bind(this),
        priority: 10
      }
    };
  }

  // ===================
  // GDACS SPLIT TRANSFORM
  // ===================
  async transformGDACSSplitData(data) {
    console.log('📊 Processing GDACS combined data...');
    
    if (!data?.features) {
      console.log('No GDACS data received');
      return null;
    }

    console.log(`Total GDACS events received: ${data.features.length}`);
    
    const typeCounts = {};
    data.features.forEach(f => {
      const type = f.properties?.eventtype;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    console.log('GDACS event types in response:', typeCounts);
    
    const cyclones = data.features.filter(f => f.properties?.eventtype === 'TC');
    const floods = data.features.filter(f => f.properties?.eventtype === 'FL');
    const wildfires = data.features.filter(f => f.properties?.eventtype === 'WF');
    const droughts = data.features.filter(f => f.properties?.eventtype === 'DR');
    
    console.log(`✅ Filtered counts - TC: ${cyclones.length}, FL: ${floods.length}, WF: ${wildfires.length}, DR: ${droughts.length}`);
    
    const transformedCyclones = this.transformGDACSCyclones({ features: cyclones });
    const transformedFloods = this.transformGDACSFloods({ features: floods });
    const transformedWildfires = this.transformGDACSWildfires({ features: wildfires });
    const transformedDroughts = this.transformGDACSDroughts({ features: droughts });
    
    if (transformedCyclones?.features?.length > 0) {
      await this.storeInRedis('cyclones', transformedCyclones);
    } else {
      await this.storeInRedis('cyclones', {
        type: 'cyclones', timestamp: new Date().toISOString(), count: 0, features: [],
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

    await this.mergeFloodData();

    return { 
      processed: true, 
      counts: typeCounts,
      filtered: { cyclones: cyclones.length, floods: floods.length, wildfires: wildfires.length, droughts: droughts.length }
    };
  }

  // ===================
  // COMPUTE EVENT STATUS
  // ===================
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

    if (isCurrent) {
      isActive = true;
      status = 'active';
    }

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

  // ===================
  // TRANSFORM FUNCTIONS
  // ===================

  transformUSGSEarthquakes(data) {
      if (!data?.features) {
        console.log('No earthquake data received');
        return null;
      }

      const earthquakes = data.features
        .filter(f => f.properties.mag >= 2.5 && f.geometry?.coordinates?.length >= 2)
        .map(f => {
          const p = f.properties;
          const depth = f.geometry.coordinates[2];

          // Classify depth
          let depthClass = 'Shallow';
          if (depth >= 300) depthClass = 'Deep';
          else if (depth >= 70) depthClass = 'Intermediate';

          // Describe intensity from MMI
          let intensityDesc = '';
          const mmi = p.mmi;
          if (mmi >= 10) intensityDesc = 'Extreme';
          else if (mmi >= 8) intensityDesc = 'Severe';
          else if (mmi >= 6) intensityDesc = 'Strong';
          else if (mmi >= 4) intensityDesc = 'Light';
          else if (mmi >= 2) intensityDesc = 'Weak';
          else if (mmi > 0) intensityDesc = 'Not Felt';

          return {
            id: f.id,
            type: 'earthquake',
            magnitude: p.mag,
            place: p.place,
            time: p.time,
            updated: p.updated,
            coordinates: f.geometry.coordinates,
            depth: depth,
            felt: p.felt || 0,
            cdi: p.cdi || null,
            mmi: p.mmi || null,
            alert: p.alert,
            status: p.status || 'automatic',
            tsunami: p.tsunami || 0,
            significance: p.sig,
            source: 'USGS',
            url: p.url || '',
            // ── NEW v5.1 FIELDS ──
            magType: p.magType || '',
            title: p.title || '',
            nst: p.nst || null,
            rms: p.rms || null,
            gap: p.gap || null,
            net: p.net || '',
            types: p.types || '',
            depthClass: depthClass,
            intensityDesc: intensityDesc
          };
        })
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

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length >= 13) {
          const lat = parseFloat(values[0]);
          const lon = parseFloat(values[1]);
          const brightness = parseFloat(values[2]);
          const frp = parseFloat(values[12]) || 0;
          const scan = parseFloat(values[3]) || 0;
          const track = parseFloat(values[4]) || 0;

          if (!isNaN(lat) && !isNaN(lon)) {
            let region = 'Other';
            if (lon > -170 && lon < -30) region = 'Americas';
            else if (lon > -25 && lon < 45 && lat > 35 && lat < 71) region = 'Europe';
            else if (lon > -20 && lon < 52 && lat > -35 && lat < 37) region = 'Africa';
            else if (lon > 45 && lon < 180 && lat > -10 && lat < 77) region = 'Asia';
            else if (lon > 110 && lon < 160 && lat > -50 && lat < -10) region = 'Australia';

            // ── Intensity classification from FRP ──
            let intensity = 'Low';
            if (frp >= 100) intensity = 'Extreme';
            else if (frp >= 50) intensity = 'High';
            else if (frp >= 20) intensity = 'Moderate';

            allFires.push({
              id: `fire_${i}_${Date.now()}`,
              type: 'fire',
              latitude: lat,
              longitude: lon,
              coordinates: [lon, lat],
              brightness: brightness,
              scan: scan,
              track: track,
              date: values[5],
              time: values[6],
              satellite: values[7],
              confidence: values[9],
              version: values[10],
              bright_t31: parseFloat(values[11]),
              frp: frp,
              daynight: values[13] || 'D',
              source: 'NASA_FIRMS',
              region: region,
              // ── NEW v5.1 FIELDS ──
              instrument: values[8] || '',
              intensity: intensity,
              estimatedArea: scan * track,
              dayNight: values[13] || 'D'
            });
          }
        }
      }

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

  transformNOAAWeather(data) {
      if (!data?.features) {
        console.log('No weather data received');
        return null;
      }

      const now = new Date();

      const alerts = data.features
        .filter(alert => alert.properties && alert.geometry)
        .map(alert => {
          const p = alert.properties;
          let coordinates = [0, 0];
          if (alert.geometry?.coordinates?.length > 0) {
            if (alert.geometry.type === 'Polygon' && alert.geometry.coordinates[0]?.length > 0) {
              coordinates = alert.geometry.coordinates[0][0];
            } else if (alert.geometry.type === 'Point') {
              coordinates = alert.geometry.coordinates;
            }
          }

          // Calculate time remaining
          let timeRemaining = '';
          if (p.expires) {
            const diff = new Date(p.expires) - now;
            if (diff > 0) {
              const hrs = Math.floor(diff / 3600000);
              const mins = Math.floor((diff % 3600000) / 60000);
              timeRemaining = hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`;
            }
          }

          return {
            id: alert.id,
            type: 'weather',
            severity: p.severity,
            urgency: p.urgency,
            event: p.event,
            headline: p.headline,
            description: p.description?.substring(0, 800),
            areas: p.areaDesc,
            coordinates: coordinates,
            onset: p.onset,
            expires: p.expires,
            source: 'NOAA',
            category: this.categorizeWeatherEvent(p.event),
            // ── NEW v5.1 FIELDS ──
            instruction: p.instruction?.substring(0, 800) || '',
            effective: p.effective || null,
            certainty: p.certainty || '',
            sender: p.senderName || '',
            web: p.web || '',
            response: p.response || '',
            timeRemaining: timeRemaining,
            status: p.status || '',
            messageType: p.messageType || '',
            parameters: {
              nwsHeadline: p.parameters?.NWSheadline?.[0] || '',
              windThreat: p.parameters?.windThreat?.[0] || '',
              maxWindGust: p.parameters?.maxWindGust?.[0] || '',
              hailThreat: p.parameters?.hailThreat?.[0] || '',
              maxHailSize: p.parameters?.maxHailSize?.[0] || '',
              tornadoDetection: p.parameters?.tornadoDetection?.[0] || '',
              thunderstormDamageThreat: p.parameters?.thunderstormDamageThreat?.[0] || '',
              flashFloodDetection: p.parameters?.flashFloodDetection?.[0] || '',
              flashFloodDamageThreat: p.parameters?.flashFloodDamageThreat?.[0] || '',
            }
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

  transformEONETVolcanoes(data) {
      if (!data?.events) {
        console.log('No EONET volcano data received');
        return null;
      }

      const volcanoes = data.events.map(event => {
        const latestGeometry = event.geometry?.[0] || {};
        const coords = latestGeometry.coordinates || [0, 0];

        // Count geometries to estimate activity duration
        const geometryCount = event.geometry?.length || 0;
        const firstDate = event.geometry?.[event.geometry.length - 1]?.date;
        const lastDate = event.geometry?.[0]?.date;
        let durationDays = null;
        if (firstDate && lastDate) {
          durationDays = Math.max(1, Math.round((new Date(lastDate) - new Date(firstDate)) / 86400000));
        }

        return {
          id: `eonet_${event.id}`,
          type: 'volcano',
          name: event.title,
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          status: event.closed ? 'closed' : 'active',
          category: event.categories?.[0]?.title || 'Volcanoes',
          date: latestGeometry.date || new Date().toISOString(),
          alertLevel: event.closed ? 'Green' : 'Orange',
          source: 'NASA_EONET',
          // ── NEW v5.1 FIELDS ──
          sources: (event.sources || []).map(s => ({
            id: s.id,
            url: s.url
          })),
          link: event.link || '',
          description: event.description || `Volcanic activity reported at ${event.title}`,
          startDate: firstDate || null,
          lastObserved: lastDate || null,
          lastUpdate: latestGeometry.date || new Date().toISOString(),
          durationDays: durationDays,
          geometryCount: geometryCount,
          isClosed: !!event.closed,
          closedDate: event.closed || null
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


  transformNASAFloods(data) {
    console.log('🌊 Processing NASA EONET floods...');
    
    if (!data?.events) {
      console.log('No NASA flood data received');
      return null;
    }

    const now = new Date();

    const floods = data.events
      .filter(event => {
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
          freshness: isClosed ? 'stale' : 'current',
          date: latestGeometry.date || new Date().toISOString(),
          fromDate: latestGeometry.date || new Date().toISOString(),
          toDate: isClosed ? event.closed : null,
          daysSinceStart,
          country: country,
          source: 'NASA_EONET',
          sources: event.sources?.map(s => ({ id: s.id, url: s.url })) || [],
          description: `Flood event: ${event.title}`
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

  transformReliefWebFloods(data) {
    console.log('🌊 Processing ReliefWeb floods...');
    
    if (!data?.data) {
      console.log('No ReliefWeb flood data received');
      return null;
    }

    const now = new Date();

    const floods = data.data
      .filter(disaster => {
        const name = disaster.fields?.name || '';
        return name.toLowerCase().includes('flood');
      })
      .filter(disaster => {
        const eventDate = new Date(disaster.fields?.date?.created || now);
        const daysSince = Math.floor((now - eventDate) / (1000 * 60 * 60 * 24));
        if (daysSince > 30) {
          console.log(`  ⏭️ Filtering out old ReliefWeb flood: "${disaster.fields?.name}" (${daysSince} days old)`);
          return false;
        }
        return true;
      })
      .map(disaster => {
        const name = disaster.fields?.name || 'Unknown Flood';
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

          const eventStatus = this.computeEventStatus(props);

          // ── Duration in days ──
          let durationDays = null;
          if (props.fromdate) {
            const from = new Date(props.fromdate);
            const to = props.todate ? new Date(props.todate) : new Date();
            durationDays = Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)));
          }

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
            affectedCountries: this.normalizeAffectedCountries(props.affectedcountries, props.country),
            population: parseInt(props.population || 0),
            fromDate: props.fromdate,
            toDate: props.todate,
            source: 'GDACS',
            isActive: eventStatus.isActive,
            status: eventStatus.status,
            freshness: eventStatus.freshness,
            daysSinceStart: eventStatus.daysSinceStart,
            daysSinceEnd: eventStatus.daysSinceEnd,
            lastUpdate: props.lastupdate || props.modified || now.toISOString(),
            description: props.description || '',
            // ── NEW v5.1 FIELDS ──
            url: props.url?.report || props.url?.details || props.link || '',
            htmlDescription: props.htmldescription || '',
            severityScore: parseFloat(props.alertscore || 0),
            episodeId: props.episodeid || null,
            glide: props.glide || '',
            iso3: props.iso3 || '',
            durationDays: durationDays,
            eventId: props.eventid || ''
          };
        })
        .filter(flood => {
          if (flood.isActive) return true;
          if (flood.status === 'just_ended') return true;
          if (flood.daysSinceEnd !== null && flood.daysSinceEnd <= 7) return true;
          console.log(`  ⏭️ Filtering out ended GDACS flood: "${flood.name}" (ended ${flood.daysSinceEnd} days ago)`);
          return false;
        });

      console.log(`✅ Processed ${floods.length} floods from GDACS`);

      return {
        type: 'floods_gdacs',
        timestamp: new Date().toISOString(),
        count: floods.length,
        features: floods
      };
    }

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

          // ── Saffir-Simpson classification ──
          let saffirSimpson = '';
          if (windSpeed >= 252) saffirSimpson = 'Category 5 — Catastrophic';
          else if (windSpeed >= 209) saffirSimpson = 'Category 4 — Devastating';
          else if (windSpeed >= 178) saffirSimpson = 'Category 3 — Major';
          else if (windSpeed >= 154) saffirSimpson = 'Category 2 — Extensive';
          else if (windSpeed >= 119) saffirSimpson = 'Category 1 — Dangerous';
          else if (windSpeed >= 63) saffirSimpson = 'Tropical Storm';
          else saffirSimpson = 'Tropical Depression';

          // ── Beaufort Scale ──
          let beaufort = 0;
          const wsKnots = windSpeed * 0.539957;
          if (wsKnots >= 64) beaufort = 12;
          else if (wsKnots >= 56) beaufort = 11;
          else if (wsKnots >= 48) beaufort = 10;
          else if (wsKnots >= 41) beaufort = 9;
          else if (wsKnots >= 34) beaufort = 8;
          else if (wsKnots >= 28) beaufort = 7;
          else if (wsKnots >= 22) beaufort = 6;

          // ── Movement description ──
          const speed = parseFloat(props.speed || 0);
          const direction = parseFloat(props.direction || 0);
          let movementDesc = '';
          if (speed > 0) {
            const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
            const dirIndex = Math.round(((direction % 360) / 22.5)) % 16;
            movementDesc = `Moving ${dirs[dirIndex]} at ${speed.toFixed(0)} km/h`;
          }

          // ── Pressure classification ──
          const pressure = parseInt(props.pressure || 0);
          let pressureDesc = '';
          if (pressure > 0) {
            if (pressure < 920) pressureDesc = 'Extremely Low — Violent';
            else if (pressure < 945) pressureDesc = 'Very Low — Intense';
            else if (pressure < 965) pressureDesc = 'Low — Strong';
            else if (pressure < 990) pressureDesc = 'Below Normal — Moderate';
            else pressureDesc = 'Near Normal';
          }

          // ── Duration in days ──
          let durationDays = null;
          if (props.fromdate) {
            const from = new Date(props.fromdate);
            const to = props.todate ? new Date(props.todate) : new Date();
            durationDays = Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)));
          }

          return {
            id: `gdacs_tc_${props.eventid || Math.random()}`,
            type: 'cyclone',
            name: eventName,
            coordinates: coords,
            latitude: coords[1],
            longitude: coords[0],
            alertLevel: props.alertlevel || 'Yellow',
            alertScore: parseFloat(props.alertscore || 0),
            category: props.tc_category || this.getCycloneCategory(windSpeed),
            windSpeed: windSpeed,
            pressure: pressure || null,
            direction: direction,
            speed: speed,
            country: props.country || this.extractCountryName(props.affectedcountries?.[0]) || 'Ocean',
            affectedCountries: this.normalizeAffectedCountries(props.affectedcountries, props.country),
            population: parseInt(props.population || 0),
            fromDate: props.fromdate,
            toDate: props.todate,
            source: 'GDACS',
            stormType: stormType,
            isActive: !props.todate || new Date(props.todate) > new Date(),
            severity: props.severitydata?.severity || props.severity || windSpeed,
            description: props.description || `${stormType} with winds ${windSpeed} km/h`,
            // ── NEW v5.1 FIELDS ──
            url: props.url?.report || props.url?.details || props.link || '',
            episodeId: props.episodeid || null,
            htmlDescription: props.htmldescription || '',
            iso3: props.iso3 || props.countryiso || '',
            lastUpdate: props.lastupdate || props.modified || new Date().toISOString(),
            durationDays: durationDays,
            saffirSimpson: saffirSimpson,
            beaufort: beaufort,
            movementDesc: movementDesc,
            pressureDesc: pressureDesc,
            affectedArea: parseInt(props.affectedarea || 0),
            glide: props.glide || '',
            eventId: props.eventid || '',
            maxWindRadius: parseInt(props.maxwindradius || 0),
            iconUrl: props.icon || ''
          };
        });

      console.log(`✅ Processed ${cyclones.length} cyclones/hurricanes/typhoons from GDACS`);

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

  transformGDACSDroughts(data) {
      console.log('🏜️ Processing GDACS droughts...');
      
      if (!data?.features) {
        console.log('No GDACS drought data received');
        return null;
      }

      const now = new Date();
      const currentYear = now.getFullYear();

      const droughts = data.features
        .filter(f => f.properties && f.geometry?.coordinates)
        .map(f => {
          const props = f.properties;
          const coords = f.geometry.coordinates;
          
          // Use computeEventStatus just like floods and wildfires do
          const eventStatus = this.computeEventStatus(props);
          
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
            country: props.country || props.countryname || '',
            population: parseInt(props.population || 0),
            fromDate: props.fromdate,
            toDate: props.todate,
            duration: parseInt(props.duration || 0),
            source: 'GDACS',
            description: props.description || props.eventname || '',
            url: props.url || '',
            isActive: eventStatus.isActive,
            status: eventStatus.status,
            freshness: eventStatus.freshness,
            daysSinceStart: eventStatus.daysSinceStart,
            daysSinceEnd: eventStatus.daysSinceEnd,
            lastUpdate: props.lastupdate || props.modified || now.toISOString(),
            isCurrent: props.iscurrent === 'true' || props.iscurrent === true
          };
        })
        .filter(drought => {
          // ─────────────────────────────────────────────────────────────
          // PRIORITY CHECK: Filter out events with old years in name
          // GDACS keeps updating toDate on old drought cycles, making
          // them look "fresh" (e.g. "South America-2023" with toDate 2026).
          // This check MUST come first before any date-based pass-throughs.
          // ─────────────────────────────────────────────────────────────
          const nameYearMatch = drought.name.match(/(\d{4})/);
          if (nameYearMatch) {
            const eventYear = parseInt(nameYearMatch[1]);
            // If the year in the name is more than 1 year behind current year, filter it out
            if (eventYear < currentYear - 1) {
              console.log(`  ⏭️ Filtering out old drought: "${drought.name}" (year ${eventYear} in name, current year ${currentYear})`);
              return false;
            }
          }

          // ─────────────────────────────────────────────────────────────
          // SECOND CHECK: Filter by fromDate age
          // If a drought started more than 2 years ago, it's likely a 
          // legacy event that GDACS keeps refreshing. Filter it out
          // unless it's still genuinely flagged as current/active.
          // ─────────────────────────────────────────────────────────────
          if (drought.fromDate) {
            const fromDate = new Date(drought.fromDate);
            const daysSinceStart = Math.floor((now - fromDate) / (1000 * 60 * 60 * 24));
            if (daysSinceStart > 730 && !drought.isCurrent) {
              console.log(`  ⏭️ Filtering out old drought: "${drought.name}" (started ${daysSinceStart} days ago)`);
              return false;
            }
          }

          // ─────────────────────────────────────────────────────────────
          // STANDARD ACTIVE/ENDED CHECKS (same pattern as floods/wildfires)
          // ─────────────────────────────────────────────────────────────
          
          // Always show active droughts
          if (drought.isActive) return true;
          
          // Show just-ended droughts
          if (drought.status === 'just_ended') return true;
          
          // Show recently ended droughts (within 30 days)
          if (drought.daysSinceEnd !== null && drought.daysSinceEnd <= 30) return true;
          
          // Filter out droughts that ended more than 30 days ago
          if (drought.daysSinceEnd !== null && drought.daysSinceEnd > 30) {
            console.log(`  ⏭️ Filtering out ended drought: "${drought.name}" (ended ${drought.daysSinceEnd} days ago)`);
            return false;
          }
          
          // Filter out droughts that have been going for a very long time with stale data
          if (drought.daysSinceStart !== null && drought.daysSinceStart > 365 && drought.freshness === 'stale') {
            console.log(`  ⏭️ Filtering out stale drought: "${drought.name}" (started ${drought.daysSinceStart} days ago, stale)`);
            return false;
          }
          
          return true;
        })
        // Sort: active first, then by alert level severity
        .sort((a, b) => {
          if (a.isActive && !b.isActive) return -1;
          if (!a.isActive && b.isActive) return 1;
          const alertOrder = { 'Red': 3, 'Orange': 2, 'Yellow': 1, 'Green': 0 };
          const diff = (alertOrder[b.alertLevel] || 0) - (alertOrder[a.alertLevel] || 0);
          if (diff !== 0) return diff;
          return new Date(b.fromDate || 0) - new Date(a.fromDate || 0);
        });

      const activeCount = droughts.filter(d => d.isActive).length;
      const endedCount = droughts.filter(d => !d.isActive).length;
      
      console.log(`✅ Processed ${droughts.length} droughts (${activeCount} active, ${endedCount} recently ended)`);
      
      return {
        type: 'droughts',
        timestamp: new Date().toISOString(),
        count: droughts.length,
        activeCount,
        features: droughts
      };
    }

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

  // =====================================================================
  // LANDSLIDES — NASA EONET
  // =====================================================================
  transformLandslides(data) {
    console.log('⛰️ Processing NASA EONET landslide data...');
    
    if (!data?.events) {
      console.log('No EONET landslide data');
      return { type: 'landslides', timestamp: new Date().toISOString(), count: 0, features: [] };
    }

    const now = new Date();
    const landslides = data.events
      .filter(event => {
        if (!event.geometry?.length) return false;
        const geo = event.geometry[event.geometry.length - 1];
        if (!geo?.coordinates) return false;
        const eventDate = new Date(geo.date || event.geometry[0].date);
        return (now - eventDate) / (1000 * 60 * 60 * 24) <= 30;
      })
      .map(event => {
        const geo = event.geometry[event.geometry.length - 1];
        const coords = geo.coordinates;
        const titleParts = event.title.split(',');
        const country = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : 'Unknown';
        
        return {
          id: `landslide_${event.id}`,
          type: 'landslide',
          name: event.title,
          coordinates: coords,
          latitude: coords[1],
          longitude: coords[0],
          date: geo.date || new Date().toISOString(),
          country: country,
          source: 'NASA_EONET',
          fatalities: 0,
          trigger: event.description || 'Unknown',
          severity: 'Reported',
          sources: event.sources?.map(s => ({ id: s.id, url: s.url })) || [],
          description: `Landslide event: ${event.title}`
        };
      });

    console.log(`✅ Processed ${landslides.length} landslides from NASA EONET`);
    
    return {
      type: 'landslides',
      timestamp: new Date().toISOString(),
      count: landslides.length,
      features: landslides
    };
  }

  // =====================================================================
  // TSUNAMIS — NOAA Pacific Tsunami Warning Center
  // =====================================================================
  transformTsunamis(data) {
    console.log('🌊 Processing NOAA Tsunami alerts...');
    const events = [];
    
    try {
      if (typeof data !== 'string') data = '';
      const entries = data.split('<entry>').slice(1);
      
      entries.forEach(entry => {
        const getTag = (tag) => {
          const m = entry.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
          return m ? m[1].trim() : null;
        };
        
        const title = getTag('title') || 'Tsunami Alert';
        const updated = getTag('updated') || new Date().toISOString();
        const summary = getTag('summary') || '';
        const id = getTag('id') || `tsunami_${Date.now()}`;
        
        const pointMatch = entry.match(/<georss:point>([^<]+)<\/georss:point>/);
        let lat = 0, lon = 0;
        if (pointMatch) {
          const parts = pointMatch[1].trim().split(/\s+/);
          lat = parseFloat(parts[0]);
          lon = parseFloat(parts[1]);
        }
        
        let severity = 'Advisory';
        const text = (title + ' ' + summary).toLowerCase();
        if (text.includes('warning')) severity = 'Warning';
        else if (text.includes('watch')) severity = 'Watch';
        else if (text.includes('information')) severity = 'Information';
        
        if (lat !== 0 || lon !== 0) {
          events.push({
            id: `tsunami_${id}`,
            type: 'tsunami',
            name: title,
            coordinates: [lon, lat],
            latitude: lat,
            longitude: lon,
            date: updated,
            severity: severity,
            region: title,
            source: 'NOAA_PTWC',
            description: summary.substring(0, 500),
            isActive: true
          });
        }
      });
    } catch (e) {
      console.error('Error parsing tsunami XML:', e.message);
    }

    console.log(`✅ Processed ${events.length} tsunami alerts from NOAA`);
    
    return {
      type: 'tsunamis',
      timestamp: new Date().toISOString(),
      count: events.length,
      features: events
    };
  }

  // ===================
  // HELPER FUNCTIONS
  // ===================

  extractCountryName(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
      return entry.countryname || entry.country_name || entry.name || entry.iso3 || null;
    }
    return null;
  }

  normalizeAffectedCountries(affectedcountries, fallbackCountry) {
    if (!affectedcountries) {
      return fallbackCountry ? [fallbackCountry] : [];
    }
    if (typeof affectedcountries === 'string') {
      return affectedcountries.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (Array.isArray(affectedcountries)) {
      const names = affectedcountries
        .map(entry => this.extractCountryName(entry))
        .filter(Boolean);
      return names.length > 0 ? names : (fallbackCountry ? [fallbackCountry] : []);
    }
    return fallbackCountry ? [fallbackCountry] : [];
  }

  getApproximateCoordinates(country) {
    const countryCoords = {
      'Bangladesh': [90.356, 23.685], 'India': [78.962, 20.594],
      'Pakistan': [69.345, 30.375], 'Philippines': [121.774, 12.880],
      'Indonesia': [113.921, -0.789], 'Thailand': [100.993, 15.870],
      'Vietnam': [108.277, 14.058], 'China': [104.195, 35.861],
      'Myanmar': [95.956, 21.914], 'Brazil': [-51.925, -14.235],
      'Colombia': [-74.297, 4.571], 'Peru': [-75.015, -9.190],
      'Mexico': [-102.553, 23.635], 'United States': [-95.712, 37.090],
      'Nigeria': [8.676, 9.082], 'Kenya': [37.906, -0.023],
      'Somalia': [46.200, 5.152], 'Sudan': [30.217, 12.863],
      'South Sudan': [31.307, 6.877], 'Ethiopia': [40.490, 9.145],
      'Mozambique': [35.530, -18.666], 'South Africa': [22.937, -30.560],
      'Australia': [133.775, -25.274], 'Honduras': [-86.241, 15.200],
      'Guatemala': [-90.231, 15.784], 'Nicaragua': [-85.207, 12.865],
      'El Salvador': [-88.897, 13.794], 'Venezuela': [-66.590, 6.423],
      'Germany': [10.452, 51.166], 'Japan': [138.253, 36.204]
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
      const MAX_STALE_DAYS = 14;

      const allFloods = [
        ...(nasa.features || []),
        ...(reliefweb.features || []),
        ...(gdacs.features || [])
      ];

      const freshFloods = allFloods.filter(flood => {
        if (flood.toDate) {
          const toDate = new Date(flood.toDate);
          if (toDate < now) {
            const daysSinceEnd = Math.floor((now - toDate) / (1000 * 60 * 60 * 24));
            if (daysSinceEnd > MAX_STALE_DAYS) {
              console.log(`  🧹 Removing stale flood: "${flood.name}" (ended ${daysSinceEnd} days ago, source: ${flood.source})`);
              return false;
            }
          }
        }
        if (flood.fromDate && !flood.toDate) {
          const fromDate = new Date(flood.fromDate);
          const daysSinceStart = Math.floor((now - fromDate) / (1000 * 60 * 60 * 24));
          if (daysSinceStart > 90 && flood.freshness === 'stale') {
            console.log(`  🧹 Removing old flood: "${flood.name}" (started ${daysSinceStart} days ago, source: ${flood.source})`);
            return false;
          }
        }
        return true;
      });
      
      const uniqueFloods = [];
      const seen = new Set();
      
      freshFloods.forEach(flood => {
        if (!flood.latitude || !flood.longitude || (flood.latitude === 0 && flood.longitude === 0)) {
          if (flood.source !== 'ReliefWeb') return;
        }
        const key = `${Math.round(flood.latitude * 2)}_${Math.round(flood.longitude * 2)}`;
        const nameKey = flood.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
        const uniqueKey = `${key}_${nameKey}`;
        
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          uniqueFloods.push(flood);
        }
      });

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
      console.log(`🌊 Merged ${uniqueFloods.length} unique floods (filtered ${allFloods.length - freshFloods.length} stale)`);
      
      return mergedData;
    } catch (error) {
      console.error('Error merging flood data:', error);
      return null;
    }
  }

  // ====================
  // STORAGE & FETCH
  // ====================

  async storeInRedis(type, data) {
    try {
      await redis.set(`data:${type}`, JSON.stringify(data), { EX: 600 });
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
          'User-Agent': 'RealNow-DisasterTracker/5.0',
          'Accept': 'application/json, text/csv, application/xml, */*'
        }
      });

      const transformedData = config.transform(response.data);
      
      if (source === 'gdacs_combined') {
        return transformedData;
      }
      
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
    
    for (const [source, config] of Object.entries(this.dataSources)) {
      await this.fetchData(source);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

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

// =====================================================================
// v5: ENHANCE AGGREGATOR (circuit breaker, geo-dedup, Redis TTL)
// =====================================================================
enhancements.enhanceAggregator(aggregator, redis);
aggregator.io = io; // Give aggregator reference to socket.io

app.get('/api/data/:type', async (req, res) => {
  try {
    const cached = await redis.get(`data:${req.params.type}`);
    if (cached) {
      res.json(JSON.parse(cached));
    } else {
      res.status(404).json({ error: 'Data not available', type: req.params.type });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/aggregate', async (req, res) => {
  const types = [
    'earthquakes', 'fires', 'weather', 
    'volcanoes', 'cyclones', 'floods', 
    'droughts', 'wildfires', 'spaceweather',
    'landslides', 'tsunamis'
  ];
  
  const results = {};
  
  for (const type of types) {
    try {
      const cached = await redis.get(`data:${type}`);
      results[type] = cached ? JSON.parse(cached) : { 
        type, features: [], count: 0, timestamp: new Date().toISOString() 
      };
    } catch (e) {
      results[type] = { type, features: [], count: 0 };
    }
  }
  
  res.json(results);
});

app.get('/api/stats', async (req, res) => {
  const types = [
    'earthquakes', 'fires', 'weather', 
    'volcanoes', 'cyclones', 'floods', 
    'droughts', 'wildfires', 'spaceweather',
    'landslides', 'tsunamis'
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

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    version: '5.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    // v5: include circuit breaker status
    circuitBreaker: enhancements.circuitBreaker.getStatus()
  });
});

app.post('/api/refresh/:type', async (req, res) => {
  const type = req.params.type;
  
  if (type === 'floods') {
    console.log('Manual flood refresh requested');
    await aggregator.fetchData('floods_nasa');
    await aggregator.fetchData('floods_reliefweb');
    await aggregator.fetchData('gdacs_combined');
    const result = await aggregator.mergeFloodData();
    res.json({ success: true, type: 'floods', count: result?.count || 0, sources: result?.sources || {} });
  } else if (type === 'gdacs') {
    console.log('Manual GDACS refresh requested');
    await aggregator.fetchData('gdacs_combined');
    res.json({ success: true, type: 'gdacs', message: 'All GDACS data refreshed' });
  } else if (type === 'cyclones') {
    console.log('Manual cyclone refresh requested');
    await aggregator.fetchData('gdacs_combined');
    const cached = await redis.get('data:cyclones');
    const data = cached ? JSON.parse(cached) : { count: 0 };
    res.json({ success: true, type: 'cyclones', count: data.count });
  } else if (aggregator.dataSources[type]) {
    console.log(`Manual refresh requested for ${type}`);
    const result = await aggregator.fetchData(type);
    res.json({ success: !!result, type, count: result?.count || 0 });
  } else {
    res.status(404).json({ error: 'Unknown data type' });
  }
});

app.get('/api/event/:id', async (req, res) => {
  const eventId = req.params.id;
  const types = [
    'earthquakes', 'fires', 'weather', 'volcanoes', 'cyclones', 'floods',
    'droughts', 'wildfires', 'spaceweather', 'landslides', 'tsunamis'
  ];
  
  for (const type of types) {
    try {
      const cached = await redis.get(`data:${type}`);
      if (!cached) continue;
      const data = JSON.parse(cached);
      const match = data.features?.find(f => f.id === eventId || f.name === eventId);
      if (match) return res.json({ success: true, type, event: match });
    } catch (e) { continue; }
  }
  
  res.status(404).json({ error: 'Event not found', id: eventId });
});

app.get('/api/history/:type', async (req, res) => {
  try {
    const cached = await redis.get(`data:${req.params.type}`);
    if (!cached) return res.status(404).json({ error: 'No data' });
    res.json(JSON.parse(cached));
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  console.log('🌍 REALNOW DISASTER TRACKER v5.0');
  console.log('═══════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔥 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🌊 Flood sources: NASA EONET + ReliefWeb + GDACS');
  console.log('🌊 Flood staleness: 3d NASA / 30d ReliefWeb / 7d GDACS / 14d merge ceiling');
  console.log('🌋 Volcano monitoring: NASA EONET');
  console.log('🌀 GDACS: Fixed filtering for mixed data bug');
  console.log('⛰️  Landslide monitoring (NASA EONET)');
  console.log('🌊 Tsunami alerts (NOAA PTWC)');
  console.log('🔗 Deep link sharing (/api/event/:id)');
  console.log('⏱️  Historical timeline (/api/history/:type)');
  console.log('──── v5.0 ENHANCEMENTS ────');
  console.log('⚡ Circuit breaker: Exponential backoff on source failures');
  console.log('🔒 Rate limiting: All API routes protected');
  console.log('🔄 Geo-deduplication: Cross-source duplicate removal');
  console.log('💾 Redis TTL: 2hr safety net on all cached data');
  console.log('👤 Preferences API: /api/preferences (anonymous UUID)');
  console.log('📧 Email digest: Daily/weekly watch area summaries');
  console.log('📊 Circuit status: /api/circuit-status');
  console.log('═══════════════════════════════════════\n');
  
  aggregator.startScheduledFetching();

  // v5: Start background services (digest scheduler)
  enhancements.startServices(redis);
});

process.on('SIGTERM', async () => {
  console.log('\n📴 SIGTERM received, shutting down gracefully...');
  server.close(() => { redis.quit(); process.exit(0); });
});

process.on('SIGINT', async () => {
  console.log('\n📴 SIGINT received, shutting down gracefully...');
  server.close(() => { redis.quit(); process.exit(0); });
});