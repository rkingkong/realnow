// ============================================================================
// SmartAlerts.js — Proximity-Based Alert System
// Drop into: /var/www/realnow/frontend/src/components/SmartAlerts.js
// ============================================================================
//
// Replaces the basic useCriticalAlerts hook with a smarter version that:
// - Calculates distance from the user's watch area
// - Includes distance in notifications ("M6.2 earthquake, 85km from your watch area")
// - Prioritizes alerts by proximity + severity
// - Debounces to avoid notification spam
// - Tracks which events have already been alerted
//
// Usage in App.js:
//   import { useSmartAlerts } from './components/SmartAlerts';
//   useSmartAlerts(data, alertsEnabled, watchArea);
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';

// Haversine distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCoords(item) {
  if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
    return { lat: item.coordinates[1], lon: item.coordinates[0] };
  }
  if (item.latitude !== undefined && item.longitude !== undefined) {
    return { lat: item.latitude, lon: item.longitude };
  }
  return null;
}

const ALERT_CONFIGS = {
  earthquakes: {
    icon: '🌍',
    isCritical: (item) => (item.magnitude || 0) >= 5.5,
    getSummary: (item) => `M${(item.magnitude || 0).toFixed(1)} Earthquake`,
    getDetail: (item) => item.place || item.name || 'Unknown location'
  },
  cyclones: {
    icon: '🌀',
    isCritical: (item) => (item.windSpeed || 0) >= 100 || item.alertLevel === 'Red',
    getSummary: (item) => `${item.stormType || 'Cyclone'}: ${item.name || 'Unknown'}`,
    getDetail: (item) => item.windSpeed ? `Wind: ${item.windSpeed} km/h` : ''
  },
  floods: {
    icon: '🌊',
    isCritical: (item) => item.alertLevel === 'Red' || item.alertLevel === 'Orange',
    getSummary: (item) => `Flood Alert`,
    getDetail: (item) => item.name || item.place || 'Unknown area'
  },
  wildfires: {
    icon: '🔥',
    isCritical: (item) => item.alertLevel === 'Red' || item.affectedArea > 500,
    getSummary: (item) => `Wildfire${item.isActive ? ' (Active)' : ''}`,
    getDetail: (item) => item.name || item.place || 'Unknown area'
  },
  volcanoes: {
    icon: '🌋',
    isCritical: (item) => item.alertLevel === 'Red',
    getSummary: (item) => `Volcanic Activity`,
    getDetail: (item) => item.name || 'Unknown volcano'
  },
  tsunamis: {
    icon: '🌊',
    isCritical: (item) => item.severity === 'Warning' || item.severity === 'Watch',
    getSummary: (item) => `Tsunami ${item.severity || 'Alert'}`,
    getDetail: (item) => item.name || item.place || 'Pacific region'
  },
  landslides: {
    icon: '⛰️',
    isCritical: (item) => (item.fatalities || 0) > 5,
    getSummary: (item) => `Landslide${item.fatalities ? ` (${item.fatalities} fatalities)` : ''}`,
    getDetail: (item) => item.name || item.place || 'Unknown location'
  }
};

// Sound player
function playAlertSound(priority = 'normal') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (priority === 'critical') {
      // Urgent two-tone
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.24);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.36);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else {
      // Gentle ping
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) { /* silent fail */ }
}

// Browser notification
function sendNotification(title, body, tag = 'realnow') {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '🌍', tag, renotify: true });
    } catch (e) { /* mobile fallback */ }
  }
}

/**
 * Smart Alerts Hook
 * @param {Object} data — Current disaster data
 * @param {boolean} alertsEnabled — Whether alerts are turned on
 * @param {Object|null} watchArea — { lat, lon, radiusKm, label } or null
 * @param {Object} options — { soundEnabled: boolean }
 */
export function useSmartAlerts(data, alertsEnabled, watchArea, options = {}) {
  const { soundEnabled = true } = options;
  const alertedIds = useRef(new Set());
  const lastAlertTime = useRef(0);
  const ALERT_COOLDOWN = 10000; // 10 second minimum between alerts

  const checkAlerts = useCallback(() => {
    if (!alertsEnabled || !data) return;

    const now = Date.now();
    if (now - lastAlertTime.current < ALERT_COOLDOWN) return;

    const newAlerts = [];

    Object.entries(ALERT_CONFIGS).forEach(([type, config]) => {
      const items = data[type];
      if (!items?.length) return;

      items.forEach(item => {
        const id = item.id || `${type}_${item.name}_${item.latitude}_${item.longitude}`;
        if (alertedIds.current.has(id)) return;
        if (!config.isCritical(item)) return;

        const coords = getCoords(item);
        if (!coords) return;

        let distance = null;
        let isNearby = false;

        if (watchArea) {
          distance = haversineKm(watchArea.lat, watchArea.lon, coords.lat, coords.lon);
          isNearby = distance <= (watchArea.radiusKm || 500);
        }

        // Calculate priority score (lower = more urgent)
        let priority = 50;
        if (isNearby) priority -= 30;
        if (distance && distance < 100) priority -= 10;
        if (type === 'earthquakes' && (item.magnitude || 0) >= 7) priority -= 20;
        if (type === 'tsunamis') priority -= 15;
        if (item.alertLevel === 'Red') priority -= 10;

        newAlerts.push({
          id, type, item, config, distance, isNearby, priority
        });
      });
    });

    if (newAlerts.length === 0) return;

    // Sort by priority (most urgent first)
    newAlerts.sort((a, b) => a.priority - b.priority);

    // Process the most urgent alert
    const top = newAlerts[0];
    const summary = top.config.getSummary(top.item);
    const detail = top.config.getDetail(top.item);
    const distText = top.distance != null
      ? ` — ${Math.round(top.distance)}km from ${watchArea?.label || 'your watch area'}`
      : '';
    const nearbyTag = top.isNearby ? ' ⚠️ NEARBY' : '';

    const title = `${top.config.icon} ${summary}${nearbyTag}`;
    const body = `${detail}${distText}`;

    // Send notification
    sendNotification(title, body, `realnow-${top.type}`);

    // Play sound
    if (soundEnabled) {
      playAlertSound(top.isNearby || top.priority < 10 ? 'critical' : 'normal');
    }

    // Mark all new alerts as seen
    newAlerts.forEach(a => alertedIds.current.add(a.id));
    lastAlertTime.current = now;

    // Log
    console.log(`🚨 [SmartAlert] ${title}: ${body} (${newAlerts.length} new events)`);

  }, [data, alertsEnabled, watchArea, soundEnabled]);

  useEffect(() => {
    checkAlerts();
  }, [checkAlerts]);

  // Request notification permission
  useEffect(() => {
    if (alertsEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [alertsEnabled]);
}

export default useSmartAlerts;