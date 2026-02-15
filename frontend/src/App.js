// App.js - v3.2 WITH LIVE FEED CHATTER BOX + CLICK-TO-FLY
// Includes: flood staleness cleanup, wildfire active/ended badges, LiveFeed integration
// v3.2 adds: click feed item → fly to location + highlight, time label rename, fire timestamp fix
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, Tooltip, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import './App.css';
import './LiveFeed.css';

// =====================================================================
// DISASTER CONFIGURATION
// =====================================================================
const DISASTER_CONFIG = {
  
  wildfires: { 
    color: '#ff6600', 
    icon: '🔥', 
    name: 'Wildfires',
    enabled: true,
    getRadius: (item) => {
      if (item.affectedArea > 1000) return 20;
      if (item.affectedArea > 500) return 15;
      if (item.alertLevel === 'Red') return 18;
      if (item.alertLevel === 'Orange') return 14;
      return 12;
    },
    getSeverity: (item) => {
      if (!item.isActive && item.isActive !== undefined) {
        return item.status === 'just_ended' ? 'JUST CONTAINED' : 'CONTAINED';
      }
      const level = item.alertLevel?.toUpperCase();
      if (level === 'RED') return 'CRITICAL';
      if (level === 'ORANGE') return 'SEVERE';
      if (item.affectedArea > 1000) return 'MAJOR';
      return 'ACTIVE';
    },
    getOpacity: (item) => {
      if (!item.isActive && item.isActive !== undefined) return 0.35;
      return item.alertLevel === 'Red' ? 0.9 : 0.7;
    }
  },
  
  earthquakes: { 
    color: '#ff4444', 
    icon: '🌍', 
    name: 'Earthquakes',
    enabled: true,
    getRadius: (item) => {
      const mag = item.magnitude || 0;
      if (mag >= 7) return 25;
      if (mag >= 6) return 20;
      if (mag >= 5) return 15;
      if (mag >= 4) return 10;
      return Math.max(mag * 3, 5);
    },
    getSeverity: (item) => {
      const mag = item.magnitude || 0;
      if (mag >= 7) return 'M' + mag.toFixed(1) + ' EXTREME';
      if (mag >= 6) return 'M' + mag.toFixed(1) + ' SEVERE';
      if (mag >= 5) return 'M' + mag.toFixed(1) + ' MAJOR';
      if (mag >= 4) return 'M' + mag.toFixed(1) + ' MODERATE';
      return 'M' + mag.toFixed(1);
    },
    getOpacity: (item) => {
      const mag = item.magnitude || 0;
      if (mag >= 6) return 0.9;
      if (mag >= 5) return 0.7;
      return 0.5;
    }
  },

  fires: { 
    color: '#ff8800', 
    icon: '🔥', 
    name: 'Fires',
    enabled: true,
    getRadius: (item) => {
      const frp = item.frp || 0;
      if (frp > 500) return 15;
      if (frp > 200) return 10;
      if (frp > 100) return 8;
      return Math.max(item.brightness / 100, 4);
    },
    getSeverity: (item) => {
      const frp = item.frp || 0;
      if (frp > 500) return 'EXTREME FIRE';
      if (frp > 200) return 'HIGH INTENSITY';
      if (frp > 100) return 'MODERATE';
      return item.severity?.toUpperCase() || 'LOW';
    },
    getOpacity: (item) => item.confidence === 'high' ? 0.8 : 0.5
  },

  floods: { 
    color: '#4488ff', 
    icon: '🌊', 
    name: 'Floods',
    enabled: true,
    getRadius: (item) => {
      if (item.alertLevel === 'Red') return 18;
      if (item.alertLevel === 'Orange') return 14;
      return 10;
    },
    getSeverity: (item) => {
      const level = item.alertLevel?.toUpperCase();
      if (level === 'RED') return 'SEVERE';
      if (level === 'ORANGE') return 'MODERATE';
      return 'LOW';
    },
    getOpacity: (item) => item.alertLevel === 'Red' ? 0.8 : 0.5
  },

  volcanoes: { 
    color: '#ff3333', 
    icon: '🌋', 
    name: 'Volcanoes',
    enabled: true,
    getRadius: (item) => {
      if (item.alertLevel === 'Red') return 20;
      if (item.alertLevel === 'Orange') return 15;
      return 10;
    },
    getSeverity: (item) => {
      const level = item.alertLevel?.toUpperCase();
      if (level === 'RED') return 'ERUPTING';
      if (level === 'ORANGE') return 'WARNING';
      return item.severity?.toUpperCase() || 'WATCH';
    },
    getOpacity: (item) => item.alertLevel === 'Red' ? 0.9 : 0.6
  },

  cyclones: { 
    color: '#00ccff', 
    icon: '🌀', 
    name: 'Cyclones',
    enabled: true,
    getRadius: (item) => {
      const wind = item.windSpeed || 0;
      if (wind > 250) return 30;
      if (wind > 180) return 25;
      if (wind > 119) return 20;
      return 15;
    },
    getSeverity: (item) => {
      const wind = item.windSpeed || 0;
      if (wind > 250) return 'CATEGORY 5';
      if (wind > 210) return 'CATEGORY 4';
      if (wind > 178) return 'CATEGORY 3';
      if (wind > 153) return 'CATEGORY 2';
      if (wind > 119) return 'CATEGORY 1';
      return item.category || 'TROPICAL';
    },
    getOpacity: (item) => {
      const wind = item.windSpeed || 0;
      return wind > 200 ? 0.9 : wind > 119 ? 0.7 : 0.5;
    }
  },

  tsunamis: { 
    color: '#0066ff', 
    icon: '🌊', 
    name: 'Tsunamis',
    enabled: true,
    getRadius: () => 20,
    getSeverity: (item) => item.severity?.toUpperCase() || 'ALERT',
    getOpacity: () => 0.8
  },

  droughts: { 
    color: '#cc9900', 
    icon: '🏜️', 
    name: 'Droughts',
    enabled: true,
    getRadius: (item) => {
      if (item.alertLevel === 'Red') return 20;
      if (item.alertLevel === 'Orange') return 15;
      return 12;
    },
    getSeverity: (item) => {
      const level = item.alertLevel?.toUpperCase();
      if (level === 'RED') return 'EXTREME';
      if (level === 'ORANGE') return 'SEVERE';
      return item.severity?.toUpperCase() || 'MODERATE';
    },
    getOpacity: (item) => item.alertLevel === 'Red' ? 0.7 : 0.4
  },

  spaceweather: { 
    color: '#ff00ff', 
    icon: '☀️', 
    name: 'Space',
    enabled: false,
    getRadius: (item) => (item.currentKp || 0) * 5,
    getSeverity: (item) => {
      const kp = item.currentKp || 0;
      if (kp >= 9) return 'EXTREME STORM';
      if (kp >= 8) return 'SEVERE STORM';
      if (kp >= 7) return 'STRONG STORM';
      if (kp >= 6) return 'MODERATE STORM';
      if (kp >= 5) return 'MINOR STORM';
      return 'QUIET';
    },
    getOpacity: (item) => Math.min((item.currentKp || 0) / 10, 0.9)
  },

  weather: { 
    color: '#ffaa00', 
    icon: '⚠️', 
    name: 'Weather',
    enabled: true,
    getRadius: (item) => {
      const sev = (item.severity || '').toLowerCase();
      if (sev === 'extreme') return 14;
      if (sev === 'severe') return 11;
      if (sev === 'moderate') return 8;
      return 6;
    },
    getSeverity: (item) => {
      const sev = (item.severity || '').toUpperCase();
      if (sev === 'EXTREME') return 'EXTREME';
      if (sev === 'SEVERE') return 'SEVERE';
      if (sev === 'MODERATE') return 'MODERATE';
      return item.event || 'ALERT';
    },
    getOpacity: (item) => {
      const sev = (item.severity || '').toLowerCase();
      if (sev === 'extreme') return 0.9;
      if (sev === 'severe') return 0.7;
      return 0.5;
    }
  }
};

// =====================================================================
// TIME FILTER OPTIONS
// v3.2: Renamed "Live" → "All" so it doesn't confuse with "LIVE FEED"
// =====================================================================
const TIME_FILTERS = [
  { label: 'All', value: 0, displayName: 'ALL' },
  { label: '5 min', value: 5 * 60 * 1000, displayName: 'LAST 5 MIN' },
  { label: '30 min', value: 30 * 60 * 1000, displayName: 'LAST 30 MIN' },
  { label: '1 hr', value: 60 * 60 * 1000, displayName: 'LAST HOUR' },
  { label: '3 hr', value: 3 * 60 * 60 * 1000, displayName: 'LAST 3 HOURS' },
  { label: '12 hr', value: 12 * 60 * 60 * 1000, displayName: 'LAST 12 HOURS' },
  { label: '2 days', value: 2 * 24 * 60 * 60 * 1000, displayName: 'LAST 2 DAYS' },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000, displayName: 'LAST WEEK' }
];

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================
const formatNumber = (num) => {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
};

// =====================================================================
// v3.2: COORDINATE HELPER — extract lat/lon from any item
// =====================================================================
const getItemCoords = (item) => {
  if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
    return { lat: item.coordinates[1], lon: item.coordinates[0] };
  }
  if (item.latitude !== undefined && item.longitude !== undefined) {
    return { lat: item.latitude, lon: item.longitude };
  }
  return null;
};

// =====================================================================
// FLOOD INFO HELPER (v2.5 with staleness checks)
// =====================================================================
const formatFloodInfo = (flood) => {
  const now = new Date();
  const startDate = new Date(flood.fromDate);
  const daysActive = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  
  let isActive = false;
  let statusLabel = '';
  
  if (flood.isActive === true) {
    isActive = true;
  } else if (flood.isActive === false) {
    isActive = false;
    if (flood.daysSinceEnd) {
      statusLabel = `Ended ~${flood.daysSinceEnd} days ago`;
    } else {
      statusLabel = 'Event has ended';
    }
  } else {
    if (flood.status === 'ongoing' || flood.status === 'active') {
      if (flood.toDate) {
        const toDate = new Date(flood.toDate);
        const daysSinceEnd = Math.floor((now - toDate) / (1000 * 60 * 60 * 24));
        isActive = daysSinceEnd <= 7;
        if (!isActive) {
          statusLabel = `Likely ended ~${daysSinceEnd} days ago`;
        }
      } else {
        isActive = true;
      }
    } else if (flood.status === 'closed' || flood.status === 'ended') {
      isActive = false;
      statusLabel = 'Event has ended';
    } else {
      if (flood.toDate) {
        isActive = new Date(flood.toDate) >= now;
        if (!isActive) {
          const daysSinceEnd = Math.floor((now - new Date(flood.toDate)) / (1000 * 60 * 60 * 24));
          statusLabel = `Ended ~${daysSinceEnd} days ago`;
        }
      } else {
        isActive = true;
      }
    }
  }
  
  const nameMatch = flood.name ? flood.name.match(/(\w+)\s+(\d{4})/) : null;
  const monthYear = nameMatch ? `${nameMatch[1]} ${nameMatch[2]}` : '';
  
  let clearName = flood.name || 'Flood Event';
  if (nameMatch) {
    const floodType = flood.name.split(' - ')[0];
    if (isActive) {
      clearName = `${floodType} (Active since ${monthYear})`;
    } else {
      clearName = `${floodType} (${monthYear})`;
    }
  }
  
  return {
    clearName,
    daysActive,
    isActive,
    statusLabel,
    freshness: flood.freshness || (isActive ? 'current' : 'stale')
  };
};

// =====================================================================
// TIME FILTER
// =====================================================================
const filterDataByTime = (data, timeFilter) => {
  if (timeFilter === 0) return data;
  
  const now = new Date();
  const cutoffTime = now - timeFilter;
  
  const filtered = {};
  Object.keys(data).forEach(type => {
    if (!data[type]) {
      filtered[type] = [];
      return;
    }
    
    filtered[type] = data[type].filter(item => {
      let timestamp = null;
      
      try {
        if (item.time) {
          timestamp = parseInt(item.time);
        } else if (item.date && item.time) {
          const dateStr = item.date;
          const timeStr = item.time;
          if (dateStr) {
            const fullDateTime = `${dateStr}T${timeStr.slice(0,2)}:${timeStr.slice(2)}:00Z`;
            timestamp = new Date(fullDateTime).getTime();
            if (isNaN(timestamp)) {
              timestamp = new Date(dateStr).getTime();
            }
          }
        } else if (item.date) {
          if (typeof item.date === 'string') {
            timestamp = new Date(item.date).getTime();
          } else if (typeof item.date === 'number') {
            timestamp = item.date;
          }
        } else if (item.fromDate) {
          timestamp = new Date(item.fromDate).getTime();
        } else if (item.toDate) {
          timestamp = new Date(item.toDate).getTime();
        } else if (item.lastUpdate) {
          timestamp = new Date(item.lastUpdate).getTime();
        } else if (item.onset) {
          timestamp = new Date(item.onset).getTime();
        } else if (item.updated) {
          timestamp = parseInt(item.updated);
        }
        
        if (!timestamp || isNaN(timestamp)) {
          if (type === 'volcanoes' || type === 'wildfires' || type === 'droughts' || type === 'cyclones') {
            return true;
          }
          if (type === 'fires' && item.date) {
            const dateOnly = new Date(item.date + 'T00:00:00Z').getTime();
            if (!isNaN(dateOnly)) {
              timestamp = dateOnly;
            } else {
              return true;
            }
          } else {
            return true;
          }
        }
        
        return timestamp >= cutoffTime;
        
      } catch (error) {
        console.log(`Error parsing timestamp for ${type}:`, error);
        return true;
      }
    });
  });
  
  return filtered;
};

// =====================================================================
// v3.2: MAP CONTROLLER — flies to target location when feed item clicked
// =====================================================================
const MapController = ({ flyTarget }) => {
  const map = useMap();
  
  useEffect(() => {
    if (flyTarget && flyTarget.lat != null && flyTarget.lon != null) {
      map.flyTo([flyTarget.lat, flyTarget.lon], flyTarget.zoom || 7, {
        duration: 1.4,
        easeLinearity: 0.25
      });
    }
  }, [flyTarget, map]);
  
  return null;
};

// =====================================================================
// LIVE FEED COMPONENT (Translucent Chatter Box)
// v3.2: Added click-to-fly, fixed fire timestamps, added coords to items
// =====================================================================
const FEED_ICONS = {
  earthquakes: { icon: '🌍', color: '#ff4444', label: 'Earthquake' },
  wildfires:   { icon: '🔥', color: '#ff6600', label: 'Wildfire' },
  fires:       { icon: '🔥', color: '#ff8800', label: 'Fire' },
  floods:      { icon: '🌊', color: '#4488ff', label: 'Flood' },
  cyclones:    { icon: '🌀', color: '#00ccff', label: 'Cyclone' },
  volcanoes:   { icon: '🌋', color: '#ff3333', label: 'Volcano' },
  tsunamis:    { icon: '🌊', color: '#0066ff', label: 'Tsunami' },
  droughts:    { icon: '🏜️', color: '#cc9900', label: 'Drought' },
  spaceweather:{ icon: '☀️', color: '#ff00ff', label: 'Space Weather' },
  weather:     { icon: '⚠️', color: '#ffaa00', label: 'Weather' },
};

const MAX_FEED_ITEMS = 80;

// v3.2: Proper timestamp extraction per disaster type
// Fixes "1871d ago" for FIRMS fires whose .time is "0630" (HHMM), not a unix timestamp
const getEventTimestamp = (item, type) => {
  // FIRMS fires: date = "YYYY-MM-DD", time = "HHMM" (not unix)
  if (type === 'fires' && item.date) {
    const t = item.time && /^\d{4}$/.test(item.time)
      ? `${item.time.slice(0,2)}:${item.time.slice(2)}:00`
      : '00:00:00';
    const ts = new Date(`${item.date}T${t}Z`).getTime();
    if (!isNaN(ts)) return ts;
  }
  // Earthquakes: .time is unix milliseconds
  if (type === 'earthquakes' && item.time) {
    const ts = parseInt(item.time);
    if (!isNaN(ts) && ts > 1e12) return ts;
  }
  // Weather alerts: try effective, sent, onset
  if (type === 'weather') {
    for (const field of ['effective', 'sent', 'onset', 'date']) {
      if (item[field]) {
        const d = new Date(item[field]).getTime();
        if (!isNaN(d)) return d;
      }
    }
  }
  // Generic fallbacks
  if (item.fromDate) {
    const d = new Date(item.fromDate).getTime();
    if (!isNaN(d)) return d;
  }
  if (item.lastUpdate) {
    const d = new Date(item.lastUpdate).getTime();
    if (!isNaN(d)) return d;
  }
  if (item.onset) {
    const d = new Date(item.onset).getTime();
    if (!isNaN(d)) return d;
  }
  if (item.date && typeof item.date === 'string') {
    const d = new Date(item.date).getTime();
    if (!isNaN(d)) return d;
  }
  if (item.time) {
    const ts = parseInt(item.time);
    if (!isNaN(ts) && ts > 1e12) return ts;
  }
  return Date.now();
};

const feedTimeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
};

const getEventTitle = (item, type) => {
  switch (type) {
    case 'earthquakes':
      return `M${(item.magnitude || 0).toFixed(1)} — ${item.place || item.name || 'Unknown location'}`;
    case 'wildfires':
      return item.name || item.place || 'Wildfire detected';
    case 'fires':
      return item.place || item.name || `Fire (FRP ${item.frp || '?'})`;
    case 'floods':
      return item.name || item.place || 'Flood event';
    case 'cyclones':
      return item.stormType 
        ? `${item.stormType}: ${item.name || 'Unnamed'}` 
        : item.name || 'Tropical system';
    case 'volcanoes':
      return item.name || item.place || 'Volcanic activity';
    case 'tsunamis':
      return item.name || item.place || 'Tsunami alert';
    case 'droughts':
      return item.name || item.place || 'Drought warning';
    case 'spaceweather':
      return item.name || `Kp ${item.currentKp || '?'}`;
    case 'weather':
      return item.event || item.headline || item.name || item.areas || 'Weather alert';
    default:
      return item.name || item.place || type;
  }
};

const getSeverityBadge = (item, type) => {
  switch (type) {
    case 'earthquakes': {
      const m = item.magnitude || 0;
      if (m >= 7) return { text: 'EXTREME', level: 'extreme' };
      if (m >= 6) return { text: 'SEVERE', level: 'high' };
      if (m >= 5) return { text: 'MAJOR', level: 'moderate' };
      return null;
    }
    case 'wildfires':
    case 'volcanoes':
    case 'droughts': {
      const a = item.alertLevel?.toUpperCase();
      if (a === 'RED') return { text: 'RED ALERT', level: 'extreme' };
      if (a === 'ORANGE') return { text: 'WARNING', level: 'high' };
      return null;
    }
    case 'cyclones': {
      const w = item.windSpeed || 0;
      if (w > 250) return { text: 'CAT 5', level: 'extreme' };
      if (w > 210) return { text: 'CAT 4', level: 'high' };
      if (w > 178) return { text: 'CAT 3', level: 'moderate' };
      return null;
    }
    case 'weather': {
      const sev = item.severity?.toLowerCase();
      if (sev === 'extreme') return { text: 'EXTREME', level: 'extreme' };
      if (sev === 'severe') return { text: 'SEVERE', level: 'high' };
      return null;
    }
    default:
      return null;
  }
};

// v3.2: LiveFeed now accepts onEventClick and activeEventId props
const LiveFeed = ({ data, connected, onEventClick, activeEventId }) => {
  const [feedItems, setFeedItems] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef(null);
  const prevDataRef = useRef({});
  const feedIdCounter = useRef(0);

  const detectNewEvents = useCallback((newData) => {
    const prevData = prevDataRef.current;
    const newItems = [];

    Object.keys(newData).forEach(type => {
      const currentItems = newData[type] || [];
      const prevItems = prevData[type] || [];

      const prevIds = new Set(
        prevItems.map(item => item.id || `${type}_${item.latitude}_${item.longitude}_${item.name}`)
      );

      currentItems.forEach(item => {
        const itemId = item.id || `${type}_${item.latitude}_${item.longitude}_${item.name}`;
        if (!prevIds.has(itemId)) {
          feedIdCounter.current += 1;
          // v3.2: Extract coordinates for click-to-fly
          const coords = getItemCoords(item);
          newItems.push({
            feedId: feedIdCounter.current,
            type,
            title: getEventTitle(item, type),
            severity: getSeverityBadge(item, type),
            // v3.2: Use proper timestamp parser instead of raw item.time
            timestamp: getEventTimestamp(item, type),
            arrivedAt: Date.now(),
            icon: FEED_ICONS[type]?.icon || '⚠️',
            color: FEED_ICONS[type]?.color || '#ffffff',
            label: FEED_ICONS[type]?.label || type,
            // v3.2: Store coordinates for fly-to
            lat: coords?.lat,
            lon: coords?.lon,
            raw: item,
          });
        }
      });
    });

    newItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (newItems.length > 0) {
      setFeedItems(prev => {
        const merged = [...newItems, ...prev].slice(0, MAX_FEED_ITEMS);
        return merged;
      });
      if (isMinimized) {
        setUnreadCount(prev => prev + newItems.length);
      }
    }

    prevDataRef.current = { ...newData };
  }, [isMinimized]);

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      detectNewEvents(data);
    }
  }, [data, detectNewEvents]);

  useEffect(() => {
    if (autoScroll && feedRef.current && !isMinimized) {
      feedRef.current.scrollTop = 0;
    }
  }, [feedItems, autoScroll, isMinimized]);

  const handleScroll = () => {
    if (!feedRef.current) return;
    setAutoScroll(feedRef.current.scrollTop < 20);
  };

  const toggleMinimize = () => {
    setIsMinimized(prev => {
      if (prev) setUnreadCount(0);
      return !prev;
    });
  };

  // v3.2: Handle clicking a feed item → fly to its location
  const handleItemClick = (item) => {
    if (onEventClick && item.lat != null && item.lon != null) {
      onEventClick(item);
    }
  };

  // MINIMIZED STATE
  if (isMinimized) {
    return (
      <button
        className="livefeed-minimized-pill"
        onClick={toggleMinimize}
        aria-label="Open live event feed"
      >
        <span className="pill-pulse" />
        <span className="pill-icon">📡</span>
        <span className="pill-label">LIVE</span>
        {unreadCount > 0 && (
          <span className="pill-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
    );
  }

  // EXPANDED STATE
  return (
    <div
      className={`livefeed-container ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="livefeed-header">
        <div className="livefeed-header-left">
          <span className={`livefeed-dot ${connected ? 'connected' : 'disconnected'}`} />
          <span className="livefeed-title">LIVE FEED</span>
          <span className="livefeed-count">{feedItems.length}</span>
        </div>
        <div className="livefeed-header-right">
          {!autoScroll && (
            <button
              className="livefeed-btn livefeed-btn-top"
              onClick={() => {
                if (feedRef.current) feedRef.current.scrollTop = 0;
                setAutoScroll(true);
              }}
              title="Jump to latest"
            >
              ↑ New
            </button>
          )}
          <button
            className="livefeed-btn livefeed-btn-minimize"
            onClick={toggleMinimize}
            title="Minimize feed"
          >
            ▬
          </button>
        </div>
      </div>

      <div
        className="livefeed-list"
        ref={feedRef}
        onScroll={handleScroll}
      >
        {feedItems.length === 0 ? (
          <div className="livefeed-empty">
            <span className="livefeed-empty-icon">📡</span>
            <span>Waiting for events...</span>
          </div>
        ) : (
          feedItems.map((item, idx) => (
            <div
              key={item.feedId}
              className={`livefeed-item ${idx < 3 ? 'livefeed-item-new' : ''} ${activeEventId === item.feedId ? 'livefeed-item-active' : ''}`}
              style={{
                '--accent': item.color,
                cursor: item.lat != null ? 'pointer' : 'default'
              }}
              onClick={() => handleItemClick(item)}
            >
              <div className="livefeed-item-icon" style={{ background: item.color + '22', color: item.color }}>
                {item.icon}
              </div>
              <div className="livefeed-item-body">
                <div className="livefeed-item-top">
                  <span className="livefeed-item-label" style={{ color: item.color }}>{item.label}</span>
                  {item.severity && (
                    <span className={`livefeed-severity livefeed-severity-${item.severity.level}`}>
                      {item.severity.text}
                    </span>
                  )}
                </div>
                <div className="livefeed-item-title">{item.title}</div>
                <div className="livefeed-item-time">{feedTimeAgo(item.timestamp)}</div>
              </div>
              <div className="livefeed-item-accent" style={{ background: item.color }} />
            </div>
          ))
        )}
      </div>

      <div className="livefeed-footer">
        <span className="livefeed-footer-text">
          {connected ? '⚡ streaming' : '⏸ reconnecting...'}
        </span>
      </div>
    </div>
  );
};

// =====================================================================
// REAL-TIME DATA HOOK
// =====================================================================
const useRealtimeData = () => {
  const [rawData, setRawData] = useState({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = io('/', {
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Connected to real-time updates');
      setConnected(true);
      socket.emit('subscribe', Object.keys(DISASTER_CONFIG));
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    Object.keys(DISASTER_CONFIG).forEach(type => {
      socket.on(`update:${type}`, (newData) => {
        console.log(`Received ${type} update:`, newData?.count || 0, 'items');
        setRawData(prev => ({ 
          ...prev, 
          [type]: newData?.features || []
        }));
      });
    });

    fetch('/api/aggregate')
      .then(res => res.json())
      .then(aggregateData => {
        console.log('Initial data loaded:', aggregateData);
        const processedData = {};
        
        Object.keys(aggregateData).forEach(key => {
          if (key === 'flights') return;
          
          if (key === 'earthquakesDetail') {
            processedData['earthquakes'] = aggregateData[key]?.features || [];
          } else if (key !== 'earthquakes' || !processedData['earthquakes']) {
            processedData[key] = aggregateData[key]?.features || [];
          }
          
          if (processedData[key]?.length > 0) {
            console.log(`${key}: ${processedData[key].length} items loaded`);
            const sample = processedData[key][0];
            const timestamp = sample.time || sample.date || sample.fromDate || sample.lastUpdate || sample.onset;
            console.log(`  Sample timestamp for ${key}:`, timestamp);
          }
        });
        
        setRawData(processedData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching initial data:', err);
        setLoading(false);
      });

    return () => socket.disconnect();
  }, []);

  return { rawData, connected, loading };
};

// =====================================================================
// TIME CONTROL COMPONENT
// =====================================================================
const TimeControl = ({ timeFilter, setTimeFilter, connected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const currentFilter = TIME_FILTERS.find(f => f.value === timeFilter) || TIME_FILTERS[0];
  
  return (
    <div className="time-control-container">
      <button 
        className={`time-control-button ${isExpanded ? 'expanded' : ''} ${connected ? 'connected' : 'disconnected'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '🟢' : '🔴'}
        </span>
        <span className="filter-icon">🕐</span>
        <span className="filter-label">{currentFilter.displayName}</span>
        <span className="filter-arrow">{isExpanded ? '▼' : '▲'}</span>
      </button>
      
      {isExpanded && (
        <div className="time-control-dropdown">
          {TIME_FILTERS.map(filter => (
            <button
              key={filter.value}
              className={`filter-option ${timeFilter === filter.value ? 'active' : ''}`}
              onClick={() => {
                setTimeFilter(filter.value);
                setIsExpanded(false);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// STATS DASHBOARD COMPONENT
// =====================================================================
const StatsDashboard = ({ data, enabledLayers, setEnabledLayers }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  
  const getStats = (type, items) => {
    if (!items?.length) return { severity: 'NONE', count: 0, details: '' };
    
    let details = '';
    let severity = 'LOW';
    
    switch(type) {
      case 'earthquakes': {
        const maxMag = Math.max(...items.map(e => e.magnitude || 0));
        const major = items.filter(e => e.magnitude >= 6).length;
        if (maxMag > 0) details = `M${maxMag.toFixed(1)} max`;
        if (major > 0) details += ` • ${major} major`;
        severity = maxMag >= 7 ? 'EXTREME' : maxMag >= 6 ? 'HIGH' : maxMag >= 5 ? 'MODERATE' : 'LOW';
        break;
      }
      case 'volcanoes': {
        const red = items.filter(v => v.alertLevel === 'Red').length;
        const orange = items.filter(v => v.alertLevel === 'Orange').length;
        if (red > 0) details = `${red} erupting`;
        if (orange > 0) details += details ? ` • ${orange} warning` : `${orange} warning`;
        severity = red > 0 ? 'EXTREME' : orange > 0 ? 'HIGH' : 'MODERATE';
        break;
      }
      case 'cyclones': {
        const maxWind = Math.max(...items.map(c => c.windSpeed || 0));
        const hurricanes = items.filter(c => c.stormType?.includes('Hurricane')).length;
        const typhoons = items.filter(c => c.stormType?.includes('Typhoon')).length;
        
        if (hurricanes > 0 && typhoons > 0) {
          details = `${hurricanes} hurricanes • ${typhoons} typhoons`;
        } else if (hurricanes > 0) {
          details = `${hurricanes} hurricane${hurricanes > 1 ? 's' : ''}`;
        } else if (typhoons > 0) {
          details = `${typhoons} typhoon${typhoons > 1 ? 's' : ''}`;
        } else if (maxWind > 0) {
          details = `${maxWind} km/h max`;
        }
        
        const cat5 = items.filter(c => c.windSpeed > 250).length;
        if (cat5 > 0) details += ` • ${cat5} Cat5`;
        severity = maxWind > 250 ? 'EXTREME' : maxWind > 180 ? 'HIGH' : items.length > 0 ? 'MODERATE' : 'LOW';
        break;
      }
      case 'wildfires': {
        const redWildfires = items.filter(w => w.alertLevel === 'Red').length;
        const orangeWildfires = items.filter(w => w.alertLevel === 'Orange').length;
        if (redWildfires > 0) details = `${redWildfires} critical`;
        if (orangeWildfires > 0) details += ` • ${orangeWildfires} severe`;
        severity = redWildfires > 0 ? 'HIGH' : orangeWildfires > 0 ? 'MODERATE' : 'LOW';
        break;
      }
      case 'floods': {
        const redFloods = items.filter(f => f.alertLevel === 'Red').length;
        const activeFloods = items.filter(f => {
          const info = formatFloodInfo(f);
          return info.isActive;
        }).length;
        if (redFloods > 0) details = `${redFloods} critical`;
        if (activeFloods > 0) details += ` • ${activeFloods} active now`;
        severity = redFloods > 0 ? 'HIGH' : 'MODERATE';
        break;
      }
      case 'droughts': {
        const severe2 = items.filter(d => d.alertLevel === 'Red' || d.alertLevel === 'Orange').length;
        const totalPop = items.reduce((sum, d) => sum + (d.population || 0), 0);
        if (severe2 > 0) details = `${severe2} severe`;
        if (totalPop > 0) details += ` • ${formatNumber(totalPop)} affected`;
        severity = severe2 > 5 ? 'HIGH' : 'MODERATE';
        break;
      }
      case 'fires': {
        const extreme = items.filter(f => f.frp > 500).length;
        const high = items.filter(f => f.frp > 200).length;
        if (extreme > 0) details = `${extreme} extreme`;
        if (high > 0) details += ` • ${high} high intensity`;
        severity = extreme > 10 ? 'EXTREME' : extreme > 0 ? 'HIGH' : 'MODERATE';
        break;
      }
      case 'spaceweather': {
        const kp = items[0]?.currentKp || 0;
        const sev = items[0]?.severity || 'quiet';
        details = `Kp ${kp} • ${sev}`;
        severity = kp >= 7 ? 'HIGH' : kp >= 5 ? 'MODERATE' : 'LOW';
        break;
      }
      case 'weather': {
        const extremeWeather = items.filter(w => w.severity === 'Extreme').length;
        const severeWeather = items.filter(w => w.severity === 'Severe').length;
        if (extremeWeather > 0) details = `${extremeWeather} extreme`;
        if (severeWeather > 0) details += ` • ${severeWeather} severe`;
        severity = extremeWeather > 0 ? 'HIGH' : severeWeather > 0 ? 'MODERATE' : 'LOW';
        break;
      }
      default:
        break;
    }
    
    return { severity, count: items.length, details };
  };

  const criticalCount = 
    (data.volcanoes?.filter(v => v.alertLevel === 'Red').length || 0) +
    (data.cyclones?.filter(c => c.windSpeed > 119 || c.stormType?.includes('Hurricane') || c.stormType?.includes('Typhoon')).length || 0) +
    (data.earthquakes?.filter(e => e.magnitude >= 6).length || 0);
  
  if (isMinimized) {
    return (
      <div className="stats-dashboard enhanced minimized">
        <div className="minimize-toggle" onClick={() => setIsMinimized(false)} style={{cursor:'pointer'}}>
          <span className="toggle-icon">📊</span>
          <span className="toggle-text">Stats</span>
          {criticalCount > 0 && <span className="critical-badge">{criticalCount}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="stats-dashboard enhanced">
      <div className="dashboard-header">
        <h3 className="dashboard-title">GLOBAL MONITORING</h3>
        <button className="minimize-toggle in-header" onClick={() => setIsMinimized(true)}>▬</button>
      </div>
      
      <div className="stats-grid">
        {Object.entries(DISASTER_CONFIG).map(([key, config]) => {
          const items = data[key] || [];
          const stats = getStats(key, items);
          const severityClass = `severity-${stats.severity.toLowerCase()}`;
          
          return (
            <div 
              key={key}
              className={`stat-card enhanced ${enabledLayers[key] ? 'active' : ''} ${severityClass}`}
              onClick={() => setEnabledLayers(prev => ({ ...prev, [key]: !prev[key] }))}
            >
              <div className="stat-header">
                <span className="stat-icon">{config.icon}</span>
                <span className={`stat-count ${stats.severity === 'EXTREME' ? 'pulse' : ''}`}>
                  {stats.count}
                </span>
              </div>
              <div className="stat-name">{config.name}</div>
              {stats.details && (
                <div className="stat-details">{stats.details}</div>
              )}
              {stats.severity !== 'NONE' && stats.severity !== 'LOW' && (
                <div className={`severity-badge ${severityClass}`}>
                  {stats.severity}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {criticalCount > 0 && (
        <div className="alerts-toggle">
          <button 
            className="alerts-button"
            onClick={() => setShowAlerts(!showAlerts)}
          >
            <span>⚠️ {criticalCount} Critical Alert{criticalCount > 1 ? 's' : ''}</span>
            <span className="toggle-arrow">{showAlerts ? '▼' : '▶'}</span>
          </button>
        </div>
      )}
      
      {showAlerts && (
        <div className="alerts-section">
          {data.volcanoes?.filter(v => v.alertLevel === 'Red').map((volcano, i) => (
            <div key={i} className="critical-alert volcano">
              🌋 ERUPTION: {volcano.name} - {volcano.country}
            </div>
          ))}
          {data.cyclones?.filter(c => c.windSpeed > 119 || c.stormType?.includes('Hurricane') || c.stormType?.includes('Typhoon')).map((cyclone, i) => (
            <div key={i} className="critical-alert cyclone">
              🌀 {cyclone.stormType || 'CYCLONE'}: {cyclone.name || 'Unnamed'} - {cyclone.windSpeed ? `${cyclone.windSpeed} km/h` : cyclone.category || ''}
            </div>
          ))}
          {data.earthquakes?.filter(e => e.magnitude >= 6).slice(0, 3).map((eq, i) => (
            <div key={i} className="critical-alert earthquake">
              🌍 M{eq.magnitude?.toFixed(1)} - {eq.place} - {formatTime(eq.time)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// POPUP CONTENT COMPONENT
// =====================================================================
const PopupContent = ({ item, type, config }) => {
  const severity = config.getSeverity ? config.getSeverity(item) : 'UNKNOWN';
  const severityClass = `severity-${severity.toLowerCase().replace(/ /g, '-')}`;
  
  const floodInfo = type === 'floods' ? formatFloodInfo(item) : null;
  
  return (
    <div className="popup-content enhanced">
      <div className="popup-header">
        <span className="popup-icon">{config.icon}</span>
        <div className="popup-title-section">
          <div className="popup-title">
            {type === 'floods' && floodInfo ? 
              floodInfo.clearName : 
              (item.name || item.place || item.event || config.name)
            }
          </div>
          <div className={`popup-severity ${severityClass}`}>
            {severity}
          </div>
        </div>
      </div>
      
      <div className="popup-details">
        {/* WILDFIRES */}
        {type === 'wildfires' && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              marginBottom: '10px',
              fontSize: '12px',
              fontWeight: 600,
              background: item.isActive ? 'rgba(255, 68, 0, 0.15)' : 'rgba(76, 175, 80, 0.15)',
              border: item.isActive ? '1px solid rgba(255, 68, 0, 0.4)' : '1px solid rgba(76, 175, 80, 0.4)',
              color: item.isActive ? '#ff6600' : '#4caf50'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: item.isActive ? '#ff4400' : '#4caf50',
                boxShadow: item.isActive ? '0 0 6px rgba(255, 68, 0, 0.6)' : 'none',
                flexShrink: 0
              }}></span>
              <span style={{ flex: 1 }}>
                {item.isActive ? '🔥 ACTIVELY BURNING' : 
                 item.status === 'just_ended' ? '✅ JUST CONTAINED' : 
                 '✅ CONTAINED'}
              </span>
              {item.lastUpdate && (
                <span style={{ fontSize: '10px', opacity: 0.7, fontWeight: 400 }}>
                  Updated: {formatTime(new Date(item.lastUpdate).getTime())}
                </span>
              )}
            </div>

            <div className="detail-row">
              <strong>Alert Level:</strong> 
              <span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>
                {item.alertLevel}
              </span>
            </div>
            <div className="detail-row">
              <strong>Country:</strong> 
              <span className="detail-value">{item.country}</span>
            </div>
            {item.affectedArea > 0 && (
              <div className="detail-row">
                <strong>Affected Area:</strong> 
                <span className="detail-value highlight">{formatNumber(item.affectedArea)} km²</span>
              </div>
            )}
            {item.population > 0 && (
              <div className="detail-row">
                <strong>Population at Risk:</strong> 
                <span className="detail-value highlight">{formatNumber(item.population)}</span>
              </div>
            )}
            {item.daysSinceStart > 0 && (
              <div className="detail-row">
                <strong>Duration:</strong> 
                <span className="detail-value">
                  {item.daysSinceStart} day{item.daysSinceStart !== 1 ? 's' : ''}
                  {item.isActive ? ' (ongoing)' : ''}
                </span>
              </div>
            )}
            {item.fromDate && (
              <div className="detail-row">
                <strong>Started:</strong> 
                <span className="detail-value">{new Date(item.fromDate).toLocaleDateString()}</span>
              </div>
            )}
            {!item.isActive && item.toDate && (
              <div className="detail-row">
                <strong>Ended:</strong> 
                <span className="detail-value">{new Date(item.toDate).toLocaleDateString()}</span>
              </div>
            )}
            {item.freshness && item.freshness === 'stale' && (
              <div style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                marginTop: '6px',
                background: 'rgba(255, 152, 0, 0.15)',
                color: '#ff9800',
                border: '1px solid rgba(255, 152, 0, 0.3)'
              }}>
                ⚠️ Data may be outdated
              </div>
            )}
            {item.description && (
              <div className="detail-description">{item.description}</div>
            )}
          </>
        )}

        {/* FLOODS */}
        {type === 'floods' && (
          <>
            {floodInfo && floodInfo.isActive && (
              <div className="active-flood-badge">
                <span className="badge-icon">🔴</span>
                <span className="badge-text">ACTIVE NOW - Day {floodInfo.daysActive}</span>
              </div>
            )}
            {floodInfo && !floodInfo.isActive && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '8px',
                background: 'rgba(158, 158, 158, 0.15)',
                color: '#9e9e9e',
                border: '1px solid rgba(158, 158, 158, 0.3)'
              }}>
                <span>⚪</span>
                <span>{floodInfo.statusLabel || 'Event has ended'}</span>
              </div>
            )}
            
            <div className="detail-row">
              <strong>Alert Level:</strong> 
              <span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>
                {item.alertLevel}
              </span>
            </div>
            <div className="detail-row">
              <strong>Country:</strong> 
              <span className="detail-value">{item.country}</span>
            </div>
            {item.fromDate && (
              <div className="detail-row">
                <strong>{floodInfo?.isActive ? 'Active for:' : 'Duration:'}</strong> 
                <span className="detail-value">
                  {floodInfo?.daysActive} day{floodInfo?.daysActive !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {item.population > 0 && (
              <div className="detail-row">
                <strong>Population Affected:</strong> 
                <span className="detail-value highlight">{formatNumber(item.population)}</span>
              </div>
            )}
            {item.affectedArea > 0 && (
              <div className="detail-row">
                <strong>Area:</strong> 
                <span className="detail-value">{formatNumber(item.affectedArea)} km²</span>
              </div>
            )}
            {item.fromDate && (
              <div className="detail-row">
                <strong>Started:</strong> 
                <span className="detail-value">
                  {new Date(item.fromDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {!floodInfo?.isActive && item.toDate && (
              <div className="detail-row">
                <strong>Ended:</strong> 
                <span className="detail-value">{new Date(item.toDate).toLocaleDateString()}</span>
              </div>
            )}
            {(item.freshness === 'stale' || (floodInfo && !floodInfo.isActive && floodInfo.freshness === 'stale')) && (
              <div style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                marginTop: '6px',
                background: 'rgba(255, 152, 0, 0.15)',
                color: '#ff9800',
                border: '1px solid rgba(255, 152, 0, 0.3)'
              }}>
                ⚠️ Data may be outdated — last verified over 72 hours ago
              </div>
            )}
            {item.source && (
              <div className="detail-row">
                <strong>Source:</strong> 
                <span className="detail-value">{item.source}</span>
              </div>
            )}
            {item.description && (
              <div className="detail-description">{item.description}</div>
            )}
          </>
        )}

        {/* EARTHQUAKES */}
        {type === 'earthquakes' && (
          <>
            <div className="detail-row">
              <strong>Magnitude:</strong> 
              <span className="detail-value highlight">M{item.magnitude?.toFixed(1)}</span>
            </div>
            <div className="detail-row">
              <strong>Depth:</strong> 
              <span className="detail-value">{item.depth?.toFixed(1)} km</span>
            </div>
            {item.felt > 0 && (
              <div className="detail-row">
                <strong>Felt Reports:</strong> 
                <span className="detail-value">{item.felt}</span>
              </div>
            )}
            {item.alert && (
              <div className="detail-row">
                <strong>Alert:</strong> 
                <span className={`detail-value alert-${item.alert?.toLowerCase()}`}>
                  {item.alert}
                </span>
              </div>
            )}
            {item.tsunami === 1 && (
              <div className="alert-box tsunami">⚠️ TSUNAMI WARNING</div>
            )}
            {item.time && (
              <div className="detail-row">
                <strong>Time:</strong> 
                <span className="detail-value">{formatTime(item.time)}</span>
              </div>
            )}
          </>
        )}
        
        {/* VOLCANOES */}
        {type === 'volcanoes' && (
          <>
            <div className="detail-row">
              <strong>Alert Level:</strong> 
              <span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>
                {item.alertLevel}
              </span>
            </div>
            <div className="detail-row">
              <strong>Country:</strong> 
              <span className="detail-value">{item.country}</span>
            </div>
            {item.population > 0 && (
              <div className="detail-row">
                <strong>Population at Risk:</strong> 
                <span className="detail-value highlight">{formatNumber(item.population)}</span>
              </div>
            )}
            {item.vei > 0 && (
              <div className="detail-row">
                <strong>VEI:</strong> 
                <span className="detail-value">{item.vei}</span>
              </div>
            )}
            {item.lastUpdate && (
              <div className="detail-row">
                <strong>Updated:</strong> 
                <span className="detail-value">{formatTime(item.lastUpdate)}</span>
              </div>
            )}
          </>
        )}
        
        {/* CYCLONES */}
        {type === 'cyclones' && (
          <>
            <div className="detail-row">
              <strong>Storm Type:</strong> 
              <span className="detail-value highlight">{item.stormType || 'Tropical Cyclone'}</span>
            </div>
            <div className="detail-row">
              <strong>Category:</strong> 
              <span className="detail-value highlight">{item.category || 'Unknown'}</span>
            </div>
            {item.windSpeed > 0 && (
              <div className="detail-row">
                <strong>Wind Speed:</strong> 
                <span className="detail-value">{item.windSpeed} km/h ({Math.round(item.windSpeed * 0.621371)} mph)</span>
              </div>
            )}
            {item.pressure > 0 && item.pressure < 1000 && (
              <div className="detail-row">
                <strong>Pressure:</strong> 
                <span className="detail-value">{item.pressure} mb</span>
              </div>
            )}
            {item.affectedCountries?.length > 0 && (
              <div className="detail-row">
                <strong>Affected Areas:</strong> 
                <span className="detail-value">{item.affectedCountries.join(', ')}</span>
              </div>
            )}
            {item.population > 0 && (
              <div className="detail-row">
                <strong>Population at Risk:</strong> 
                <span className="detail-value highlight">{formatNumber(item.population)}</span>
              </div>
            )}
            {item.isActive && (
              <div className="active-flood-badge" style={{background: 'rgba(0, 255, 204, 0.2)', borderColor: 'rgba(0, 255, 204, 0.5)'}}>
                <span className="badge-icon">🌀</span>
                <span className="badge-text" style={{color: '#00ffcc'}}>ACTIVE STORM</span>
              </div>
            )}
          </>
        )}
        
        {/* DROUGHTS */}
        {type === 'droughts' && (
          <>
            <div className="detail-row">
              <strong>Alert Level:</strong> 
              <span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>
                {item.alertLevel}
              </span>
            </div>
            <div className="detail-row">
              <strong>Country:</strong> 
              <span className="detail-value">{item.country}</span>
            </div>
            {item.population > 0 && (
              <div className="detail-row">
                <strong>Population Affected:</strong> 
                <span className="detail-value highlight">{formatNumber(item.population)}</span>
              </div>
            )}
            {item.duration > 0 && (
              <div className="detail-row">
                <strong>Duration:</strong> 
                <span className="detail-value">{item.duration} days</span>
              </div>
            )}
          </>
        )}
        
        {/* FIRES (FIRMS) */}
        {type === 'fires' && (
          <>
            <div className="detail-row">
              <strong>Intensity (FRP):</strong> 
              <span className="detail-value highlight">{item.frp?.toFixed(1)} MW</span>
            </div>
            <div className="detail-row">
              <strong>Brightness:</strong> 
              <span className="detail-value">{item.brightness?.toFixed(1)}K</span>
            </div>
            <div className="detail-row">
              <strong>Confidence:</strong> 
              <span className="detail-value">{item.confidence}</span>
            </div>
            <div className="detail-row">
              <strong>Satellite:</strong> 
              <span className="detail-value">{item.satellite}</span>
            </div>
            <div className="detail-row">
              <strong>Detected:</strong> 
              <span className="detail-value">{item.date} {item.time}</span>
            </div>
          </>
        )}
        
        {/* WEATHER */}
        {type === 'weather' && (
          <>
            <div className="detail-row">
              <strong>Severity:</strong> 
              <span className={`detail-value severity-${item.severity?.toLowerCase()}`}>
                {item.severity}
              </span>
            </div>
            <div className="detail-row">
              <strong>Urgency:</strong> 
              <span className="detail-value">{item.urgency}</span>
            </div>
            {item.areas && (
              <div className="detail-row">
                <strong>Areas:</strong> 
                <span className="detail-value">{item.areas}</span>
              </div>
            )}
            {item.headline && (
              <div className="detail-description">{item.headline}</div>
            )}
          </>
        )}
        
        {/* LOCATION FOR ALL TYPES */}
        {(item.coordinates || (item.latitude && item.longitude)) && (
          <div className="detail-row coordinates">
            <strong>Location:</strong> 
            <span className="detail-value">
              {item.coordinates 
                ? `${item.coordinates[1]?.toFixed(3)}, ${item.coordinates[0]?.toFixed(3)}`
                : `${item.latitude?.toFixed(3)}, ${item.longitude?.toFixed(3)}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================================================
// MAIN APP COMPONENT
// v3.2: Added flyTarget, activeEventId, highlightPos state + MapController
// =====================================================================
function App() {
  const { rawData, connected, loading } = useRealtimeData();
  const [timeFilter, setTimeFilter] = useState(0);
  const [enabledLayers, setEnabledLayers] = useState(
    Object.keys(DISASTER_CONFIG).reduce((acc, key) => ({ 
      ...acc, 
      [key]: DISASTER_CONFIG[key].enabled 
    }), {})
  );
  // v3.2: Click-to-fly state
  const [flyTarget, setFlyTarget] = useState(null);
  const [activeEventId, setActiveEventId] = useState(null);
  const [highlightPos, setHighlightPos] = useState(null);
  const highlightTimer = useRef(null);

  const data = filterDataByTime(rawData, timeFilter);

  // v3.2: Handle feed item click → fly to location + highlight on map
  const handleFeedClick = useCallback((feedItem) => {
    // Fly to the event's location
    setFlyTarget({
      lat: feedItem.lat,
      lon: feedItem.lon,
      zoom: 7,
      _ts: Date.now() // force re-trigger even if same location
    });
    // Mark it active in the feed
    setActiveEventId(feedItem.feedId);
    // Show highlight ring on the map
    setHighlightPos({
      lat: feedItem.lat,
      lon: feedItem.lon,
      color: feedItem.color
    });
    // Clear highlight after 8 seconds
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightPos(null);
      setActiveEventId(null);
    }, 8000);
  }, []);

  const renderDisasterMarkers = (items, type) => {
    if (!enabledLayers[type] || !items?.length) return null;
    
    const config = DISASTER_CONFIG[type];
    const markers = [];
    
    items.forEach((item, index) => {
      let lat, lon;
      
      if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
        lon = item.coordinates[0];
        lat = item.coordinates[1];
      } else if (item.latitude !== undefined && item.longitude !== undefined) {
        lat = item.latitude;
        lon = item.longitude;
      } else {
        return;
      }
      
      if (isNaN(lat) || isNaN(lon)) return;
      if (lat === 0 && lon === 0) return; // skip null-island fallbacks
      
      const radius = config.getRadius ? config.getRadius(item) : 8;
      const opacity = config.getOpacity ? config.getOpacity(item) : 0.6;
      const severity = config.getSeverity ? config.getSeverity(item) : '';
      
      const floodInfo = type === 'floods' ? formatFloodInfo(item) : null;
      const displayName = type === 'floods' ? 
        floodInfo.clearName : 
        type === 'cyclones' && item.stormType ?
        `${item.stormType}: ${item.name}` :
        (item.name || item.place || config.name);
      
      markers.push(
        <CircleMarker
          key={`${type}_${item.id || index}`}
          center={[lat, lon]}
          radius={radius}
          fillColor={config.color}
          color={config.color}
          weight={2}
          opacity={opacity + 0.2}
          fillOpacity={opacity}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
            <div className="tooltip-content">
              <strong>{config.icon} {severity}</strong>
              <br />
              {displayName}
              {type === 'floods' && floodInfo?.isActive && (
                <>
                  <br />
                  <span style={{color: '#ff6666', fontSize: '0.7em'}}>
                    ⚠️ ACTIVE - Day {floodInfo.daysActive}
                  </span>
                </>
              )}
              {type === 'floods' && floodInfo && !floodInfo.isActive && (
                <>
                  <br />
                  <span style={{color: '#999', fontSize: '0.7em'}}>
                    {floodInfo.statusLabel || 'Ended'}
                  </span>
                </>
              )}
              {type === 'cyclones' && item.isActive && (
                <>
                  <br />
                  <span style={{color: '#00ffcc', fontSize: '0.7em'}}>
                    ⚠️ ACTIVE STORM
                  </span>
                </>
              )}
            </div>
          </Tooltip>
          <Popup>
            <PopupContent item={item} type={type} config={config} />
          </Popup>
        </CircleMarker>
      );
    });
    
    return markers;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">🌍</div>
        <div>Loading Real-Time Disaster Data...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="map-container"
        zoomControl={false}
        worldCopyJump={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        
        {/* v3.2: Fly-to controller for feed click navigation */}
        <MapController flyTarget={flyTarget} />
        
        {Object.keys(data).map(type => 
          renderDisasterMarkers(data[type], type)
        )}

        {/* v3.2: Pulsing highlight rings when feed item is clicked */}
        {highlightPos && (
          <>
            <CircleMarker
              center={[highlightPos.lat, highlightPos.lon]}
              radius={22}
              fillColor="transparent"
              color={highlightPos.color || '#ffffff'}
              weight={3}
              opacity={0.9}
              fillOpacity={0}
              className="highlight-ring"
            />
            <CircleMarker
              center={[highlightPos.lat, highlightPos.lon]}
              radius={35}
              fillColor="transparent"
              color={highlightPos.color || '#ffffff'}
              weight={1.5}
              opacity={0.4}
              fillOpacity={0}
              className="highlight-ring-outer"
            />
          </>
        )}
      </MapContainer>
      
      <StatsDashboard 
        data={data} 
        enabledLayers={enabledLayers}
        setEnabledLayers={setEnabledLayers}
      />
      
      <TimeControl 
        timeFilter={timeFilter} 
        setTimeFilter={setTimeFilter}
        connected={connected}
      />

      {/* LIVE FEED - Translucent Chatter Box */}
      {/* v3.2: Now with click-to-fly via onEventClick + activeEventId */}
      <LiveFeed
        data={data}
        connected={connected}
        onEventClick={handleFeedClick}
        activeEventId={activeEventId}
      />
    </div>
  );
}

export default App;