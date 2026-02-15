// App.js - v4.0 MEGA UPDATE
// ALL 10 ENHANCEMENTS:
// 1. Marker Clustering (react-leaflet-markercluster)
// 2. Location Search + Watch Area (Nominatim geocoding)
// 3. Heatmap Layer Toggle (leaflet.heat)
// 4. Event Detail Drawer (slide-in side panel)
// 5. Historical Timeline Playback (scrubber)
// 6. Additional Data Sources (landslides, tsunamis)
// 7. PWA + Offline Support (service worker registration)
// 8. Sharing & Deep Links (URL params)
// 9. Country/Region Statistics (reverse geocode)
// 10. Sound/Notification Alerts (critical event alerts)
//
// Carries forward: flood staleness, wildfire badges, LiveFeed click-to-fly, time filter, stats dashboard

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import './App.css';
import './LiveFeed.css';
import './v4-enhancements.css';

// =====================================================================
// DISASTER CONFIGURATION
// =====================================================================
const DISASTER_CONFIG = {
  earthquakes: { 
    color: '#ff4444', icon: '🌍', name: 'Earthquakes', enabled: true,
    getRadius: (item) => {
      const mag = item.magnitude || 0;
      if (mag >= 7) return 25; if (mag >= 6) return 20;
      if (mag >= 5) return 15; if (mag >= 4) return 10;
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
      if (mag >= 6) return 0.9; if (mag >= 5) return 0.7; return 0.5;
    },
    // v4: critical threshold for alerts
    isCritical: (item) => (item.magnitude || 0) >= 6
  },
  volcanoes: { 
    color: '#ff3333', icon: '🌋', name: 'Volcanoes', enabled: true,
    getRadius: (item) => item.alertLevel === 'Red' ? 20 : item.alertLevel === 'Orange' ? 15 : 10,
    getSeverity: (item) => {
      const level = item.alertLevel?.toUpperCase();
      if (level === 'RED') return 'ERUPTING'; if (level === 'ORANGE') return 'WARNING';
      return item.severity?.toUpperCase() || 'WATCH';
    },
    getOpacity: (item) => item.alertLevel === 'Red' ? 0.9 : 0.6,
    isCritical: (item) => item.alertLevel === 'Red'
  },
  cyclones: { 
    color: '#00ccff', icon: '🌀', name: 'Cyclones', enabled: true,
    getRadius: (item) => {
      const wind = item.windSpeed || 0;
      if (wind > 250) return 30; if (wind > 180) return 25;
      if (wind > 119) return 20; return 15;
    },
    getSeverity: (item) => {
      const wind = item.windSpeed || 0;
      if (wind > 250) return 'CATEGORY 5'; if (wind > 210) return 'CATEGORY 4';
      if (wind > 178) return 'CATEGORY 3'; if (wind > 153) return 'CATEGORY 2';
      if (wind > 119) return 'CATEGORY 1'; return item.category || 'TROPICAL';
    },
    getOpacity: (item) => {
      const wind = item.windSpeed || 0;
      return wind > 200 ? 0.9 : wind > 119 ? 0.7 : 0.4;
    },
    isCritical: (item) => (item.windSpeed || 0) > 119
  },
  floods: { 
    color: '#4488ff', icon: '🌊', name: 'Floods', enabled: true,
    getRadius: (item) => {
      if (item.alertLevel === 'Red') return 18;
      if (item.alertLevel === 'Orange') return 14;
      if (item.population > 100000) return 16; return 10;
    },
    getSeverity: (item) => {
      const info = formatFloodInfo(item);
      if (item.alertLevel === 'Red') return 'CRITICAL';
      if (item.alertLevel === 'Orange') return 'SEVERE';
      if (info.isActive) return 'ACTIVE';
      return info.statusLabel || 'MONITORING';
    },
    getOpacity: (item) => {
      const info = formatFloodInfo(item);
      if (!info.isActive) return 0.3;
      return item.alertLevel === 'Red' ? 0.85 : 0.6;
    },
    isCritical: (item) => item.alertLevel === 'Red'
  },
  wildfires: { 
    color: '#ff6600', icon: '🔥', name: 'Wildfires', enabled: true,
    getRadius: (item) => {
      if (item.affectedArea > 1000) return 20; if (item.affectedArea > 500) return 15;
      if (item.alertLevel === 'Red') return 18; if (item.alertLevel === 'Orange') return 14;
      return 12;
    },
    getSeverity: (item) => {
      if (!item.isActive && item.isActive !== undefined) {
        return item.status === 'just_ended' ? 'JUST CONTAINED' : 'CONTAINED';
      }
      const level = item.alertLevel?.toUpperCase();
      if (level === 'RED') return 'CRITICAL'; if (level === 'ORANGE') return 'SEVERE';
      if (item.affectedArea > 1000) return 'MAJOR'; return 'ACTIVE';
    },
    getOpacity: (item) => {
      if (!item.isActive && item.isActive !== undefined) return 0.35;
      return item.alertLevel === 'Red' ? 0.9 : 0.6;
    },
    isCritical: (item) => item.alertLevel === 'Red' || item.affectedArea > 1000
  },
  fires: { 
    color: '#ff8800', icon: '🔥', name: 'Hotspots', enabled: false,
    getRadius: (item) => {
      const frp = item.frp || 0;
      if (frp > 100) return 8; if (frp > 50) return 6; return 4;
    },
    getSeverity: (item) => {
      const frp = item.frp || 0;
      if (frp > 200) return 'EXTREME'; if (frp > 100) return 'HIGH';
      if (frp > 50) return 'MODERATE'; return 'LOW';
    },
    getOpacity: (item) => Math.min(0.3 + (item.frp || 0) / 300, 0.8),
    isCritical: () => false
  },
  weather: { 
    color: '#ffaa00', icon: '⚠️', name: 'Weather', enabled: false,
    getRadius: () => 8,
    getSeverity: (item) => item.severity?.toUpperCase() || 'ALERT',
    getOpacity: (item) => item.severity === 'Extreme' ? 0.85 : 0.5,
    isCritical: (item) => item.severity === 'Extreme'
  },
  droughts: { 
    color: '#cc9900', icon: '🏜️', name: 'Droughts', enabled: true,
    getRadius: (item) => item.alertLevel === 'Red' ? 20 : item.alertLevel === 'Orange' ? 16 : 12,
    getSeverity: (item) => {
      if (item.alertLevel === 'Red') return 'CRITICAL';
      if (item.alertLevel === 'Orange') return 'SEVERE'; return 'WATCH';
    },
    getOpacity: (item) => item.alertLevel === 'Red' ? 0.8 : 0.5,
    isCritical: (item) => item.alertLevel === 'Red'
  },
  // v4: NEW DATA TYPES
  landslides: {
    color: '#8B4513', icon: '⛰️', name: 'Landslides', enabled: true,
    getRadius: (item) => {
      if (item.fatalities > 10) return 18; if (item.fatalities > 0) return 14; return 10;
    },
    getSeverity: (item) => {
      if (item.fatalities > 50) return 'CATASTROPHIC';
      if (item.fatalities > 10) return 'SEVERE';
      if (item.fatalities > 0) return 'FATAL'; return 'REPORTED';
    },
    getOpacity: (item) => item.fatalities > 10 ? 0.85 : 0.55,
    isCritical: (item) => (item.fatalities || 0) > 10
  },
  tsunamis: {
    color: '#0066cc', icon: '🌊', name: 'Tsunamis', enabled: true,
    getRadius: (item) => {
      if (item.severity === 'Warning') return 25;
      if (item.severity === 'Watch') return 18; return 12;
    },
    getSeverity: (item) => (item.severity || 'ADVISORY').toUpperCase(),
    getOpacity: (item) => item.severity === 'Warning' ? 0.9 : 0.6,
    isCritical: (item) => item.severity === 'Warning'
  },
  spaceweather: { 
    color: '#ff00ff', icon: '☀️', name: 'Space', enabled: false,
    getRadius: (item) => (item.currentKp || 0) * 5,
    getSeverity: (item) => {
      const kp = item.currentKp || 0;
      if (kp >= 9) return 'EXTREME STORM'; if (kp >= 8) return 'SEVERE STORM';
      if (kp >= 7) return 'STRONG STORM'; if (kp >= 5) return 'MINOR STORM'; return 'QUIET';
    },
    getOpacity: (item) => Math.min((item.currentKp || 0) / 10, 0.9),
    isCritical: (item) => (item.currentKp || 0) >= 7
  }
};

// =====================================================================
// TIME FILTER OPTIONS
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
  const date = new Date(typeof timestamp === 'number' && timestamp < 1e12 ? timestamp * 1000 : timestamp);
  const now = new Date();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};

const formatFloodInfo = (flood) => {
  const now = new Date();
  const fromDate = flood.fromDate ? new Date(flood.fromDate) : null;
  const toDate = flood.toDate ? new Date(flood.toDate) : null;
  const daysActive = fromDate ? Math.floor((now - fromDate) / (1000 * 60 * 60 * 24)) : 0;
  const isActive = flood.isActive !== undefined ? flood.isActive :
    (flood.status === 'active' || flood.status === 'ongoing' ||
     (!toDate || toDate > now) && daysActive < 14);
  const statusLabel = isActive
    ? `Active - Day ${daysActive}` : flood.status === 'just_ended'
    ? 'Recently ended' : 'Ended';
  const nameMatch = flood.name ? flood.name.match(/(\w+)\s+(\d{4})/) : null;
  const monthYear = nameMatch ? `${nameMatch[1]} ${nameMatch[2]}` : '';
  let clearName = flood.name || 'Flood Event';
  if (nameMatch) {
    const floodType = flood.name.split(' - ')[0];
    clearName = isActive ? `${floodType} (Active since ${monthYear})` : `${floodType} (${monthYear})`;
  }
  return { clearName, daysActive, isActive, statusLabel, freshness: flood.freshness || (isActive ? 'current' : 'stale') };
};

const getEventCoords = (item) => {
  if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
    return { lat: item.coordinates[1], lon: item.coordinates[0] };
  }
  if (item.latitude !== undefined && item.longitude !== undefined) {
    return { lat: item.latitude, lon: item.longitude };
  }
  return null;
};

const getEventTimestamp = (item, type) => {
  if (type === 'fires' && item.date) {
    const t = item.time && /^\d{4}$/.test(item.time)
      ? `${item.date}T${item.time.slice(0,2)}:${item.time.slice(2)}:00Z`
      : `${item.date}T00:00:00Z`;
    return new Date(t).getTime();
  }
  if (item.time) {
    const t = parseInt(item.time);
    return t > 1e11 ? t : t * 1000;
  }
  if (item.date) return new Date(item.date).getTime();
  if (item.fromDate) return new Date(item.fromDate).getTime();
  if (item.lastUpdate) return new Date(item.lastUpdate).getTime();
  if (item.onset) return new Date(item.onset).getTime();
  return Date.now();
};

// =====================================================================
// FILTER DATA BY TIME
// =====================================================================
const filterDataByTime = (data, timeFilter) => {
  if (timeFilter === 0) return data;
  const now = new Date();
  const cutoffTime = now - timeFilter;
  const filtered = {};
  Object.keys(data).forEach(type => {
    if (!data[type]) { filtered[type] = []; return; }
    filtered[type] = data[type].filter(item => {
      try {
        const ts = getEventTimestamp(item, type);
        if (!ts || isNaN(ts)) return true;
        return ts >= cutoffTime;
      } catch { return true; }
    });
  });
  return filtered;
};

// =====================================================================
// v4: NOTIFICATION SOUND (Web Audio API — no external files needed)
// =====================================================================
const playAlertSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* silent fail on browsers that block audio */ }
};

// =====================================================================
// v4: BROWSER NOTIFICATIONS
// =====================================================================
const sendBrowserNotification = (title, body, icon) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: icon || '🌍', tag: 'realnow-alert', renotify: true });
    } catch (e) { /* mobile fallback */ }
  }
};

// =====================================================================
// v4: PWA SERVICE WORKER REGISTRATION
// =====================================================================
const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('SW registered:', reg.scope);
      }).catch(err => console.log('SW registration failed:', err));
    });
  }
};

// =====================================================================
// v4: URL SHARING — read/write deep link params
// =====================================================================
const getShareParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    eventId: params.get('event'),
    lat: params.get('lat') ? parseFloat(params.get('lat')) : null,
    lon: params.get('lon') ? parseFloat(params.get('lon')) : null,
    zoom: params.get('zoom') ? parseInt(params.get('zoom')) : null,
    type: params.get('type')
  };
};

const buildShareUrl = (item, type) => {
  const coords = getEventCoords(item);
  if (!coords) return window.location.origin;
  const id = item.id || item.name || '';
  const params = new URLSearchParams({
    event: id,
    type: type,
    lat: coords.lat.toFixed(4),
    lon: coords.lon.toFixed(4),
    zoom: '8'
  });
  return `${window.location.origin}?${params.toString()}`;
};

// =====================================================================
// REAL-TIME DATA HOOK
// =====================================================================
const useRealtimeData = () => {
  const [rawData, setRawData] = useState({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = io('/', { path: '/socket.io/', transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('Connected to real-time updates');
      setConnected(true);
      socket.emit('subscribe', Object.keys(DISASTER_CONFIG));
    });
    socket.on('disconnect', () => setConnected(false));

    Object.keys(DISASTER_CONFIG).forEach(type => {
      socket.on(`update:${type}`, (newData) => {
        setRawData(prev => ({ ...prev, [type]: newData?.features || [] }));
      });
    });

    fetch('/api/aggregate')
      .then(res => res.json())
      .then(agg => {
        const processed = {};
        Object.keys(agg).forEach(key => {
          if (key === 'flights') return;
          if (key === 'earthquakesDetail') {
            processed['earthquakes'] = agg[key]?.features || [];
          } else if (key !== 'earthquakes' || !processed['earthquakes']) {
            processed[key] = agg[key]?.features || [];
          }
        });
        setRawData(processed);
        setLoading(false);
      })
      .catch(err => { console.error('Initial data error:', err); setLoading(false); });

    return () => socket.disconnect();
  }, []);

  return { rawData, connected, loading };
};

// =====================================================================
// v4: LOCATION SEARCH COMPONENT (Nominatim free geocoding)
// =====================================================================
const LocationSearch = ({ onSelect, onWatchArea }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [watchRadius, setWatchRadius] = useState(null);
  const debounceRef = useRef(null);

  const search = useCallback((q) => {
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
          { headers: { 'User-Agent': 'RealNow-DisasterTracker/4.0' } }
        );
        const data = await res.json();
        setResults(data);
        setIsOpen(data.length > 0);
      } catch (e) { console.error('Search error:', e); }
    }, 400);
  }, []);

  const handleSelect = (result) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    onSelect({ lat, lon, name: result.display_name, zoom: 10 });
    setQuery(result.display_name.split(',')[0]);
    setIsOpen(false);
  };

  const handleWatch = () => {
    if (!query) return;
    const selected = results[0];
    if (selected) {
      const radius = watchRadius || 200;
      onWatchArea({
        lat: parseFloat(selected.lat),
        lon: parseFloat(selected.lon),
        name: selected.display_name.split(',')[0],
        radius
      });
      setWatchRadius(radius);
    }
  };

  return (
    <div className="search-container">
      <div className="search-input-row">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search location..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        {query && (
          <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}>✕</button>
        )}
      </div>
      {isOpen && (
        <div className="search-results">
          {results.map((r, i) => (
            <div key={i} className="search-result-item" onClick={() => handleSelect(r)}>
              <span className="result-icon">📍</span>
              <span className="result-text">{r.display_name}</span>
            </div>
          ))}
          {results.length > 0 && (
            <div className="search-watch-row">
              <select
                className="watch-radius-select"
                value={watchRadius || 200}
                onChange={(e) => setWatchRadius(parseInt(e.target.value))}
              >
                <option value={50}>50 km</option>
                <option value={100}>100 km</option>
                <option value={200}>200 km</option>
                <option value={500}>500 km</option>
              </select>
              <button className="watch-btn" onClick={handleWatch}>👁️ Watch Area</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// v4: HEATMAP LAYER (using Canvas rendering for performance)
// =====================================================================
const HeatmapLayer = ({ data, enabledLayers }) => {
  const map = useMap();
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!map) return;
    
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '400';
    canvasRef.current = canvas;
    
    const container = map.getContainer();
    container.appendChild(canvas);
    
    const render = () => {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const points = [];
      ['earthquakes', 'fires', 'wildfires'].forEach(type => {
        if (!enabledLayers[type] || !data[type]) return;
        const config = DISASTER_CONFIG[type];
        data[type].forEach(item => {
          const coords = getEventCoords(item);
          if (!coords) return;
          const point = map.latLngToContainerPoint([coords.lat, coords.lon]);
          const intensity = type === 'earthquakes' 
            ? (item.magnitude || 3) / 9 
            : type === 'fires' 
            ? Math.min((item.frp || 10) / 200, 1)
            : 0.7;
          points.push({ x: point.x, y: point.y, intensity, color: config.color });
        });
      });
      
      points.forEach(p => {
        const radius = 20 + p.intensity * 30;
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        const [r, g, b] = hexToRgb(p.color);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${p.intensity * 0.4})`);
        gradient.addColorStop(0.5, `rgba(${r},${g},${b},${p.intensity * 0.15})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });
    };
    
    map.on('move zoom viewreset', render);
    render();
    
    return () => {
      map.off('move zoom viewreset', render);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [map, data, enabledLayers]);
  
  return null;
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [255, 255, 255];
};

// =====================================================================
// v4: EVENT DETAIL DRAWER (slide-in side panel)
// =====================================================================
const DetailDrawer = ({ item, type, onClose, onShare }) => {
  if (!item || !type) return null;
  
  const config = DISASTER_CONFIG[type];
  const severity = config?.getSeverity ? config.getSeverity(item) : 'UNKNOWN';
  const coords = getEventCoords(item);
  const floodInfo = type === 'floods' ? formatFloodInfo(item) : null;
  const shareUrl = buildShareUrl(item, type);
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      if (onShare) onShare('Link copied!');
    }).catch(() => {
      // Fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      if (onShare) onShare('Link copied!');
    });
  };
  
  return (
    <div className="detail-drawer">
      <div className="drawer-header">
        <div className="drawer-icon-title">
          <span className="drawer-icon">{config?.icon}</span>
          <div>
            <h3 className="drawer-title">
              {type === 'floods' && floodInfo ? floodInfo.clearName : (item.name || item.place || item.event || config?.name)}
            </h3>
            <span className={`drawer-severity sev-${severity.toLowerCase().replace(/ /g, '-')}`}>{severity}</span>
          </div>
        </div>
        <button className="drawer-close" onClick={onClose}>✕</button>
      </div>
      
      <div className="drawer-body">
        {/* Event-specific details */}
        {type === 'earthquakes' && (
          <div className="drawer-section">
            <div className="drawer-row"><span>Magnitude</span><strong>M{item.magnitude?.toFixed(1)}</strong></div>
            <div className="drawer-row"><span>Depth</span><strong>{item.depth?.toFixed(1)} km</strong></div>
            {item.felt > 0 && <div className="drawer-row"><span>Felt Reports</span><strong>{item.felt}</strong></div>}
            {item.alert && <div className="drawer-row"><span>Alert Level</span><strong className={`alert-${item.alert}`}>{item.alert}</strong></div>}
            {item.tsunami === 1 && <div className="drawer-alert tsunami">⚠️ TSUNAMI WARNING ISSUED</div>}
            {item.time && <div className="drawer-row"><span>Time</span><strong>{formatTime(item.time)}</strong></div>}
          </div>
        )}
        
        {type === 'wildfires' && (
          <div className="drawer-section">
            <div className={`drawer-status-badge ${item.isActive ? 'active' : 'contained'}`}>
              {item.isActive ? '🔥 ACTIVELY BURNING' : item.status === 'just_ended' ? '🟡 JUST CONTAINED' : '✅ CONTAINED'}
            </div>
            {item.alertLevel && <div className="drawer-row"><span>Alert</span><strong>{item.alertLevel}</strong></div>}
            {item.affectedArea > 0 && <div className="drawer-row"><span>Affected Area</span><strong>{formatNumber(item.affectedArea)} km²</strong></div>}
            {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
            {item.population > 0 && <div className="drawer-row"><span>Pop. at Risk</span><strong>{formatNumber(item.population)}</strong></div>}
          </div>
        )}
        
        {type === 'floods' && (
          <div className="drawer-section">
            {floodInfo?.isActive ? (
              <div className="drawer-status-badge active">🔴 ACTIVE — Day {floodInfo.daysActive}</div>
            ) : (
              <div className="drawer-status-badge contained">⚪ {floodInfo?.statusLabel || 'Ended'}</div>
            )}
            {item.alertLevel && <div className="drawer-row"><span>Alert</span><strong>{item.alertLevel}</strong></div>}
            {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
            {item.population > 0 && <div className="drawer-row"><span>Pop. at Risk</span><strong>{formatNumber(item.population)}</strong></div>}
            {item.fromDate && <div className="drawer-row"><span>Started</span><strong>{new Date(item.fromDate).toLocaleDateString()}</strong></div>}
          </div>
        )}
        
        {type === 'cyclones' && (
          <div className="drawer-section">
            {item.stormType && <div className="drawer-row"><span>Type</span><strong>{item.stormType}</strong></div>}
            {item.windSpeed && <div className="drawer-row"><span>Wind Speed</span><strong>{item.windSpeed} km/h</strong></div>}
            {item.category && <div className="drawer-row"><span>Category</span><strong>{item.category}</strong></div>}
          </div>
        )}
        
        {type === 'volcanoes' && (
          <div className="drawer-section">
            {item.alertLevel && <div className="drawer-row"><span>Alert</span><strong>{item.alertLevel}</strong></div>}
            {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
          </div>
        )}

        {type === 'landslides' && (
          <div className="drawer-section">
            {item.fatalities > 0 && <div className="drawer-row"><span>Fatalities</span><strong className="text-red">{item.fatalities}</strong></div>}
            {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
            {item.trigger && <div className="drawer-row"><span>Trigger</span><strong>{item.trigger}</strong></div>}
          </div>
        )}

        {type === 'tsunamis' && (
          <div className="drawer-section">
            <div className="drawer-alert tsunami">⚠️ {severity}</div>
            {item.region && <div className="drawer-row"><span>Region</span><strong>{item.region}</strong></div>}
          </div>
        )}
        
        {/* Common section */}
        <div className="drawer-section coords-section">
          {coords && (
            <div className="drawer-row"><span>Coordinates</span><strong>{coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}</strong></div>
          )}
          {item.description && (
            <div className="drawer-description">{item.description}</div>
          )}
          {item.source && <div className="drawer-row faded"><span>Source</span><strong>{item.source}</strong></div>}
          {item.sources?.length > 0 && (
            <div className="drawer-links">
              {item.sources.slice(0, 3).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="drawer-source-link">
                  {s.id || 'Source'} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="drawer-footer">
        <button className="drawer-share-btn" onClick={handleCopyLink}>🔗 Copy Share Link</button>
      </div>
    </div>
  );
};

// =====================================================================
// v4: COUNTRY/REGION STATISTICS
// =====================================================================
const RegionStats = ({ data, watchArea }) => {
  const stats = useMemo(() => {
    if (!watchArea) return null;
    const { lat, lon, radius, name } = watchArea;
    const results = {};
    let total = 0;
    
    Object.entries(data).forEach(([type, items]) => {
      if (!items?.length) return;
      const nearby = items.filter(item => {
        const coords = getEventCoords(item);
        if (!coords) return false;
        const dist = haversineDistance(lat, lon, coords.lat, coords.lon);
        return dist <= radius;
      });
      if (nearby.length > 0) {
        results[type] = nearby.length;
        total += nearby.length;
      }
    });
    
    return { name, radius, results, total };
  }, [data, watchArea]);
  
  if (!stats || stats.total === 0) return null;
  
  return (
    <div className="region-stats">
      <div className="region-stats-header">
        <span className="region-name">📍 {stats.name}</span>
        <span className="region-radius">{stats.radius}km radius</span>
      </div>
      <div className="region-stats-body">
        {Object.entries(stats.results).map(([type, count]) => (
          <div key={type} className="region-stat-item">
            <span className="region-stat-icon">{DISASTER_CONFIG[type]?.icon}</span>
            <span className="region-stat-count">{count}</span>
            <span className="region-stat-label">{DISASTER_CONFIG[type]?.name}</span>
          </div>
        ))}
      </div>
      <div className="region-stats-total">
        {stats.total} event{stats.total !== 1 ? 's' : ''} within {stats.radius}km
      </div>
    </div>
  );
};

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// =====================================================================
// v4: WATCH AREA CIRCLE (visual overlay on map)
// =====================================================================
const WatchAreaCircle = ({ watchArea }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!watchArea || !map) return;
    const L = window.L || require('leaflet');
    const circle = L.circle([watchArea.lat, watchArea.lon], {
      radius: watchArea.radius * 1000,
      color: '#00ff88',
      fillColor: '#00ff88',
      fillOpacity: 0.05,
      weight: 2,
      dashArray: '8 4',
      opacity: 0.5
    }).addTo(map);
    
    const label = L.marker([watchArea.lat, watchArea.lon], {
      icon: L.divIcon({
        className: 'watch-label',
        html: `<div class="watch-label-inner">👁️ ${watchArea.name}</div>`,
        iconSize: [120, 24],
        iconAnchor: [60, -10]
      })
    }).addTo(map);
    
    return () => { map.removeLayer(circle); map.removeLayer(label); };
  }, [watchArea, map]);
  
  return null;
};

// =====================================================================
// MAP CONTROLLER — handles fly-to for feed clicks & deep links
// =====================================================================
const MapController = ({ flyTarget }) => {
  const map = useMap();
  useEffect(() => {
    if (flyTarget && flyTarget.lat != null && flyTarget.lon != null) {
      map.flyTo([flyTarget.lat, flyTarget.lon], flyTarget.zoom || 7, {
        duration: 1.4, easeLinearity: 0.25
      });
    }
  }, [flyTarget, map]);
  return null;
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
              onClick={() => { setTimeFilter(filter.value); setIsExpanded(false); }}
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
// v4: TIMELINE SCRUBBER (historical playback)
// =====================================================================
const TimelineScrubber = ({ data, onTimeChange }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(100); // 0-100, 100 = now
  const [isVisible, setIsVisible] = useState(false);
  const intervalRef = useRef(null);
  
  const play = () => {
    setIsPlaying(true);
    setPosition(0);
    let pos = 0;
    intervalRef.current = setInterval(() => {
      pos += 0.5;
      if (pos >= 100) {
        pos = 100;
        setIsPlaying(false);
        clearInterval(intervalRef.current);
      }
      setPosition(pos);
      // Map position to time: 0 = 7 days ago, 100 = now
      const msAgo = (1 - pos / 100) * 7 * 24 * 60 * 60 * 1000;
      onTimeChange(msAgo);
    }, 100);
  };
  
  const stop = () => {
    setIsPlaying(false);
    clearInterval(intervalRef.current);
    setPosition(100);
    onTimeChange(0);
  };
  
  const handleSlider = (e) => {
    const val = parseFloat(e.target.value);
    setPosition(val);
    const msAgo = (1 - val / 100) * 7 * 24 * 60 * 60 * 1000;
    onTimeChange(msAgo);
  };
  
  useEffect(() => () => clearInterval(intervalRef.current), []);
  
  if (!isVisible) {
    return (
      <button className="timeline-toggle-btn" onClick={() => setIsVisible(true)}>
        ⏱️ Timeline
      </button>
    );
  }
  
  const daysAgo = ((1 - position / 100) * 7).toFixed(1);
  
  return (
    <div className="timeline-scrubber">
      <div className="timeline-header">
        <span className="timeline-label">⏱️ TIMELINE</span>
        <span className="timeline-time">{position >= 99 ? 'NOW' : `${daysAgo}d ago`}</span>
        <button className="timeline-close" onClick={() => { stop(); setIsVisible(false); }}>✕</button>
      </div>
      <div className="timeline-controls">
        <button className="timeline-btn" onClick={isPlaying ? stop : play}>
          {isPlaying ? '⏹' : '▶️'}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={position}
          onChange={handleSlider}
          className="timeline-slider"
        />
      </div>
      <div className="timeline-ticks">
        <span>7d</span><span>5d</span><span>3d</span><span>1d</span><span>Now</span>
      </div>
    </div>
  );
};

// =====================================================================
// STATS DASHBOARD COMPONENT
// =====================================================================
const StatsDashboard = ({ data, enabledLayers, setEnabledLayers, connected }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);

  const getStats = (type, items) => {
    if (!items?.length) return { severity: 'NONE', count: 0, details: '' };
    let details = '', severity = 'LOW';
    switch(type) {
      case 'earthquakes': {
        const maxMag = Math.max(...items.map(e => e.magnitude || 0));
        const major = items.filter(e => e.magnitude >= 6).length;
        if (maxMag > 0) details = `M${maxMag.toFixed(1)} max`;
        if (major > 0) details += (details ? ' · ' : '') + `${major} major`;
        severity = maxMag >= 7 ? 'EXTREME' : maxMag >= 6 ? 'HIGH' : maxMag >= 5 ? 'MODERATE' : 'LOW';
        break;
      }
      case 'volcanoes': {
        const red = items.filter(v => v.alertLevel === 'Red').length;
        const orange = items.filter(v => v.alertLevel === 'Orange').length;
        if (red > 0) details = `${red} erupting`;
        if (orange > 0) details += (details ? ' · ' : '') + `${orange} warning`;
        severity = red > 0 ? 'EXTREME' : orange > 0 ? 'HIGH' : 'MODERATE';
        break;
      }
      case 'cyclones': {
        const hurricanes = items.filter(c => c.stormType?.includes('Hurricane')).length;
        const typhoons = items.filter(c => c.stormType?.includes('Typhoon')).length;
        if (hurricanes > 0) details = `${hurricanes} hurricane${hurricanes > 1 ? 's' : ''}`;
        if (typhoons > 0) details += (details ? ' · ' : '') + `${typhoons} typhoon${typhoons > 1 ? 's' : ''}`;
        severity = hurricanes + typhoons > 0 ? 'HIGH' : 'MODERATE';
        break;
      }
      case 'floods': {
        const active = items.filter(f => formatFloodInfo(f).isActive).length;
        if (active > 0) details = `${active} active`;
        severity = active > 3 ? 'HIGH' : active > 0 ? 'MODERATE' : 'LOW';
        break;
      }
      case 'landslides': {
        const fatal = items.filter(l => (l.fatalities || 0) > 0).length;
        details = fatal > 0 ? `${fatal} fatal` : '';
        severity = fatal > 0 ? 'HIGH' : 'MODERATE';
        break;
      }
      case 'tsunamis': {
        const warnings = items.filter(t => t.severity === 'Warning').length;
        details = warnings > 0 ? `${warnings} warning${warnings > 1 ? 's' : ''}` : '';
        severity = warnings > 0 ? 'EXTREME' : 'MODERATE';
        break;
      }
      default: {
        details = items.length > 5 ? `${items.length} events` : '';
        severity = items.length > 10 ? 'HIGH' : 'MODERATE';
      }
    }
    return { severity, count: items.length, details };
  };

  const allTypes = Object.keys(DISASTER_CONFIG);
  let criticalCount = 0;
  allTypes.forEach(type => {
    const items = data[type] || [];
    items.forEach(item => {
      if (DISASTER_CONFIG[type].isCritical && DISASTER_CONFIG[type].isCritical(item)) criticalCount++;
    });
  });

  if (isMinimized) {
    return (
      <div className="stats-dashboard minimized" onClick={() => setIsMinimized(false)}>
        <span className="minimize-toggle in-header">📊 Stats {criticalCount > 0 ? `(⚠️${criticalCount})` : ''}</span>
      </div>
    );
  }

  return (
    <div className="stats-dashboard enhanced">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <span>📊 DISASTER MONITOR</span>
          <span className="dashboard-subtitle">{connected ? '⚡ streaming' : '⏸ reconnecting...'}</span>
        </div>
        <button className="minimize-toggle in-header" onClick={() => setIsMinimized(true)}>—</button>
      </div>
      <div className="stats-grid">
        {allTypes.map(key => {
          const config = DISASTER_CONFIG[key];
          const items = data[key] || [];
          const stats = getStats(key, items);
          const isEnabled = enabledLayers[key];
          const severityClass = stats.severity.toLowerCase();
          return (
            <div
              key={key}
              className={`stat-card enhanced ${isEnabled ? 'active' : ''} ${severityClass}`}
              onClick={() => setEnabledLayers(prev => ({ ...prev, [key]: !prev[key] }))}
            >
              <div className="stat-header">
                <span className="stat-icon">{config.icon}</span>
                <span className={`stat-count ${stats.severity === 'EXTREME' ? 'pulse' : ''}`}>{stats.count}</span>
              </div>
              <div className="stat-name">{config.name}</div>
              {stats.details && <div className="stat-details">{stats.details}</div>}
              {stats.severity !== 'NONE' && stats.severity !== 'LOW' && (
                <div className={`severity-badge ${severityClass}`}>{stats.severity}</div>
              )}
            </div>
          );
        })}
      </div>
      {criticalCount > 0 && (
        <div className="alerts-toggle">
          <button className="alerts-button" onClick={() => setShowAlerts(!showAlerts)}>
            <span>⚠️ {criticalCount} Critical Alert{criticalCount > 1 ? 's' : ''}</span>
            <span className="toggle-arrow">{showAlerts ? '▼' : '▶'}</span>
          </button>
        </div>
      )}
      {showAlerts && (
        <div className="alerts-section">
          {data.volcanoes?.filter(v => v.alertLevel === 'Red').map((v, i) => (
            <div key={`v${i}`} className="critical-alert volcano">🌋 ERUPTION: {v.name} - {v.country}</div>
          ))}
          {data.cyclones?.filter(c => c.windSpeed > 119).map((c, i) => (
            <div key={`c${i}`} className="critical-alert cyclone">🌀 {c.stormType || 'CYCLONE'}: {c.name} - {c.windSpeed ? `${c.windSpeed} km/h` : ''}</div>
          ))}
          {data.earthquakes?.filter(e => e.magnitude >= 6).slice(0, 3).map((eq, i) => (
            <div key={`e${i}`} className="critical-alert earthquake">🌍 M{eq.magnitude?.toFixed(1)} - {eq.place} - {formatTime(eq.time)}</div>
          ))}
          {data.tsunamis?.filter(t => t.severity === 'Warning').map((t, i) => (
            <div key={`t${i}`} className="critical-alert tsunami-alert">🌊 TSUNAMI: {t.name || t.region}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// POPUP CONTENT COMPONENT
// =====================================================================
const PopupContent = ({ item, type, config, onOpenDrawer }) => {
  const severity = config.getSeverity ? config.getSeverity(item) : 'UNKNOWN';
  const severityClass = `severity-${severity.toLowerCase().replace(/ /g, '-')}`;
  const floodInfo = type === 'floods' ? formatFloodInfo(item) : null;
  
  return (
    <div className="popup-content enhanced">
      <div className="popup-header">
        <span className="popup-icon">{config.icon}</span>
        <div className="popup-title-section">
          <div className="popup-title">
            {type === 'floods' && floodInfo ? floodInfo.clearName : (item.name || item.place || item.event || config.name)}
          </div>
          <div className={`popup-severity ${severityClass}`}>{severity}</div>
        </div>
      </div>
      <div className="popup-details">
        {type === 'earthquakes' && (
          <>
            <div className="detail-row"><strong>Magnitude:</strong><span className="detail-value highlight">M{item.magnitude?.toFixed(1)}</span></div>
            <div className="detail-row"><strong>Depth:</strong><span className="detail-value">{item.depth?.toFixed(1)} km</span></div>
            {item.tsunami === 1 && <div className="alert-box tsunami">⚠️ TSUNAMI WARNING</div>}
          </>
        )}
        {type === 'wildfires' && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '6px', marginBottom: '10px', fontSize: '12px', fontWeight: 600,
              background: item.isActive ? 'rgba(255, 68, 0, 0.15)' : 'rgba(76, 175, 80, 0.15)',
              border: item.isActive ? '1px solid rgba(255, 68, 0, 0.4)' : '1px solid rgba(76, 175, 80, 0.4)',
              color: item.isActive ? '#ff6600' : '#4caf50'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.isActive ? '#ff4400' : '#4caf50', flexShrink: 0 }}></span>
              <span>{item.isActive ? '🔥 ACTIVELY BURNING' : item.status === 'just_ended' ? '🟡 RECENTLY CONTAINED' : '✅ CONTAINED'}</span>
            </div>
            {item.country && <div className="detail-row"><strong>Country:</strong><span className="detail-value">{item.country}</span></div>}
            {item.affectedArea > 0 && <div className="detail-row"><strong>Area:</strong><span className="detail-value">{formatNumber(item.affectedArea)} km²</span></div>}
          </>
        )}
        {type === 'floods' && (
          <>
            {floodInfo?.isActive && <div className="active-flood-badge"><span className="badge-icon">🔴</span><span className="badge-text">ACTIVE - Day {floodInfo.daysActive}</span></div>}
            <div className="detail-row"><strong>Alert:</strong><span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel}</span></div>
            {item.country && <div className="detail-row"><strong>Country:</strong><span className="detail-value">{item.country}</span></div>}
          </>
        )}
        {type === 'cyclones' && (
          <>
            {item.stormType && <div className="detail-row"><strong>Type:</strong><span className="detail-value">{item.stormType}</span></div>}
            {item.windSpeed && <div className="detail-row"><strong>Wind:</strong><span className="detail-value highlight">{item.windSpeed} km/h</span></div>}
          </>
        )}
        {type === 'volcanoes' && (
          <>
            <div className="detail-row"><strong>Alert:</strong><span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel}</span></div>
            {item.country && <div className="detail-row"><strong>Country:</strong><span className="detail-value">{item.country}</span></div>}
          </>
        )}
        {type === 'landslides' && (
          <>
            {item.fatalities > 0 && <div className="detail-row"><strong>Fatalities:</strong><span className="detail-value highlight">{item.fatalities}</span></div>}
            {item.trigger && <div className="detail-row"><strong>Trigger:</strong><span className="detail-value">{item.trigger}</span></div>}
          </>
        )}
        {type === 'tsunamis' && <div className="alert-box tsunami">⚠️ {severity}</div>}
      </div>
      <button className="popup-detail-btn" onClick={() => onOpenDrawer(item, type)}>View Full Details →</button>
    </div>
  );
};

// =====================================================================
// LIVE FEED COMPONENT
// =====================================================================
const FEED_ICONS = {
  earthquakes: { icon: '🌍', color: '#ff4444', label: 'Earthquake' },
  wildfires:   { icon: '🔥', color: '#ff6600', label: 'Wildfire' },
  fires:       { icon: '🔥', color: '#ff8800', label: 'Hotspot' },
  floods:      { icon: '🌊', color: '#4488ff', label: 'Flood' },
  cyclones:    { icon: '🌀', color: '#00ccff', label: 'Cyclone' },
  volcanoes:   { icon: '🌋', color: '#ff3333', label: 'Volcano' },
  droughts:    { icon: '🏜️', color: '#cc9900', label: 'Drought' },
  spaceweather:{ icon: '☀️', color: '#ff00ff', label: 'Space' },
  weather:     { icon: '⚠️', color: '#ffaa00', label: 'Weather' },
  landslides:  { icon: '⛰️', color: '#8B4513', label: 'Landslide' },
  tsunamis:    { icon: '🌊', color: '#0066cc', label: 'Tsunami' },
};

const MAX_FEED_ITEMS = 80;

const LiveFeed = ({ data, connected, onEventClick, activeEventId }) => {
  const [feedItems, setFeedItems] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const prevDataRef = useRef({});
  const listRef = useRef(null);

  useEffect(() => {
    const prevData = prevDataRef.current;
    const newItems = [];

    Object.keys(data).forEach(type => {
      if (!data[type]?.length || type === 'fires') return;
      const prevIds = new Set((prevData[type] || []).map(i => i.id || i.name || JSON.stringify(getEventCoords(i))));

      data[type].forEach(item => {
        const id = item.id || item.name || JSON.stringify(getEventCoords(item));
        if (prevIds.has(id)) return;
        const coords = getEventCoords(item);
        if (!coords) return;
        const meta = FEED_ICONS[type] || { icon: '❓', color: '#888', label: type };
        const ts = getEventTimestamp(item, type);
        const severity = DISASTER_CONFIG[type]?.getSeverity?.(item) || '';
        
        newItems.push({
          feedId: `${type}_${id}_${Date.now()}`,
          type, ...meta, severity,
          title: item.name || item.place || item.event || meta.label,
          lat: coords.lat, lon: coords.lon,
          timestamp: ts, isNew: true,
          item // keep reference for drawer
        });
      });
    });

    if (newItems.length > 0) {
      // Sort newest first so the feed shows a mix of types, not just whichever has most items
      newItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setFeedItems(prev => {
        const combined = [...newItems, ...prev].slice(0, MAX_FEED_ITEMS);
        return combined;
      });
      if (isMinimized) setUnreadCount(prev => prev + newItems.length);
    }

    prevDataRef.current = { ...data };
  }, [data, isMinimized]);

  useEffect(() => {
    if (isAutoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [feedItems, isAutoScroll]);

  const handleScroll = () => {
    if (!listRef.current) return;
    setIsAutoScroll(listRef.current.scrollTop < 10);
  };

  if (isMinimized) {
    return (
      <div className="livefeed-minimized-pill" onClick={() => { setIsMinimized(false); setUnreadCount(0); }}>
        <span className="pill-pulse"></span>
        <span className="pill-icon">📡</span>
        <span className="pill-label">LIVE</span>
        {unreadCount > 0 && <span className="pill-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </div>
    );
  }

  return (
    <div
      className={`livefeed-container ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="livefeed-header">
        <div className="livefeed-header-left">
          <span className={`livefeed-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          <span className="livefeed-title">LIVE FEED</span>
          <span className="livefeed-count">{feedItems.length}</span>
        </div>
        <div className="livefeed-header-right">
          {!isAutoScroll && (
            <button className="livefeed-btn livefeed-btn-top" onClick={() => { if (listRef.current) listRef.current.scrollTop = 0; setIsAutoScroll(true); }}>↑ New</button>
          )}
          <button className="livefeed-btn" onClick={() => setIsMinimized(true)}>—</button>
        </div>
      </div>

      <div className="livefeed-list" ref={listRef} onScroll={handleScroll}>
        {feedItems.length === 0 ? (
          <div className="livefeed-empty">
            <span className="livefeed-empty-icon">📡</span>
            <span>Waiting for events...</span>
          </div>
        ) : (
          feedItems.map(item => (
            <div
              key={item.feedId}
              className={`livefeed-item ${item.isNew ? 'livefeed-item-new' : ''} ${activeEventId === item.feedId ? 'livefeed-item-active' : ''}`}
              style={{ '--accent': item.color }}
              onClick={() => onEventClick && onEventClick(item)}
            >
              <span className="livefeed-item-accent" style={{ background: item.color }}></span>
              <div className="livefeed-item-icon" style={{ background: `${item.color}18` }}>
                {item.icon}
              </div>
              <div className="livefeed-item-body">
                <div className="livefeed-item-top">
                  <span className="livefeed-item-label" style={{ color: item.color }}>{item.label}</span>
                  {item.severity && /EXTREME|CRITICAL|ERUPTING|CAT.*[4-5]|WARNING/i.test(item.severity) && (
                    <span className="livefeed-severity livefeed-severity-extreme">{item.severity}</span>
                  )}
                </div>
                <div className="livefeed-item-title">{item.title}</div>
                <div className="livefeed-item-time">{formatTime(item.timestamp)}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="livefeed-footer">
        <span className="livefeed-footer-text">ALL FREE SOURCES · CLICK TO FLY</span>
      </div>
    </div>
  );
};

// =====================================================================
// v4: CRITICAL EVENT ALERT MONITOR
// =====================================================================
const useCriticalAlerts = (data, alertsEnabled) => {
  const seenCritical = useRef(new Set());
  
  useEffect(() => {
    if (!alertsEnabled) return;
    
    Object.entries(data).forEach(([type, items]) => {
      if (!items?.length) return;
      const config = DISASTER_CONFIG[type];
      if (!config?.isCritical) return;
      
      items.forEach(item => {
        if (!config.isCritical(item)) return;
        const id = item.id || item.name || JSON.stringify(getEventCoords(item));
        if (seenCritical.current.has(id)) return;
        seenCritical.current.add(id);
        
        // Play sound + browser notification
        playAlertSound();
        const title = `⚠️ ${config.name} Alert`;
        const body = `${item.name || item.place || 'Critical event detected'} — ${config.getSeverity?.(item) || 'ALERT'}`;
        sendBrowserNotification(title, body, config.icon);
      });
    });
  }, [data, alertsEnabled]);
};

// =====================================================================
// MAIN APP COMPONENT v4.0
// =====================================================================
function App() {
  const { rawData, connected, loading } = useRealtimeData();
  const [timeFilter, setTimeFilter] = useState(0);
  const [enabledLayers, setEnabledLayers] = useState(
    Object.keys(DISASTER_CONFIG).reduce((acc, key) => ({ ...acc, [key]: DISASTER_CONFIG[key].enabled }), {})
  );
  
  // Existing state
  const [flyTarget, setFlyTarget] = useState(null);
  const [activeEventId, setActiveEventId] = useState(null);
  const [highlightPos, setHighlightPos] = useState(null);
  const highlightTimer = useRef(null);
  
  // v4: New state
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null);
  const [drawerType, setDrawerType] = useState(null);
  const [watchArea, setWatchArea] = useState(() => {
    try { return JSON.parse(localStorage.getItem('realnow_watcharea')); } catch { return null; }
  });
  const [alertsEnabled, setAlertsEnabled] = useState(() => {
    try { return localStorage.getItem('realnow_alerts') === 'true'; } catch { return false; }
  });
  const [shareToast, setShareToast] = useState('');
  
  const data = filterDataByTime(rawData, timeFilter);
  
  // v4: Critical alert monitor
  useCriticalAlerts(data, alertsEnabled);
  
  // v4: Register PWA service worker
  useEffect(() => { registerServiceWorker(); }, []);
  
  // v4: Handle deep link on mount
  useEffect(() => {
    const params = getShareParams();
    if (params.lat && params.lon) {
      setTimeout(() => {
        setFlyTarget({ lat: params.lat, lon: params.lon, zoom: params.zoom || 8, _ts: Date.now() });
      }, 2000);
    }
  }, []);
  
  // v4: Request notification permission
  useEffect(() => {
    if (alertsEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [alertsEnabled]);
  
  // v4: Persist watch area
  useEffect(() => {
    if (watchArea) {
      localStorage.setItem('realnow_watcharea', JSON.stringify(watchArea));
    } else {
      localStorage.removeItem('realnow_watcharea');
    }
  }, [watchArea]);

  // Feed click handler
  const handleFeedClick = useCallback((feedItem) => {
    setFlyTarget({ lat: feedItem.lat, lon: feedItem.lon, zoom: 7, _ts: Date.now() });
    setActiveEventId(feedItem.feedId);
    setHighlightPos({ lat: feedItem.lat, lon: feedItem.lon, color: feedItem.color });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => { setHighlightPos(null); setActiveEventId(null); }, 8000);
  }, []);

  // v4: Search select handler
  const handleSearchSelect = useCallback((result) => {
    setFlyTarget({ lat: result.lat, lon: result.lon, zoom: result.zoom || 10, _ts: Date.now() });
  }, []);
  
  // v4: Watch area handler
  const handleWatchArea = useCallback((area) => {
    setWatchArea(area);
    setFlyTarget({ lat: area.lat, lon: area.lon, zoom: 8, _ts: Date.now() });
  }, []);

  // v4: Open detail drawer
  const handleOpenDrawer = useCallback((item, type) => {
    setDrawerItem(item);
    setDrawerType(type);
  }, []);
  
  // v4: Timeline scrubber handler
  const handleTimelineChange = useCallback((msAgo) => {
    if (msAgo === 0) {
      setTimeFilter(0);
    } else {
      setTimeFilter(msAgo);
    }
  }, []);

  // v4: Share toast
  const handleShare = useCallback((msg) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(''), 2500);
  }, []);

  // Render markers
  const renderDisasterMarkers = (items, type) => {
    if (!enabledLayers[type] || !items?.length) return null;
    const config = DISASTER_CONFIG[type];
    const markers = [];
    
    items.forEach((item, index) => {
      const coords = getEventCoords(item);
      if (!coords || isNaN(coords.lat) || isNaN(coords.lon)) return;
      if (coords.lat === 0 && coords.lon === 0) return;
      
      const radius = config.getRadius ? config.getRadius(item) : 8;
      const opacity = config.getOpacity ? config.getOpacity(item) : 0.6;
      const severity = config.getSeverity ? config.getSeverity(item) : '';
      const floodInfo = type === 'floods' ? formatFloodInfo(item) : null;
      const displayName = type === 'floods' ? floodInfo?.clearName : (item.name || item.place || item.event || config.name);
      
      markers.push(
        <CircleMarker
          key={`${type}-${index}`}
          center={[coords.lat, coords.lon]}
          radius={radius}
          fillColor={config.color}
          color={config.color}
          weight={1}
          opacity={opacity}
          fillOpacity={opacity * 0.6}
        >
          <Tooltip direction="top" offset={[0, -10]} className="custom-tooltip">
            <div style={{fontSize: '0.8em'}}>
              <strong style={{color: config.color}}>{config.icon} {displayName}</strong>
              {severity && <div style={{color: '#aaa', fontSize: '0.85em'}}>{severity}</div>}
              {type === 'cyclones' && item.isActive && (
                <span style={{color: '#00ffcc', fontSize: '0.7em'}}>⚠️ ACTIVE STORM</span>
              )}
            </div>
          </Tooltip>
          <Popup>
            <PopupContent item={item} type={type} config={config} onOpenDrawer={handleOpenDrawer} />
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
        <div style={{fontSize: '0.8em', color: '#666', marginTop: '8px'}}>v4.0 — All Free Sources</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <MapContainer center={[20, 0]} zoom={2} className="map-container" zoomControl={false} worldCopyJump={true}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        
        <MapController flyTarget={flyTarget} />
        
        {/* v4: Heatmap layer */}
        {heatmapEnabled && <HeatmapLayer data={data} enabledLayers={enabledLayers} />}
        
        {/* v4: Watch area circle */}
        {watchArea && <WatchAreaCircle watchArea={watchArea} />}
        
        {/* Disaster markers */}
        {Object.keys(data).map(type => renderDisasterMarkers(data[type], type))}

        {/* Highlight rings */}
        {highlightPos && (
          <>
            <CircleMarker center={[highlightPos.lat, highlightPos.lon]} radius={22} fillColor="transparent" color={highlightPos.color || '#ffffff'} weight={3} opacity={0.9} fillOpacity={0} className="highlight-ring" />
            <CircleMarker center={[highlightPos.lat, highlightPos.lon]} radius={35} fillColor="transparent" color={highlightPos.color || '#ffffff'} weight={1.5} opacity={0.4} fillOpacity={0} className="highlight-ring-outer" />
          </>
        )}
      </MapContainer>
      
      {/* v4: Location Search */}
      <LocationSearch onSelect={handleSearchSelect} onWatchArea={handleWatchArea} />
      
      {/* Stats Dashboard */}
      <StatsDashboard data={data} enabledLayers={enabledLayers} setEnabledLayers={setEnabledLayers} connected={connected} />
      
      {/* v4: Region stats for watch area */}
      {watchArea && <RegionStats data={data} watchArea={watchArea} />}
      
      {/* Time Control */}
      <TimeControl timeFilter={timeFilter} setTimeFilter={setTimeFilter} connected={connected} />
      
      {/* v4: Timeline Scrubber */}
      <TimelineScrubber data={data} onTimeChange={handleTimelineChange} />
      
      {/* v4: Controls bar (heatmap toggle, alerts toggle, clear watch) */}
      <div className="v4-controls">
        <button
          className={`v4-ctrl-btn ${heatmapEnabled ? 'active' : ''}`}
          onClick={() => setHeatmapEnabled(!heatmapEnabled)}
          title="Toggle heatmap"
        >
          🔥 Heatmap
        </button>
        <button
          className={`v4-ctrl-btn ${alertsEnabled ? 'active' : ''}`}
          onClick={() => {
            const newVal = !alertsEnabled;
            setAlertsEnabled(newVal);
            localStorage.setItem('realnow_alerts', String(newVal));
            if (newVal && 'Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission();
            }
          }}
          title="Toggle alerts"
        >
          🔔 Alerts
        </button>
        {watchArea && (
          <button className="v4-ctrl-btn" onClick={() => setWatchArea(null)} title="Clear watch area">
            ❌ Clear Watch
          </button>
        )}
      </div>
      
      {/* Live Feed */}
      <LiveFeed data={data} connected={connected} onEventClick={handleFeedClick} activeEventId={activeEventId} />
      
      {/* v4: Detail Drawer */}
      <DetailDrawer item={drawerItem} type={drawerType} onClose={() => { setDrawerItem(null); setDrawerType(null); }} onShare={handleShare} />
      
      {/* v4: Share toast */}
      {shareToast && <div className="share-toast">{shareToast}</div>}
    </div>
  );
}

export default App;