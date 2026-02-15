// App.js - UPDATED WITH COMBINED CONTROLS AND IMPROVED FLOOD DISPLAY
import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, Tooltip, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Disaster configuration - FLIGHTS REMOVED
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
  weather: { 
    color: '#4488ff', 
    icon: '⛈️', 
    name: 'Weather',
    enabled: true,
    getRadius: () => 10,
    getSeverity: (item) => item.severity?.toUpperCase() || 'ALERT',
    getOpacity: (item) => item.severity === 'Extreme' ? 0.9 : 0.6
  },
  volcanoes: { 
    color: '#ff0066', 
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
      if (level === 'GREEN') return 'MONITORING';
      return 'ACTIVE';
    },
    getOpacity: (item) => {
      if (item.alertLevel === 'Red') return 0.9;
      if (item.alertLevel === 'Orange') return 0.7;
      return 0.5;
    }
  },
  cyclones: { 
    color: '#00ffcc', 
    icon: '🌀', 
    name: 'Cyclones/Hurricanes',
    enabled: true,
    getRadius: (item) => {
      const speed = item.windSpeed || 0;
      if (speed > 250) return 30;
      if (speed > 210) return 25;
      if (speed > 180) return 20;
      if (speed > 150) return 15;
      return Math.max(speed / 10, 12);
    },
    getSeverity: (item) => {
      const speed = item.windSpeed || 0;
      const cat = item.category || '';
      
      if (item.stormType && item.stormType !== 'Tropical Depression') {
        return item.stormType.toUpperCase();
      }
      
      if (cat) return cat.toUpperCase();
      if (speed > 250) return 'CAT 5 HURRICANE';
      if (speed > 210) return 'CAT 4 HURRICANE';
      if (speed > 180) return 'CAT 3 HURRICANE';
      if (speed > 150) return 'CAT 2 HURRICANE';
      if (speed > 120) return 'CAT 1 HURRICANE';
      if (speed > 63) return 'TROPICAL STORM';
      return 'TROPICAL DEPRESSION';
    },
    getOpacity: (item) => {
      if (item.isActive) return 0.9;
      return 0.6;
    }
  },
  floods: { 
    color: '#0099ff', 
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
      if (level === 'RED') return 'CRITICAL';
      if (level === 'ORANGE') return 'SEVERE';
      return item.severity?.toUpperCase() || 'MODERATE';
    },
    getOpacity: (item) => item.alertLevel === 'Red' ? 0.8 : 0.5
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
  }
};

// Time filter options
const TIME_FILTERS = [
  { label: 'Live', value: 0, displayName: 'LIVE' },
  { label: '5 min', value: 5 * 60 * 1000, displayName: 'LAST 5 MIN' },
  { label: '30 min', value: 30 * 60 * 1000, displayName: 'LAST 30 MIN' },
  { label: '1 hr', value: 60 * 60 * 1000, displayName: 'LAST HOUR' },
  { label: '3 hr', value: 3 * 60 * 60 * 1000, displayName: 'LAST 3 HOURS' },
  { label: '12 hr', value: 12 * 60 * 60 * 1000, displayName: 'LAST 12 HOURS' },
  { label: '2 days', value: 2 * 24 * 60 * 60 * 1000, displayName: 'LAST 2 DAYS' },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000, displayName: 'LAST WEEK' }
];

// Helper functions
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

// NEW: Helper function to format flood information
const formatFloodInfo = (flood) => {
  // Calculate days active
  const startDate = new Date(flood.fromDate);
  const now = new Date();
  const daysActive = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  
  // Extract the month/year from the original name
  const nameMatch = flood.name.match(/(\w+)\s+(\d{4})/);
  const monthYear = nameMatch ? `${nameMatch[1]} ${nameMatch[2]}` : '';
  
  // Create clearer name
  let clearName = flood.name;
  if (nameMatch) {
    const floodType = flood.name.split(' - ')[0];
    // Make it clear these are ACTIVE floods
    clearName = `${floodType} (Active since ${monthYear})`;
  }
  
  return {
    clearName,
    daysActive,
    isActive: flood.status === 'ongoing' || flood.status === 'active' || 
              new Date(flood.toDate) >= new Date()
  };
};

// Function to filter data by time
const filterDataByTime = (data, timeFilter) => {
  if (timeFilter === 0) return data; // Live - show all
  
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

// Custom hook for real-time data
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

    // Listen for updates from all data sources
    Object.keys(DISASTER_CONFIG).forEach(type => {
      socket.on(`update:${type}`, (newData) => {
        console.log(`Received ${type} update:`, newData?.count || 0, 'items');
        setRawData(prev => ({ 
          ...prev, 
          [type]: newData?.features || []
        }));
      });
    });

    // Fetch initial data
    fetch('/api/aggregate')
      .then(res => res.json())
      .then(aggregateData => {
        console.log('Initial data loaded:', aggregateData);
        const processedData = {};
        
        // Process each data type and log counts
        Object.keys(aggregateData).forEach(key => {
          // Skip flights data
          if (key === 'flights') return;
          
          if (key === 'earthquakesDetail') {
            processedData['earthquakes'] = aggregateData[key]?.features || [];
          } else if (key !== 'earthquakes' || !processedData['earthquakes']) {
            processedData[key] = aggregateData[key]?.features || [];
          }
          
          // Log data counts for debugging
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

// COMBINED Date Filter + Connection Status Component
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

// Stats Dashboard Component with Minimize Feature
const StatsDashboard = ({ data, enabledLayers, setEnabledLayers }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  
  const getStats = (type, items) => {
    if (!items?.length) return { severity: 'NONE', count: 0, details: '' };
    
    let details = '';
    let severity = 'LOW';
    
    switch(type) {
      case 'earthquakes':
        const maxMag = Math.max(...items.map(e => e.magnitude || 0));
        const major = items.filter(e => e.magnitude >= 6).length;
        const moderate = items.filter(e => e.magnitude >= 4 && e.magnitude < 6).length;
        if (maxMag > 0) details = `M${maxMag.toFixed(1)} max`;
        if (major > 0) details += ` • ${major} major`;
        severity = maxMag >= 7 ? 'EXTREME' : maxMag >= 6 ? 'HIGH' : maxMag >= 5 ? 'MODERATE' : 'LOW';
        break;
        
      case 'volcanoes':
        const red = items.filter(v => v.alertLevel === 'Red').length;
        const orange = items.filter(v => v.alertLevel === 'Orange').length;
        if (red > 0) details = `${red} erupting`;
        if (orange > 0) details += details ? ` • ${orange} warning` : `${orange} warning`;
        severity = red > 0 ? 'EXTREME' : orange > 0 ? 'HIGH' : 'MODERATE';
        break;
        
      case 'cyclones':
        const maxWind = Math.max(...items.map(c => c.windSpeed || 0));
        const cat5 = items.filter(c => c.windSpeed > 250).length;
        const cat4 = items.filter(c => c.windSpeed > 210 && c.windSpeed <= 250).length;
        const activeStorms = items.filter(c => c.isActive).length;
        
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
        } else if (activeStorms > 0) {
          details = `${activeStorms} active`;
        }
        
        if (cat5 > 0) details += ` • ${cat5} Cat5`;
        severity = maxWind > 250 ? 'EXTREME' : maxWind > 180 ? 'HIGH' : items.length > 0 ? 'MODERATE' : 'LOW';
        break;
        
      case 'wildfires':
        const redWildfires = items.filter(w => w.alertLevel === 'Red').length;
        const orangeWildfires = items.filter(w => w.alertLevel === 'Orange').length;
        if (redWildfires > 0) details = `${redWildfires} critical`;
        if (orangeWildfires > 0) details += ` • ${orangeWildfires} severe`;
        severity = redWildfires > 0 ? 'HIGH' : orangeWildfires > 0 ? 'MODERATE' : 'LOW';
        break;
        
      case 'floods':
        const redFloods = items.filter(f => f.alertLevel === 'Red').length;
        const activeFloods = items.filter(f => {
          const info = formatFloodInfo(f);
          return info.isActive;
        }).length;
        if (redFloods > 0) details = `${redFloods} critical`;
        if (activeFloods > 0) details += ` • ${activeFloods} active now`;
        severity = redFloods > 0 ? 'HIGH' : 'MODERATE';
        break;
        
      case 'droughts':
        const severe = items.filter(d => d.alertLevel === 'Red' || d.alertLevel === 'Orange').length;
        const totalPop = items.reduce((sum, d) => sum + (d.population || 0), 0);
        if (severe > 0) details = `${severe} severe`;
        if (totalPop > 0) details += ` • ${formatNumber(totalPop)} affected`;
        severity = severe > 5 ? 'HIGH' : 'MODERATE';
        break;
        
      case 'fires':
        const extreme = items.filter(f => f.frp > 500).length;
        const high = items.filter(f => f.frp > 200).length;
        if (extreme > 0) details = `${extreme} extreme`;
        if (high > 0) details += ` • ${high} high intensity`;
        severity = extreme > 10 ? 'EXTREME' : extreme > 0 ? 'HIGH' : 'MODERATE';
        break;
        
      case 'spaceweather':
        const kp = items[0]?.currentKp || 0;
        const sev = items[0]?.severity || 'quiet';
        details = `Kp ${kp} • ${sev}`;
        severity = kp >= 7 ? 'HIGH' : kp >= 5 ? 'MODERATE' : 'LOW';
        break;
        
      case 'weather':
        const extremeWeather = items.filter(w => w.severity === 'Extreme').length;
        const severeWeather = items.filter(w => w.severity === 'Severe').length;
        if (extremeWeather > 0) details = `${extremeWeather} extreme`;
        if (severeWeather > 0) details += ` • ${severeWeather} severe`;
        severity = extremeWeather > 0 ? 'HIGH' : severeWeather > 0 ? 'MODERATE' : 'LOW';
        break;
        
      default:
        details = `${items.length} active`;
    }
    
    return { severity, count: items.length, details };
  };

  // Count critical alerts
  const criticalCount = 
    (data.volcanoes?.filter(v => v.alertLevel === 'Red').length || 0) +
    (data.cyclones?.filter(c => c.windSpeed > 119 || c.stormType?.includes('Hurricane') || c.stormType?.includes('Typhoon')).length || 0) +
    (data.earthquakes?.filter(e => e.magnitude >= 6).length || 0);

  if (isMinimized) {
    return (
      <div className="stats-dashboard minimized">
        <button 
          className="minimize-toggle"
          onClick={() => setIsMinimized(false)}
          title="Expand Dashboard"
        >
          <span className="toggle-icon">📊</span>
          <span className="toggle-text">Show Stats</span>
          {criticalCount > 0 && (
            <span className="critical-badge">{criticalCount}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="stats-dashboard enhanced">
      <div className="dashboard-header">
        <h2 className="dashboard-title">🌍 GLOBAL DISASTER MONITOR</h2>
        <button 
          className="minimize-toggle in-header"
          onClick={() => setIsMinimized(true)}
          title="Minimize Dashboard"
        >
          ➖
        </button>
      </div>
      
      <div className="stats-grid">
        {Object.entries(DISASTER_CONFIG).map(([key, config]) => {
          const items = data[key] || [];
          const stats = getStats(key, items);
          const severityClass = `severity-${stats.severity.toLowerCase().replace(' ', '-')}`;
          
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
      
      {/* Collapsible Critical Alerts Section */}
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

// Popup Content Component with correct data fields
const PopupContent = ({ item, type, config }) => {
  const severity = config.getSeverity ? config.getSeverity(item) : 'UNKNOWN';
  const severityClass = `severity-${severity.toLowerCase().replace(/ /g, '-')}`;
  
  // Special handling for floods
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
        {/* WILDFIRES - GDACS wildfire fields */}
        {type === 'wildfires' && (
          <>
            {/* Active/Ended Status Badge */}
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
                ⚠️ Data may be outdated — last verified over 72 hours ago
              </div>
            )}
            {item.description && (
              <div className="detail-description">{item.description}</div>
            )}
          </>
        )}

        {/* Updated FLOODS section with active badge */}
        {type === 'floods' && (
          <>
            {/* Active Status Badge */}
            {floodInfo && floodInfo.isActive && (
              <div className="active-flood-badge">
                <span className="badge-icon">🔴</span>
                <span className="badge-text">ACTIVE NOW - Day {floodInfo.daysActive}</span>
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
            <div className="detail-row">
              <strong>Started:</strong> 
              <span className="detail-value">
                {new Date(item.fromDate).toLocaleDateString()} ({floodInfo.daysActive} days ago)
              </span>
            </div>
            {item.description && (
              <div className="detail-description">{item.description}</div>
            )}
          </>
        )}

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
        
        {/* Location for all types */}
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

// Main App Component
function App() {
  const { rawData, connected, loading } = useRealtimeData();
  const [timeFilter, setTimeFilter] = useState(0); // Default to Live
  const [enabledLayers, setEnabledLayers] = useState(
    Object.keys(DISASTER_CONFIG).reduce((acc, key) => ({ 
      ...acc, 
      [key]: DISASTER_CONFIG[key].enabled 
    }), {})
  );

  // Filter data based on time selection
  const data = filterDataByTime(rawData, timeFilter);

  // Render disaster markers
  const renderDisasterMarkers = (items, type) => {
    if (!enabledLayers[type] || !items?.length) return null;
    
    const config = DISASTER_CONFIG[type];
    const markers = [];
    
    items.forEach((item, index) => {
      let lat, lon;
      
      // Handle different coordinate formats
      if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
        lon = item.coordinates[0];
        lat = item.coordinates[1];
      } else if (item.latitude !== undefined && item.longitude !== undefined) {
        lat = item.latitude;
        lon = item.longitude;
      } else {
        return; // Skip if no valid coordinates
      }
      
      if (isNaN(lat) || isNaN(lon)) return;
      
      const radius = config.getRadius ? config.getRadius(item) : 8;
      const opacity = config.getOpacity ? config.getOpacity(item) : 0.6;
      const severity = config.getSeverity ? config.getSeverity(item) : '';
      
      // Special handling for flood names and cyclones
      const displayName = type === 'floods' ? 
        formatFloodInfo(item).clearName : 
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
              {type === 'floods' && formatFloodInfo(item).isActive && (
                <>
                  <br />
                  <span style={{color: '#ff6666', fontSize: '0.7em'}}>
                    ⚠️ ACTIVE - Day {formatFloodInfo(item).daysActive}
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
        
        {/* Render all disaster types */}
        {Object.keys(data).map(type => 
          renderDisasterMarkers(data[type], type)
        )}
      </MapContainer>
      
      <StatsDashboard 
        data={data} 
        enabledLayers={enabledLayers}
        setEnabledLayers={setEnabledLayers}
      />
      
      {/* COMBINED Time Control - bottom-left with connection status */}
      <TimeControl 
        timeFilter={timeFilter} 
        setTimeFilter={setTimeFilter}
        connected={connected}
      />
    </div>
  );
}

export default App;