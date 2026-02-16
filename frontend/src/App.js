// App.js - v5.0 COMPLETE
// ═══════════════════════════════════════════════════════════
// Carries forward ALL v4.0 features:
//   Marker rendering, Location Search, Watch Area, Heatmap,
//   Event Detail Drawer, Timeline Scrubber, LiveFeed,
//   StatsDashboard, PWA/Offline, Sharing/Deep Links,
//   Region Statistics, Sound/Notification Alerts, Mobile Menu
//
// NEW v5.0 enhancements:
//   1. Map Style Switcher (dark/satellite/terrain/light)
//   2. Disaster Polygon Overlays (flood/wildfire/drought zones)
//   3. Cyclone Wind Radius Circles
//   4. Grid-based Marker Clustering (fires layer)
//   5. Analytics Dashboard (donut charts, severity, countries, sources)
//   6. User Preferences Panel (language, alerts, digest, map style)
//   7. Smart Proximity Alerts (distance-aware notifications)
//   8. Internationalization (7 languages + RTL)
//   9. Accessibility (skip-nav, focus-visible, reduced-motion, aria)
//  10. v5 CSS theme + responsive
// ═══════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import './App.css';
import './LiveFeed.css';
import './v4-enhancements.css';
import './v5-enhancements.css';
import './mobile-fix.css';

// v5: New component imports
import { MapStyleSwitcher, DisasterPolygons, CycloneTrackLine } from './components/MapEnhancements';
import ClusterLayer from './components/ClusterLayer';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import PreferencesPanel from './components/PreferencesPanel';
import { useSmartAlerts } from './components/SmartAlerts';
import { I18nProvider } from './i18n/i18n';

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

const getRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  const now = Date.now();
  const t = typeof timestamp === 'number' ? (timestamp < 1e12 ? timestamp * 1000 : timestamp) : new Date(timestamp).getTime();
  const diff = now - t;
  if (diff < 0) return 'upcoming';
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(t).toLocaleDateString();
};

// ─── HELPER: Severity color class ─────────────────────────────────
const getSeverityColorClass = (level) => {
  if (!level) return '';
  const l = level.toLowerCase();
  if (l.includes('extreme') || l.includes('red') || l === 'category 5') return 'sev-extreme';
  if (l.includes('severe') || l.includes('orange') || l === 'category 4' || l === 'category 3') return 'sev-severe';
  if (l.includes('moderate') || l.includes('yellow') || l === 'category 2' || l === 'category 1') return 'sev-moderate';
  return 'sev-minor';
};

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
     ((!toDate || toDate > now) && daysActive < 14));
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

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [255, 255, 255];
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
// NOTIFICATION SOUND (Web Audio API)
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
  } catch (e) { /* silent fail */ }
};

// =====================================================================
// BROWSER NOTIFICATIONS
// =====================================================================
const sendBrowserNotification = (title, body, icon) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: icon || '🌍', tag: 'realnow-alert', renotify: true });
    } catch (e) { /* mobile fallback */ }
  }
};

// =====================================================================
// PWA SERVICE WORKER REGISTRATION
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
// URL SHARING — read/write deep link params
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
    event: id, type: type,
    lat: coords.lat.toFixed(4), lon: coords.lon.toFixed(4), zoom: '8'
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
// LOCATION SEARCH COMPONENT
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
          { headers: { 'User-Agent': 'RealNow-DisasterTracker/5.0' } }
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
        lat: parseFloat(selected.lat), lon: parseFloat(selected.lon),
        name: selected.display_name.split(',')[0], radius
      });
      setWatchRadius(radius);
    }
  };

  return (
    <div className="search-container" role="search" aria-label="Location search">
      <div className="search-input-row">
        <span className="search-icon" aria-hidden="true">🔍</span>
        <input
          type="text" className="search-input" placeholder="Search location..."
          value={query} aria-label="Search for a location"
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        {query && (
          <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }} aria-label="Clear search">✕</button>
        )}
      </div>
      {isOpen && (
        <div className="search-results" role="listbox">
          {results.map((r, i) => (
            <div key={i} className="search-result-item" role="option" aria-selected={false} onClick={() => handleSelect(r)}>
              <span className="result-icon">📍</span>
              <span className="result-text">{r.display_name}</span>
            </div>
          ))}
          {results.length > 0 && (
            <div className="search-watch-row">
              <select className="watch-radius-select" value={watchRadius || 200}
                onChange={(e) => setWatchRadius(parseInt(e.target.value))} aria-label="Watch area radius">
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
// HEATMAP LAYER
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

// =====================================================================
// EVENT DETAIL DRAWER
// =====================================================================
const DetailDrawer = ({ item, type, onClose, onShare }) => {
  // v5: Keyboard support — Escape to close (must be before early return)
  useEffect(() => {
    if (!item || !type) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [item, type, onClose]);

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
    <div className="detail-drawer" role="dialog" aria-label="Event details">
      <div className="drawer-header">
        <div className="drawer-icon-title">
          <span className="drawer-icon" aria-hidden="true">{config?.icon}</span>
          <div>
            <h3 className="drawer-title">
              {type === 'floods' && floodInfo ? floodInfo.clearName : (item.name || item.place || item.event || config?.name)}
            </h3>
            <span className={`drawer-severity sev-${severity.toLowerCase().replace(/ /g, '-')}`}>{severity}</span>
          </div>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="Close details">✕</button>
      </div>

      <div className="drawer-body">

        {/* ═══ EARTHQUAKES ═══ */}
        {type === 'earthquakes' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">📊 Seismic Data</h4>
              <div className="drawer-row"><span>Magnitude</span><strong>M{item.magnitude?.toFixed(1)} {item.magType ? `(${item.magType})` : ''}</strong></div>
              <div className="drawer-row"><span>Depth</span><strong>{item.depth?.toFixed(1)} km — {item.depthClass || ''}</strong></div>
              {item.significance > 0 && <div className="drawer-row"><span>Significance</span><strong>{item.significance} / 1000</strong></div>}
              {item.gap && <div className="drawer-row"><span>Azimuthal Gap</span><strong>{item.gap.toFixed(0)}°</strong></div>}
              {item.rms && <div className="drawer-row"><span>RMS Residual</span><strong>{item.rms.toFixed(2)} sec</strong></div>}
              {item.nst && <div className="drawer-row"><span>Stations Used</span><strong>{item.nst}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">🏘️ Impact Assessment</h4>
              {item.mmi > 0 && (
                <div className="drawer-row">
                  <span>Max Shaking (MMI)</span>
                  <strong className={getSeverityColorClass(item.intensityDesc)}>
                    {item.mmi.toFixed(1)} — {item.intensityDesc || 'Unknown'}
                  </strong>
                </div>
              )}
              {item.cdi > 0 && (
                <div className="drawer-row"><span>Community Intensity</span><strong>{item.cdi.toFixed(1)}</strong></div>
              )}
              {item.felt > 0 && <div className="drawer-row"><span>Felt Reports</span><strong>{formatNumber(item.felt)} people</strong></div>}
              {item.alert && (
                <div className="drawer-row">
                  <span>PAGER Alert</span>
                  <strong className={`alert-${item.alert}`}>{item.alert.toUpperCase()}</strong>
                </div>
              )}
              {item.tsunami === 1 && <div className="drawer-alert tsunami">⚠️ TSUNAMI WARNING ISSUED</div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">ℹ️ Details</h4>
              <div className="drawer-row"><span>Status</span><strong>{item.status === 'reviewed' ? '✅ Reviewed' : '⏳ Automatic'}</strong></div>
              {item.net && <div className="drawer-row"><span>Network</span><strong>{item.net.toUpperCase()}</strong></div>}
              {item.time && <div className="drawer-row"><span>Time</span><strong>{formatTime(item.time)} ({getRelativeTime(item.time)})</strong></div>}
              {item.updated && <div className="drawer-row"><span>Updated</span><strong>{getRelativeTime(item.updated)}</strong></div>}
            </div>
          </>
        )}

        {/* ═══ CYCLONES / HURRICANES / TYPHOONS ═══ */}
        {type === 'cyclones' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">🌀 Storm Classification</h4>
              <div className="drawer-row"><span>Type</span><strong>{item.stormType}</strong></div>
              <div className="drawer-row"><span>Category</span><strong>{item.category}</strong></div>
              {item.saffirSimpson && (
                <div className="drawer-row"><span>Saffir-Simpson</span><strong>{item.saffirSimpson}</strong></div>
              )}
              {item.alertLevel && (
                <div className="drawer-row">
                  <span>GDACS Alert</span>
                  <strong className={`alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel} {item.alertScore ? `(${item.alertScore.toFixed(1)})` : ''}</strong>
                </div>
              )}
              <div className={`drawer-status-badge ${item.isActive ? 'active' : 'contained'}`}>
                {item.isActive ? '🔴 ACTIVE STORM' : '⚪ DISSIPATED'}
              </div>
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">💨 Wind & Pressure</h4>
              {item.windSpeed > 0 && (
                <div className="drawer-row"><span>Wind Speed</span><strong>{item.windSpeed} km/h ({Math.round(item.windSpeed * 0.621)} mph)</strong></div>
              )}
              {item.beaufort > 0 && <div className="drawer-row"><span>Beaufort Scale</span><strong>Force {item.beaufort}</strong></div>}
              {item.pressure > 0 && (
                <div className="drawer-row"><span>Pressure</span><strong>{item.pressure} hPa {item.pressureDesc ? `— ${item.pressureDesc}` : ''}</strong></div>
              )}
              {item.maxWindRadius > 0 && <div className="drawer-row"><span>Max Wind Radius</span><strong>{item.maxWindRadius} km</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">🧭 Movement & Duration</h4>
              {item.movementDesc && <div className="drawer-row"><span>Movement</span><strong>{item.movementDesc}</strong></div>}
              {!item.movementDesc && item.direction > 0 && (
                <div className="drawer-row"><span>Heading</span><strong>{item.direction}° at {item.speed} km/h</strong></div>
              )}
              {item.durationDays && <div className="drawer-row"><span>Duration</span><strong>{item.durationDays} day{item.durationDays > 1 ? 's' : ''}</strong></div>}
              {item.fromDate && <div className="drawer-row"><span>Started</span><strong>{new Date(item.fromDate).toLocaleDateString()}</strong></div>}
              {item.toDate && <div className="drawer-row"><span>Ended</span><strong>{new Date(item.toDate).toLocaleDateString()}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">🏘️ Impact</h4>
              {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
              {item.affectedCountries?.length > 1 && (
                <div className="drawer-row"><span>Affected Countries</span><strong>{item.affectedCountries.join(', ')}</strong></div>
              )}
              {item.population > 0 && <div className="drawer-row"><span>Pop. at Risk</span><strong>{formatNumber(item.population)}</strong></div>}
              {item.affectedArea > 0 && <div className="drawer-row"><span>Affected Area</span><strong>{formatNumber(item.affectedArea)} km²</strong></div>}
            </div>

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ FLOODS ═══ */}
        {type === 'floods' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">🌊 Flood Status</h4>
              {floodInfo?.isActive ? (
                <div className="drawer-status-badge active">🔴 ACTIVE — Day {floodInfo.daysActive}</div>
              ) : (
                <div className="drawer-status-badge contained">⚪ {floodInfo?.statusLabel || 'Ended'}</div>
              )}
              {item.alertLevel && (
                <div className="drawer-row">
                  <span>GDACS Alert</span>
                  <strong className={`alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel} {item.severityScore ? `(${item.severityScore.toFixed(1)})` : (item.alertScore ? `(${item.alertScore})` : '')}</strong>
                </div>
              )}
              {item.severity && typeof item.severity === 'string' && <div className="drawer-row"><span>Severity</span><strong>{item.severity}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📊 Extent & Impact</h4>
              {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
              {item.affectedCountries?.length > 1 && (
                <div className="drawer-row"><span>Affected Countries</span><strong>{item.affectedCountries.join(', ')}</strong></div>
              )}
              {item.population > 0 && <div className="drawer-row"><span>Pop. at Risk</span><strong>{formatNumber(item.population)}</strong></div>}
              {item.affectedArea > 0 && <div className="drawer-row"><span>Affected Area</span><strong>{formatNumber(item.affectedArea)} km²</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📅 Timeline</h4>
              {item.fromDate && <div className="drawer-row"><span>Started</span><strong>{new Date(item.fromDate).toLocaleDateString()}</strong></div>}
              {item.toDate && <div className="drawer-row"><span>Ended</span><strong>{new Date(item.toDate).toLocaleDateString()}</strong></div>}
              {item.durationDays && <div className="drawer-row"><span>Duration</span><strong>{item.durationDays} day{item.durationDays > 1 ? 's' : ''}</strong></div>}
              {item.lastUpdate && <div className="drawer-row"><span>Last Update</span><strong>{getRelativeTime(item.lastUpdate)}</strong></div>}
            </div>

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ WILDFIRES ═══ */}
        {type === 'wildfires' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">🔥 Fire Status</h4>
              <div className={`drawer-status-badge ${item.isActive ? 'active' : 'contained'}`}>
                {item.isActive ? '🔥 ACTIVELY BURNING' : item.status === 'just_ended' ? '🟡 JUST CONTAINED' : '✅ CONTAINED'}
              </div>
              {item.alertLevel && (
                <div className="drawer-row">
                  <span>GDACS Alert</span>
                  <strong className={`alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel}</strong>
                </div>
              )}
              {item.alertScore > 0 && <div className="drawer-row"><span>Alert Score</span><strong>{item.alertScore.toFixed(1)}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📊 Extent & Impact</h4>
              {item.affectedArea > 0 && <div className="drawer-row"><span>Affected Area</span><strong>{formatNumber(item.affectedArea)} km²</strong></div>}
              {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
              {item.population > 0 && <div className="drawer-row"><span>Pop. at Risk</span><strong>{formatNumber(item.population)}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📅 Timeline</h4>
              {item.fromDate && <div className="drawer-row"><span>Started</span><strong>{new Date(item.fromDate).toLocaleDateString()}</strong></div>}
              {item.toDate && <div className="drawer-row"><span>Ended</span><strong>{new Date(item.toDate).toLocaleDateString()}</strong></div>}
              {item.daysSinceStart !== null && item.isActive && <div className="drawer-row"><span>Active For</span><strong>{item.daysSinceStart} days</strong></div>}
              {item.lastUpdate && <div className="drawer-row"><span>Last Update</span><strong>{getRelativeTime(item.lastUpdate)}</strong></div>}
            </div>

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ VOLCANOES ═══ */}
        {type === 'volcanoes' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">🌋 Volcanic Activity</h4>
              <div className={`drawer-status-badge ${!item.isClosed ? 'active' : 'contained'}`}>
                {!item.isClosed ? '🔴 ACTIVE' : '⚪ INACTIVE'}
              </div>
              {item.alertLevel && (
                <div className="drawer-row">
                  <span>Alert Level</span>
                  <strong className={`alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel}</strong>
                </div>
              )}
              {item.vei > 0 && <div className="drawer-row"><span>VEI (Explosivity)</span><strong>{item.vei} / 8</strong></div>}
              {item.alertScore > 0 && <div className="drawer-row"><span>GDACS Score</span><strong>{item.alertScore.toFixed(1)}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📍 Location & Impact</h4>
              {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
              {item.elevation > 0 && <div className="drawer-row"><span>Elevation</span><strong>{formatNumber(item.elevation)} m</strong></div>}
              {item.population > 0 && <div className="drawer-row"><span>Pop. at Risk</span><strong>{formatNumber(item.population)}</strong></div>}
              {item.affectedArea > 0 && <div className="drawer-row"><span>Affected Area</span><strong>{formatNumber(item.affectedArea)} km²</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📅 Timeline</h4>
              {item.startDate && <div className="drawer-row"><span>First Observed</span><strong>{new Date(item.startDate).toLocaleDateString()}</strong></div>}
              {item.lastObserved && <div className="drawer-row"><span>Last Observed</span><strong>{new Date(item.lastObserved).toLocaleDateString()} ({getRelativeTime(item.lastObserved)})</strong></div>}
              {item.durationDays && <div className="drawer-row"><span>Duration</span><strong>{item.durationDays} day{item.durationDays > 1 ? 's' : ''}</strong></div>}
              {item.geometryCount > 1 && <div className="drawer-row"><span>Observations</span><strong>{item.geometryCount} data points</strong></div>}
              {item.closedDate && <div className="drawer-row"><span>Closed</span><strong>{new Date(item.closedDate).toLocaleDateString()}</strong></div>}
            </div>

            {item.sources?.length > 0 && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📚 Sources</h4>
                {item.sources.map((src, i) => (
                  <div key={i} className="drawer-row">
                    <span>{src.id}</span>
                    {src.url && <a href={src.url} target="_blank" rel="noopener noreferrer" className="drawer-link">View →</a>}
                  </div>
                ))}
              </div>
            )}

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ WEATHER ALERTS ═══ */}
        {type === 'weather' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">⚠️ Alert Details</h4>
              <div className={`drawer-status-badge ${item.severity === 'Extreme' || item.severity === 'Severe' ? 'active' : 'contained'}`}>
                {item.severity === 'Extreme' ? '🔴' : item.severity === 'Severe' ? '🟠' : item.severity === 'Moderate' ? '🟡' : '🟢'} {item.severity} — {item.urgency}
              </div>
              <div className="drawer-row"><span>Event</span><strong>{item.event}</strong></div>
              {item.certainty && <div className="drawer-row"><span>Certainty</span><strong>{item.certainty}</strong></div>}
              {item.response && <div className="drawer-row"><span>Response</span><strong>{item.response}</strong></div>}
              {item.status && <div className="drawer-row"><span>Status</span><strong>{item.status}</strong></div>}
            </div>

            {/* Threat Parameters */}
            {(item.parameters?.maxWindGust || item.parameters?.maxHailSize || item.parameters?.tornadoDetection) && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">🌪️ Threat Parameters</h4>
                {item.parameters.windThreat && <div className="drawer-row"><span>Wind Threat</span><strong>{item.parameters.windThreat}</strong></div>}
                {item.parameters.maxWindGust && <div className="drawer-row"><span>Max Wind Gust</span><strong>{item.parameters.maxWindGust}</strong></div>}
                {item.parameters.hailThreat && <div className="drawer-row"><span>Hail Threat</span><strong>{item.parameters.hailThreat}</strong></div>}
                {item.parameters.maxHailSize && <div className="drawer-row"><span>Max Hail Size</span><strong>{item.parameters.maxHailSize}</strong></div>}
                {item.parameters.tornadoDetection && <div className="drawer-row"><span>Tornado Detection</span><strong>{item.parameters.tornadoDetection}</strong></div>}
                {item.parameters.thunderstormDamageThreat && <div className="drawer-row"><span>Storm Damage</span><strong>{item.parameters.thunderstormDamageThreat}</strong></div>}
                {item.parameters.flashFloodDetection && <div className="drawer-row"><span>Flash Flood</span><strong>{item.parameters.flashFloodDetection}</strong></div>}
                {item.parameters.flashFloodDamageThreat && <div className="drawer-row"><span>Flood Damage</span><strong>{item.parameters.flashFloodDamageThreat}</strong></div>}
              </div>
            )}

            <div className="drawer-section">
              <h4 className="drawer-section-title">📍 Area & Timing</h4>
              {item.areas && <div className="drawer-row"><span>Areas</span><strong className="drawer-areas">{item.areas}</strong></div>}
              {item.onset && <div className="drawer-row"><span>Onset</span><strong>{new Date(item.onset).toLocaleString()}</strong></div>}
              {item.expires && <div className="drawer-row"><span>Expires</span><strong>{new Date(item.expires).toLocaleString()}</strong></div>}
              {item.timeRemaining && <div className="drawer-row"><span>Time Left</span><strong className="text-orange">{item.timeRemaining}</strong></div>}
              {item.sender && <div className="drawer-row"><span>Issued By</span><strong>{item.sender}</strong></div>}
            </div>

            {item.parameters?.nwsHeadline && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📢 Headline</h4>
                <p className="drawer-description">{item.parameters.nwsHeadline}</p>
              </div>
            )}

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description drawer-description-long">{item.description}</p>
              </div>
            )}

            {item.instruction && (
              <div className="drawer-section drawer-instruction">
                <h4 className="drawer-section-title">🛡️ Safety Instructions</h4>
                <p className="drawer-description drawer-instruction-text">{item.instruction}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ DROUGHTS ═══ */}
        {type === 'droughts' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">🏜️ Drought Status</h4>
              <div className={`drawer-status-badge ${item.isActive !== false ? 'active' : 'contained'}`}>
                {item.isActive !== false ? '🏜️ ACTIVE DROUGHT' : item.status === 'just_ended' ? '🟡 RECENTLY ENDED' : '✅ ENDED'}
              </div>
              {item.alertLevel && (
                <div className="drawer-row"><span>Alert Level</span><strong className={`alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel}</strong></div>
              )}
              {item.severity && <div className="drawer-row"><span>Severity</span><strong>{item.severity}</strong></div>}
              {item.alertScore > 0 && <div className="drawer-row"><span>GDACS Score</span><strong>{item.alertScore.toFixed(1)}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📊 Extent & Impact</h4>
              {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
              {item.affectedCountries?.length > 1 && (
                <div className="drawer-row"><span>Affected Countries</span><strong>{item.affectedCountries.join(', ')}</strong></div>
              )}
              {item.population > 0 && <div className="drawer-row"><span>Pop. at Risk</span><strong>{formatNumber(item.population)}</strong></div>}
              {item.affectedArea > 0 && <div className="drawer-row"><span>Affected Area</span><strong>{formatNumber(item.affectedArea)} km²</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📅 Timeline</h4>
              {item.fromDate && <div className="drawer-row"><span>Started</span><strong>{new Date(item.fromDate).toLocaleDateString()}</strong></div>}
              {item.toDate && <div className="drawer-row"><span>Ended</span><strong>{new Date(item.toDate).toLocaleDateString()}</strong></div>}
              {item.daysSinceStart !== null && item.isActive !== false && (
                <div className="drawer-row"><span>Active For</span><strong>{item.daysSinceStart} days</strong></div>
              )}
              {item.duration > 0 && <div className="drawer-row"><span>Duration</span><strong>{item.duration} days</strong></div>}
              {item.lastUpdate && <div className="drawer-row"><span>Last Update</span><strong>{getRelativeTime(item.lastUpdate)}</strong></div>}
            </div>

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ LANDSLIDES ═══ */}
        {type === 'landslides' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">⛰️ Landslide Details</h4>
              {item.fatalities > 0 && <div className="drawer-row"><span>Fatalities</span><strong className="text-red">{item.fatalities}</strong></div>}
              {item.trigger && <div className="drawer-row"><span>Trigger</span><strong>{item.trigger}</strong></div>}
              {item.severity && <div className="drawer-row"><span>Severity</span><strong>{item.severity}</strong></div>}
            </div>

            <div className="drawer-section">
              <h4 className="drawer-section-title">📍 Location</h4>
              {item.country && <div className="drawer-row"><span>Country</span><strong>{item.country}</strong></div>}
              {item.date && <div className="drawer-row"><span>Date</span><strong>{new Date(item.date).toLocaleDateString()}</strong></div>}
            </div>

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}

            {item.sources?.length > 0 && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📚 Sources</h4>
                {item.sources.slice(0, 3).map((s, i) => (
                  <div key={i} className="drawer-row">
                    <span>{s.id || 'Source'}</span>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="drawer-link">View →</a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ TSUNAMIS ═══ */}
        {type === 'tsunamis' && (
          <>
            <div className="drawer-section">
              <div className="drawer-alert tsunami">⚠️ {severity}</div>
              {item.region && <div className="drawer-row"><span>Region</span><strong>{item.region}</strong></div>}
              {item.date && <div className="drawer-row"><span>Time</span><strong>{new Date(item.date).toLocaleString()}</strong></div>}
            </div>

            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ SPACE WEATHER ═══ */}
        {type === 'spaceweather' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">☀️ Space Weather</h4>
              {item.currentKp && <div className="drawer-row"><span>Kp Index</span><strong>{item.currentKp}</strong></div>}
            </div>
            {item.description && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">📝 Description</h4>
                <p className="drawer-description">{item.description}</p>
              </div>
            )}
          </>
        )}

        {/* ═══ FIRE HOTSPOTS ═══ */}
        {type === 'fires' && (
          <>
            <div className="drawer-section">
              <h4 className="drawer-section-title">🔥 Thermal Detection</h4>
              <div className="drawer-row"><span>Brightness</span><strong>{item.brightness?.toFixed(1)} K</strong></div>
              {item.frp > 0 && <div className="drawer-row"><span>Fire Radiative Power</span><strong>{item.frp.toFixed(1)} MW {item.intensity ? `— ${item.intensity}` : ''}</strong></div>}
              {item.confidence && <div className="drawer-row"><span>Confidence</span><strong>{item.confidence}</strong></div>}
              {item.satellite && <div className="drawer-row"><span>Satellite</span><strong>{item.satellite}</strong></div>}
              {item.instrument && <div className="drawer-row"><span>Instrument</span><strong>{item.instrument}</strong></div>}
              {(item.dayNight || item.daynight) && <div className="drawer-row"><span>Pass</span><strong>{(item.dayNight || item.daynight) === 'D' ? '☀️ Daytime' : '🌙 Nighttime'}</strong></div>}
              {item.estimatedArea > 0 && <div className="drawer-row"><span>Est. Pixel Area</span><strong>{item.estimatedArea.toFixed(2)} km²</strong></div>}
            </div>
            <div className="drawer-section">
              <h4 className="drawer-section-title">📅 Detection</h4>
              {item.date && <div className="drawer-row"><span>Date</span><strong>{item.date}</strong></div>}
              {item.time && <div className="drawer-row"><span>Time (UTC)</span><strong>{item.time}</strong></div>}
            </div>
          </>
        )}

        {/* ═══ COORDINATES (all types) ═══ */}
        <div className="drawer-section">
          <h4 className="drawer-section-title">📍 Coordinates</h4>
          <div className="drawer-row">
            <span>Location</span>
            <strong>{coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : 'Unknown'}</strong>
          </div>
          <div className="drawer-row"><span>Source</span><strong>{item.source || 'GDACS'}</strong></div>
        </div>

        {/* ═══ EXTERNAL LINKS (all types) ═══ */}
        {(item.url || item.link || item.web) && (
          <div className="drawer-section">
            <h4 className="drawer-section-title">🔗 External Links</h4>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="drawer-ext-link">
                View on {item.source || 'Source'} →
              </a>
            )}
            {item.link && item.link !== item.url && (
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="drawer-ext-link">
                NASA EONET Page →
              </a>
            )}
            {item.web && (
              <a href={item.web} target="_blank" rel="noopener noreferrer" className="drawer-ext-link">
                NWS Alert Page →
              </a>
            )}
          </div>
        )}
      </div>

      <div className="drawer-footer">
        <button className="drawer-share-btn" onClick={handleCopyLink}>🔗 Copy Link</button>
      </div>
    </div>
  );
};

// =====================================================================
// REGION STATISTICS
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
        return haversineDistance(lat, lon, coords.lat, coords.lon) <= radius;
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
    <div className="region-stats" role="complementary" aria-label="Watch area statistics">
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

// =====================================================================
// WATCH AREA CIRCLE
// =====================================================================
const WatchAreaCircle = ({ watchArea }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!watchArea || !map) return;
    const L = window.L || require('leaflet');
    const circle = L.circle([watchArea.lat, watchArea.lon], {
      radius: watchArea.radius * 1000,
      color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.05,
      weight: 2, dashArray: '8 4', opacity: 0.5
    }).addTo(map);
    
    const label = L.marker([watchArea.lat, watchArea.lon], {
      icon: L.divIcon({
        className: 'watch-label',
        html: `<div class="watch-label-inner">👁️ ${watchArea.name}</div>`,
        iconSize: [120, 24], iconAnchor: [60, -10]
      })
    }).addTo(map);
    
    return () => { map.removeLayer(circle); map.removeLayer(label); };
  }, [watchArea, map]);
  
  return null;
};

// =====================================================================
// MAP CONTROLLER
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
// TIME CONTROL
// =====================================================================
const TimeControl = ({ timeFilter, setTimeFilter, connected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const currentFilter = TIME_FILTERS.find(f => f.value === timeFilter) || TIME_FILTERS[0];
  
  return (
    <div className="time-control-container">
      <button
        className={`time-control-button ${isExpanded ? 'expanded' : ''} ${connected ? 'connected' : 'disconnected'}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded} aria-label="Time filter"
      >
        <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} aria-hidden="true">
          {connected ? '🟢' : '🔴'}
        </span>
        <span className="filter-icon">🕐</span>
        <span className="filter-label">{currentFilter.displayName}</span>
        <span className="filter-arrow">{isExpanded ? '▼' : '▲'}</span>
      </button>
      {isExpanded && (
        <div className="time-control-dropdown" role="listbox">
          {TIME_FILTERS.map(filter => (
            <button key={filter.value} role="option" aria-selected={timeFilter === filter.value}
              className={`filter-option ${timeFilter === filter.value ? 'active' : ''}`}
              onClick={() => { setTimeFilter(filter.value); setIsExpanded(false); }}>
              {filter.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// TIMELINE SCRUBBER
// =====================================================================
const TimelineScrubber = ({ data, onTimeChange }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(100);
  const [isVisible, setIsVisible] = useState(false);
  const intervalRef = useRef(null);
  
  const play = () => {
    setIsPlaying(true);
    setPosition(0);
    let pos = 0;
    intervalRef.current = setInterval(() => {
      pos += 0.5;
      if (pos >= 100) { pos = 100; setIsPlaying(false); clearInterval(intervalRef.current); }
      setPosition(pos);
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
    return <button className="timeline-toggle-btn" onClick={() => setIsVisible(true)}>⏱️ Timeline</button>;
  }
  
  const daysAgo = ((1 - position / 100) * 7).toFixed(1);
  
  return (
    <div className="timeline-scrubber" role="region" aria-label="Timeline playback">
      <div className="timeline-header">
        <span className="timeline-label">⏱️ TIMELINE</span>
        <span className="timeline-time">{position >= 99 ? 'NOW' : `${daysAgo}d ago`}</span>
        <button className="timeline-close" onClick={() => { stop(); setIsVisible(false); }} aria-label="Close timeline">✕</button>
      </div>
      <div className="timeline-controls">
        <button className="timeline-btn" onClick={isPlaying ? stop : play} aria-label={isPlaying ? 'Stop' : 'Play'}>
          {isPlaying ? '⏹' : '▶️'}
        </button>
        <input type="range" min="0" max="100" step="0.5" value={position}
          onChange={handleSlider} className="timeline-slider" aria-label="Timeline position" />
      </div>
      <div className="timeline-ticks"><span>7d</span><span>5d</span><span>3d</span><span>1d</span><span>Now</span></div>
    </div>
  );
};

// =====================================================================
// STATS DASHBOARD
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
    <div className="stats-dashboard enhanced" role="region" aria-label="Disaster statistics dashboard">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <span>📊 DISASTER MONITOR</span>
          <span className="dashboard-subtitle">{connected ? '⚡ streaming' : '⏸ reconnecting...'}</span>
        </div>
        <button className="minimize-toggle in-header" onClick={() => setIsMinimized(true)} aria-label="Minimize dashboard">—</button>
      </div>
      <div className="stats-grid">
        {allTypes.map(key => {
          const config = DISASTER_CONFIG[key];
          const items = data[key] || [];
          const stats = getStats(key, items);
          const isEnabled = enabledLayers[key];
          const severityClass = stats.severity.toLowerCase();
          return (
            <div key={key}
              className={`stat-card enhanced ${isEnabled ? 'active' : ''} ${severityClass}`}
              onClick={() => setEnabledLayers(prev => ({ ...prev, [key]: !prev[key] }))}
              role="switch" aria-checked={isEnabled} aria-label={`${config.name}: ${stats.count} events`}
            >
              <div className="stat-header">
                <span className="stat-icon" aria-hidden="true">{config.icon}</span>
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
        <div className="alerts-section" role="alert">
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
// POPUP CONTENT
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
            <div className="detail-row"><strong>Magnitude:</strong><span className="detail-value highlight">M{item.magnitude?.toFixed(1)} {item.magType ? `(${item.magType})` : ''}</span></div>
            <div className="detail-row"><strong>Depth:</strong><span className="detail-value">{item.depth?.toFixed(1)} km — {item.depthClass || ''}</span></div>
            {item.mmi > 0 && <div className="detail-row"><strong>Shaking:</strong><span className="detail-value">{item.intensityDesc || `MMI ${item.mmi.toFixed(1)}`}</span></div>}
            {item.felt > 0 && <div className="detail-row"><strong>Felt:</strong><span className="detail-value">{item.felt} reports</span></div>}
            {item.tsunami === 1 && <div className="alert-box tsunami">⚠️ TSUNAMI WARNING</div>}
          </>
        )}

        {type === 'cyclones' && (
          <>
            <div className="detail-row"><strong>Type:</strong><span className="detail-value">{item.stormType} · {item.category}</span></div>
            {item.windSpeed > 0 && <div className="detail-row"><strong>Wind:</strong><span className="detail-value highlight">{item.windSpeed} km/h</span></div>}
            {item.pressure > 0 && <div className="detail-row"><strong>Pressure:</strong><span className="detail-value">{item.pressure} hPa</span></div>}
            {item.movementDesc && <div className="detail-row"><strong>Track:</strong><span className="detail-value">{item.movementDesc}</span></div>}
            {item.population > 0 && <div className="detail-row"><strong>Pop. at Risk:</strong><span className="detail-value">{formatNumber(item.population)}</span></div>}
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
            {floodInfo?.isActive ? (
              <div className="active-flood-badge"><span className="badge-icon">🔴</span><span className="badge-text">ACTIVE — Day {floodInfo.daysActive}</span></div>
            ) : (
              <div className="detail-row"><strong>Status:</strong><span className="detail-value">{floodInfo?.statusLabel || 'Ended'}</span></div>
            )}
            <div className="detail-row"><strong>Alert:</strong><span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel}</span></div>
            {item.country && <div className="detail-row"><strong>Country:</strong><span className="detail-value">{item.country}</span></div>}
            {item.population > 0 && <div className="detail-row"><strong>Pop. at Risk:</strong><span className="detail-value">{formatNumber(item.population)}</span></div>}
            {item.affectedArea > 0 && <div className="detail-row"><strong>Area:</strong><span className="detail-value">{formatNumber(item.affectedArea)} km²</span></div>}
          </>
        )}

        {type === 'volcanoes' && (
          <>
            <div className="detail-row"><strong>Status:</strong><span className={`detail-value ${!item.isClosed ? 'highlight' : ''}`}>{!item.isClosed ? '🔴 Active' : '⚪ Inactive'}</span></div>
            <div className="detail-row"><strong>Alert:</strong><span className={`detail-value alert-${item.alertLevel?.toLowerCase()}`}>{item.alertLevel}</span></div>
            {item.country && <div className="detail-row"><strong>Country:</strong><span className="detail-value">{item.country}</span></div>}
          </>
        )}

        {type === 'weather' && (
          <>
            <div className="detail-row"><strong>Severity:</strong><span className="detail-value">{item.severity} · {item.urgency}</span></div>
            {item.timeRemaining && <div className="detail-row"><strong>Time Left:</strong><span className="detail-value highlight">{item.timeRemaining}</span></div>}
          </>
        )}

        {type === 'landslides' && (
          <>
            {item.fatalities > 0 && <div className="detail-row"><strong>Fatalities:</strong><span className="detail-value highlight">{item.fatalities}</span></div>}
            {item.trigger && <div className="detail-row"><strong>Trigger:</strong><span className="detail-value">{item.trigger}</span></div>}
          </>
        )}

        {type === 'tsunamis' && <div className="alert-box tsunami">⚠️ {severity}</div>}

        {type === 'fires' && (
          <>
            {item.frp > 0 && <div className="detail-row"><strong>FRP:</strong><span className="detail-value">{item.frp.toFixed(1)} MW — {item.intensity || ''}</span></div>}
            {item.satellite && <div className="detail-row"><strong>Satellite:</strong><span className="detail-value">{item.satellite}</span></div>}
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '11px' }}>
        {item.country && <span style={{ color: 'rgba(255,255,255,0.5)' }}>📍 {item.country}</span>}
        <span style={{ color: 'rgba(0,204,255,0.5)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.source || 'GDACS'}</span>
      </div>

      <button className="popup-detail-btn" onClick={() => onOpenDrawer(item, type)}>View Full Details →</button>
    </div>
  );
};

// =====================================================================
// LIVE FEED
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

const LiveFeed = ({ data, connected, onEventClick, activeEventId, onShowAnalytics, onShowPreferences }) => {
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
          timestamp: ts, isNew: true, item
        });
      });
    });

    if (newItems.length > 0) {
      newItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setFeedItems(prev => [...newItems, ...prev].slice(0, MAX_FEED_ITEMS));
      if (isMinimized) setUnreadCount(prev => prev + newItems.length);
    }

    prevDataRef.current = { ...data };
  }, [data, isMinimized]);

  useEffect(() => {
    if (isAutoScroll && listRef.current) listRef.current.scrollTop = 0;
  }, [feedItems, isAutoScroll]);

  const handleScroll = () => {
    if (!listRef.current) return;
    setIsAutoScroll(listRef.current.scrollTop < 10);
  };

  if (isMinimized) {
    return (
      <div className="livefeed-minimized-pill" onClick={() => { setIsMinimized(false); setUnreadCount(0); }}
        role="button" aria-label={`Open live feed. ${unreadCount} unread events.`}>
        <span className="pill-pulse"></span>
        <span className="pill-icon">📡</span>
        <span className="pill-label">LIVE</span>
        {unreadCount > 0 && <span className="pill-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </div>
    );
  }

  return (
    <div className={`livefeed-container ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}
      role="log" aria-label="Live event feed" aria-live="polite">
      <div className="livefeed-header">
        <div className="livefeed-header-left">
          <span className={`livefeed-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          <span className="livefeed-title">LIVE FEED</span>
          <span className="livefeed-count">{feedItems.length}</span>
        </div>
        <div className="livefeed-header-right">
          {onShowAnalytics && (
            <button className="livefeed-btn livefeed-tab-btn" onClick={onShowAnalytics} title="Analytics">📊</button>
          )}
          {onShowPreferences && (
            <button className="livefeed-btn livefeed-tab-btn" onClick={onShowPreferences} title="Settings">⚙️</button>
          )}
          {!isAutoScroll && (
            <button className="livefeed-btn livefeed-btn-top" onClick={() => { if (listRef.current) listRef.current.scrollTop = 0; setIsAutoScroll(true); }}>↑ New</button>
          )}
          <button className="livefeed-btn" onClick={() => setIsMinimized(true)} aria-label="Minimize feed">—</button>
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
            <div key={item.feedId}
              className={`livefeed-item ${item.isNew ? 'livefeed-item-new' : ''} ${activeEventId === item.feedId ? 'livefeed-item-active' : ''}`}
              style={{ '--accent': item.color }}
              onClick={() => onEventClick && onEventClick(item)}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' && onEventClick) onEventClick(item); }}
            >
              <span className="livefeed-item-accent" style={{ background: item.color }}></span>
              <div className="livefeed-item-icon" style={{ background: `${item.color}18` }}>{item.icon}</div>
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
// LEGACY CRITICAL ALERT HOOK (kept as fallback; v5 uses useSmartAlerts)
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
        playAlertSound();
        const title = `⚠️ ${config.name} Alert`;
        const body = `${item.name || item.place || 'Critical event detected'} — ${config.getSeverity?.(item) || 'ALERT'}`;
        sendBrowserNotification(title, body, config.icon);
      });
    });
  }, [data, alertsEnabled]);
};

// =====================================================================
// MOBILE DETECTION HOOK
// =====================================================================
const useIsMobile = (breakpoint = 640) => {
  const [isMobile, setIsMobile] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);
  return isMobile;
};

// =====================================================================
// MOBILE MENU
// =====================================================================
const MobileMenu = ({
  data, enabledLayers, setEnabledLayers, connected,
  timeFilter, setTimeFilter,
  heatmapEnabled, setHeatmapEnabled,
  alertsEnabled, setAlertsEnabled,
  watchArea, setWatchArea,
  onSearchSelect, onWatchArea,
  onShowAnalytics, onShowPreferences
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [watchRadius, setWatchRadius] = useState(200);
  const debounceRef = useRef(null);
  
  const doSearch = useCallback((q) => {
    if (q.length < 2) { setSearchResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
          { headers: { 'User-Agent': 'RealNow-DisasterTracker/5.0' } }
        );
        const d = await res.json();
        setSearchResults(d);
        setSearchOpen(d.length > 0);
      } catch (e) { console.error('Search error:', e); }
    }, 400);
  }, []);

  const handleSearchSelect = (result) => {
    onSearchSelect({ lat: parseFloat(result.lat), lon: parseFloat(result.lon), name: result.display_name, zoom: 10 });
    setSearchQuery(result.display_name.split(',')[0]);
    setSearchOpen(false);
    setIsOpen(false);
  };

  const handleWatch = () => {
    const selected = searchResults[0];
    if (selected) {
      onWatchArea({ lat: parseFloat(selected.lat), lon: parseFloat(selected.lon), name: selected.display_name.split(',')[0], radius: watchRadius });
      setIsOpen(false);
    }
  };

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
      case 'floods': {
        const active = items.filter(f => formatFloodInfo(f).isActive).length;
        if (active > 0) details = `${active} active`;
        severity = active > 3 ? 'HIGH' : active > 0 ? 'MODERATE' : 'LOW';
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
  const totalEvents = allTypes.reduce((sum, type) => sum + (data[type]?.length || 0), 0);
  let criticalCount = 0;
  allTypes.forEach(type => {
    (data[type] || []).forEach(item => {
      if (DISASTER_CONFIG[type].isCritical && DISASTER_CONFIG[type].isCritical(item)) criticalCount++;
    });
  });

  const currentFilter = TIME_FILTERS.find(f => f.value === timeFilter) || TIME_FILTERS[0];

  return (
    <>
      <div className="m-topbar">
        <div className="m-search-row">
          <span className="m-search-icon">🔍</span>
          <input type="text" className="m-search-input" placeholder="Search location..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); doSearch(e.target.value); }}
            onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
          />
          {searchQuery && (
            <button className="m-search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false); }}>✕</button>
          )}
        </div>
        <button className="m-menu-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? '✕' : '☰'}
          {!isOpen && criticalCount > 0 && <span className="m-menu-badge">{criticalCount}</span>}
        </button>
      </div>

      {searchOpen && searchResults.length > 0 && (
        <div className="m-search-results">
          {searchResults.map((r, i) => (
            <div key={i} className="m-search-result-item" onClick={() => handleSearchSelect(r)}>
              <span>📍</span><span className="m-search-result-text">{r.display_name}</span>
            </div>
          ))}
          <div className="m-search-watch-row">
            <select className="m-watch-select" value={watchRadius} onChange={(e) => setWatchRadius(parseInt(e.target.value))}>
              <option value={50}>50 km</option><option value={100}>100 km</option>
              <option value={200}>200 km</option><option value={500}>500 km</option>
            </select>
            <button className="m-watch-btn" onClick={handleWatch}>👁️ Watch</button>
          </div>
        </div>
      )}

      <div className="m-bottombar">
        <div className="m-status-pill" onClick={() => setIsOpen(true)}>
          <span className={`m-status-dot ${connected ? 'on' : ''}`}></span>
          <span className="m-status-label">{currentFilter.displayName}</span>
          <span className="m-status-count">📊 {totalEvents}</span>
        </div>
      </div>

      {isOpen && (
        <>
          <div className="m-menu-backdrop" onClick={() => setIsOpen(false)} />
          <div className="m-menu-drawer">
            <div className="m-menu-header">
              <div>
                <div className="m-menu-title">📊 DISASTER MONITOR</div>
                <div className="m-menu-subtitle">
                  <span className={`m-status-dot ${connected ? 'on' : ''}`}></span>
                  {connected ? 'Streaming live' : 'Reconnecting...'}
                </div>
              </div>
              <button className="m-menu-close" onClick={() => setIsOpen(false)}>✕</button>
            </div>

            <div className="m-menu-body">
              <div className="m-section">
                <div className="m-section-label">LAYERS</div>
                <div className="m-stats-grid">
                  {allTypes.map(key => {
                    const config = DISASTER_CONFIG[key];
                    const items = data[key] || [];
                    const stats = getStats(key, items);
                    const isEnabled = enabledLayers[key];
                    return (
                      <div key={key}
                        className={`m-stat-card ${isEnabled ? 'active' : 'off'} sev-${stats.severity.toLowerCase()}`}
                        onClick={() => setEnabledLayers(prev => ({ ...prev, [key]: !prev[key] }))}>
                        <div className="m-stat-top">
                          <span className="m-stat-icon">{config.icon}</span>
                          <span className="m-stat-count">{stats.count}</span>
                        </div>
                        <div className="m-stat-name">{config.name}</div>
                        {stats.details && <div className="m-stat-details">{stats.details}</div>}
                        {stats.severity !== 'NONE' && stats.severity !== 'LOW' && (
                          <div className={`m-sev-badge sev-${stats.severity.toLowerCase()}`}>{stats.severity}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="m-section">
                <div className="m-section-label">CONTROLS</div>
                <div className="m-controls-row">
                  <button className={`m-ctrl-btn ${heatmapEnabled ? 'active' : ''}`} onClick={() => setHeatmapEnabled(!heatmapEnabled)}>🔥 Heatmap</button>
                  <button className={`m-ctrl-btn ${alertsEnabled ? 'active' : ''}`}
                    onClick={() => {
                      const newVal = !alertsEnabled;
                      setAlertsEnabled(newVal);
                      localStorage.setItem('realnow_alerts', String(newVal));
                      if (newVal && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
                    }}>🔔 Alerts</button>
                  {watchArea && <button className="m-ctrl-btn" onClick={() => setWatchArea(null)}>❌ Clear Watch</button>}
                </div>
                <div className="m-controls-row" style={{marginTop: '6px'}}>
                  <button className="m-ctrl-btn" onClick={() => { setIsOpen(false); onShowAnalytics && onShowAnalytics(); }}>📊 Analytics</button>
                  <button className="m-ctrl-btn" onClick={() => { setIsOpen(false); onShowPreferences && onShowPreferences(); }}>⚙️ Settings</button>
                </div>
              </div>

              <div className="m-section">
                <div className="m-section-label">TIME FILTER</div>
                <div className="m-time-grid">
                  {TIME_FILTERS.map(f => (
                    <button key={f.value}
                      className={`m-time-btn ${timeFilter === f.value ? 'active' : ''}`}
                      onClick={() => setTimeFilter(f.value)}>{f.label}</button>
                  ))}
                </div>
              </div>

              {criticalCount > 0 && (
                <div className="m-section">
                  <button className="m-alerts-btn" onClick={() => setShowAlerts(!showAlerts)}>
                    <span>⚠️ {criticalCount} Critical Alert{criticalCount > 1 ? 's' : ''}</span>
                    <span>{showAlerts ? '▼' : '▶'}</span>
                  </button>
                  {showAlerts && (
                    <div className="m-alerts-list">
                      {data.volcanoes?.filter(v => v.alertLevel === 'Red').map((v, i) => (
                        <div key={`v${i}`} className="m-alert-item volcano">🌋 {v.name} - {v.country}</div>
                      ))}
                      {data.cyclones?.filter(c => c.windSpeed > 119).map((c, i) => (
                        <div key={`c${i}`} className="m-alert-item cyclone">🌀 {c.name} {c.windSpeed ? `${c.windSpeed}km/h` : ''}</div>
                      ))}
                      {data.earthquakes?.filter(e => e.magnitude >= 6).slice(0, 3).map((eq, i) => (
                        <div key={`e${i}`} className="m-alert-item earthquake">🌍 M{eq.magnitude?.toFixed(1)} - {eq.place}</div>
                      ))}
                      {data.tsunamis?.filter(t => t.severity === 'Warning').map((t, i) => (
                        <div key={`t${i}`} className="m-alert-item tsunami">🌊 {t.name || t.region}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="m-menu-footer">
              <span>REALNOW v5.0 — ALL FREE SOURCES</span>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// =====================================================================
// MAIN APP COMPONENT v5.0
// =====================================================================
function App() {
  const { rawData, connected, loading } = useRealtimeData();
  const isMobile = useIsMobile();
  const [timeFilter, setTimeFilter] = useState(0);
  const [enabledLayers, setEnabledLayers] = useState(
    Object.keys(DISASTER_CONFIG).reduce((acc, key) => ({ ...acc, [key]: DISASTER_CONFIG[key].enabled }), {})
  );
  
  // Existing state
  const [flyTarget, setFlyTarget] = useState(null);
  const [activeEventId, setActiveEventId] = useState(null);
  const [highlightPos, setHighlightPos] = useState(null);
  const highlightTimer = useRef(null);
  
  // v4 state (preserved)
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
  
  // ═══════════════════════════════════════════════════════════
  // v5: NEW STATE
  // ═══════════════════════════════════════════════════════════
  const [mapStyle, setMapStyle] = useState(() => {
    try { return localStorage.getItem('realnow_mapstyle') || 'dark'; } catch { return 'dark'; }
  });
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem('realnow_language') || 'en'; } catch { return 'en'; }
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('realnow_sound') !== 'false'; } catch { return true; }
  });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [digestEmail, setDigestEmail] = useState(() => {
    try { return localStorage.getItem('realnow_digest_email') || ''; } catch { return ''; }
  });
  const [digestFrequency, setDigestFrequency] = useState(() => {
    try { return localStorage.getItem('realnow_digest_freq') || 'off'; } catch { return 'off'; }
  });

  // ═══════════════════════════════════════════════════════════
  // v5: Persist new settings
  // ═══════════════════════════════════════════════════════════
  useEffect(() => { try { localStorage.setItem('realnow_mapstyle', mapStyle); } catch {} }, [mapStyle]);
  useEffect(() => { try { localStorage.setItem('realnow_language', language); } catch {} }, [language]);
  useEffect(() => { try { localStorage.setItem('realnow_sound', String(soundEnabled)); } catch {} }, [soundEnabled]);
  useEffect(() => { try { localStorage.setItem('realnow_digest_email', digestEmail); } catch {} }, [digestEmail]);
  useEffect(() => { try { localStorage.setItem('realnow_digest_freq', digestFrequency); } catch {} }, [digestFrequency]);

  const data = filterDataByTime(rawData, timeFilter);
  
  // v5: Smart proximity alerts (replaces basic useCriticalAlerts when watch area is set)
  // Falls back to legacy alerts when no watch area
  useSmartAlerts(data, alertsEnabled, watchArea, { soundEnabled });
  useCriticalAlerts(data, alertsEnabled && !watchArea);
  
  // PWA service worker
  useEffect(() => { registerServiceWorker(); }, []);
  
  // Handle deep link on mount
  useEffect(() => {
    const params = getShareParams();
    if (params.lat && params.lon) {
      setTimeout(() => {
        setFlyTarget({ lat: params.lat, lon: params.lon, zoom: params.zoom || 8, _ts: Date.now() });
      }, 2000);
    }
  }, []);
  
  // Notification permission
  useEffect(() => {
    if (alertsEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [alertsEnabled]);
  
  // Persist watch area
  useEffect(() => {
    if (watchArea) localStorage.setItem('realnow_watcharea', JSON.stringify(watchArea));
    else localStorage.removeItem('realnow_watcharea');
  }, [watchArea]);

  // v5: Sync preferences to backend (fire-and-forget)
  useEffect(() => {
    const prefs = {
      enabledLayers, mapStyle, language, soundEnabled,
      alertsEnabled, digestEmail, digestFrequency,
      watchArea: watchArea ? { lat: watchArea.lat, lon: watchArea.lon, radius: watchArea.radius, name: watchArea.name } : null
    };
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    }).catch(() => {}); // silent fail — preferences are optional
  }, [enabledLayers, mapStyle, language, soundEnabled, alertsEnabled, digestEmail, digestFrequency, watchArea]);

  // Feed click handler
  const handleFeedClick = useCallback((feedItem) => {
    setFlyTarget({ lat: feedItem.lat, lon: feedItem.lon, zoom: 7, _ts: Date.now() });
    setActiveEventId(feedItem.feedId);
    setHighlightPos({ lat: feedItem.lat, lon: feedItem.lon, color: feedItem.color });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => { setHighlightPos(null); setActiveEventId(null); }, 8000);
  }, []);

  const handleSearchSelect = useCallback((result) => {
    setFlyTarget({ lat: result.lat, lon: result.lon, zoom: result.zoom || 10, _ts: Date.now() });
  }, []);
  
  const handleWatchArea = useCallback((area) => {
    setWatchArea(area);
    setFlyTarget({ lat: area.lat, lon: area.lon, zoom: 8, _ts: Date.now() });
  }, []);

  const handleOpenDrawer = useCallback((item, type) => {
    setDrawerItem(item);
    setDrawerType(type);
  }, []);
  
  const handleTimelineChange = useCallback((msAgo) => {
    setTimeFilter(msAgo === 0 ? 0 : msAgo);
  }, []);

  const handleShare = useCallback((msg) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(''), 2500);
  }, []);

  // Render markers (for non-fire, non-clustered types)
  const renderDisasterMarkers = (items, type) => {
    // v5: fires use ClusterLayer instead
    if (type === 'fires') return null;
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
        <div style={{fontSize: '0.8em', color: '#666', marginTop: '8px'}}>v5.0 — All Free Sources</div>
      </div>
    );
  }

  return (
    <I18nProvider language={language}>
      <div className="app-container" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        {/* v5: Skip navigation link for accessibility */}
        <a href="#main-map" className="sr-only" style={{
          position: 'absolute', top: '-40px', left: 0, background: '#000', color: '#fff',
          padding: '8px 16px', zIndex: 10000, fontSize: '14px',
          transition: 'top 0.2s'
        }} onFocus={(e) => e.target.style.top = '0'}
          onBlur={(e) => e.target.style.top = '-40px'}>
          Skip to map
        </a>

        <MapContainer id="main-map" center={[20, 0]} zoom={2} className="map-container" zoomControl={false} worldCopyJump={true}>
          {/* v5: MapStyleSwitcher replaces hardcoded TileLayer */}
          <MapStyleSwitcher mapStyle={mapStyle} onStyleChange={setMapStyle} />
          
          <MapController flyTarget={flyTarget} />
          
          {/* v4: Heatmap layer */}
          {heatmapEnabled && <HeatmapLayer data={data} enabledLayers={enabledLayers} />}
          
          {/* v4: Watch area circle */}
          {watchArea && <WatchAreaCircle watchArea={watchArea} />}
          
          {/* v5: Disaster polygon overlays (flood zones, wildfire areas, drought zones) */}
          <DisasterPolygons data={data} enabledLayers={enabledLayers} />
          
          {/* v5: Cyclone wind radius circles */}
          {enabledLayers.cyclones && data.cyclones?.map((cyclone, i) => (
            <CycloneTrackLine key={`ct-${i}`} cyclone={cyclone} />
          ))}
          
          {/* v5: Clustered fires layer */}
          {enabledLayers.fires && data.fires?.length > 0 && (
            <ClusterLayer
              data={data.fires}
              type="fires"
              config={DISASTER_CONFIG.fires}
              onOpenDrawer={handleOpenDrawer}
            />
          )}
          
          {/* All other disaster markers */}
          {Object.keys(data).map(type => renderDisasterMarkers(data[type], type))}

          {/* Highlight rings */}
          {highlightPos && (
            <>
              <CircleMarker center={[highlightPos.lat, highlightPos.lon]} radius={22} fillColor="transparent" color={highlightPos.color || '#ffffff'} weight={3} opacity={0.9} fillOpacity={0} className="highlight-ring" />
              <CircleMarker center={[highlightPos.lat, highlightPos.lon]} radius={35} fillColor="transparent" color={highlightPos.color || '#ffffff'} weight={1.5} opacity={0.4} fillOpacity={0} className="highlight-ring-outer" />
            </>
          )}
        </MapContainer>
        
        {/* v5: Analytics/Settings now integrated into LiveFeed header tabs */}

        {isMobile ? (
          <>
            <MobileMenu
              data={data} enabledLayers={enabledLayers} setEnabledLayers={setEnabledLayers}
              connected={connected} timeFilter={timeFilter} setTimeFilter={setTimeFilter}
              heatmapEnabled={heatmapEnabled} setHeatmapEnabled={setHeatmapEnabled}
              alertsEnabled={alertsEnabled} setAlertsEnabled={setAlertsEnabled}
              watchArea={watchArea} setWatchArea={setWatchArea}
              onSearchSelect={handleSearchSelect} onWatchArea={handleWatchArea}
              onShowAnalytics={() => setShowAnalytics(true)}
              onShowPreferences={() => setShowPreferences(true)}
            />
            <LiveFeed data={data} connected={connected} onEventClick={handleFeedClick} activeEventId={activeEventId}
              onShowAnalytics={() => setShowAnalytics(true)} onShowPreferences={() => setShowPreferences(true)} />
          </>
        ) : (
          <>
            <LocationSearch onSelect={handleSearchSelect} onWatchArea={handleWatchArea} />
            <StatsDashboard data={data} enabledLayers={enabledLayers} setEnabledLayers={setEnabledLayers} connected={connected} />
            {watchArea && <RegionStats data={data} watchArea={watchArea} />}
            <TimeControl timeFilter={timeFilter} setTimeFilter={setTimeFilter} connected={connected} />
            <TimelineScrubber data={data} onTimeChange={handleTimelineChange} />
            
            {/* v4 controls bar */}
            <div className="v4-controls">
              <button className={`v4-ctrl-btn ${heatmapEnabled ? 'active' : ''}`}
                onClick={() => setHeatmapEnabled(!heatmapEnabled)} title="Toggle heatmap">🔥 Heatmap</button>
              <button className={`v4-ctrl-btn ${alertsEnabled ? 'active' : ''}`}
                onClick={() => {
                  const newVal = !alertsEnabled;
                  setAlertsEnabled(newVal);
                  localStorage.setItem('realnow_alerts', String(newVal));
                  if (newVal && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
                }} title="Toggle alerts">🔔 Alerts</button>
              {watchArea && (
                <button className="v4-ctrl-btn" onClick={() => setWatchArea(null)} title="Clear watch area">❌ Clear Watch</button>
              )}
            </div>
            
            <LiveFeed data={data} connected={connected} onEventClick={handleFeedClick} activeEventId={activeEventId}
              onShowAnalytics={() => setShowAnalytics(true)} onShowPreferences={() => setShowPreferences(true)} />
          </>
        )}
        
        {/* v4: Detail Drawer */}
        <DetailDrawer item={drawerItem} type={drawerType} onClose={() => { setDrawerItem(null); setDrawerType(null); }} onShare={handleShare} />
        
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* v5: ANALYTICS DASHBOARD */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showAnalytics && (
          <AnalyticsDashboard
            data={data}
            isOpen={true}
            connected={connected}
            onClose={() => setShowAnalytics(false)}
          />
        )}
        
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* v5: PREFERENCES PANEL */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showPreferences && (
          <PreferencesPanel
            isOpen={true}
            onClose={() => setShowPreferences(false)}
            mapStyle={mapStyle} onMapStyleChange={setMapStyle}
            language={language} onLanguageChange={setLanguage}
            alertsEnabled={alertsEnabled} onAlertsToggle={setAlertsEnabled}
            soundEnabled={soundEnabled} onSoundToggle={setSoundEnabled}
            watchArea={watchArea} onClearWatchArea={() => setWatchArea(null)}
            digestEmail={digestEmail} onDigestEmailChange={setDigestEmail}
            digestFrequency={digestFrequency} onDigestFrequencyChange={setDigestFrequency}
          />
        )}
        
        {/* v4: Share toast */}
        {shareToast && <div className="share-toast" role="status">{shareToast}</div>}
      </div>
    </I18nProvider>
  );
}

export default App;