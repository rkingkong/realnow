// ============================================================================
// ClusterLayer.js — Marker Clustering for Performance
// Drop into: /var/www/realnow/frontend/src/components/ClusterLayer.js
// ============================================================================
//
// Provides marker clustering for large datasets (especially fires/hotspots).
// Uses a custom canvas-based approach that doesn't require any external
// clustering library — works with the existing react-leaflet setup.
//
// How it works:
// - Groups nearby markers into clusters at lower zoom levels
// - Shows individual markers when zoomed in past the breakpoint
// - Custom cluster icons show event count + color-coded severity
// - Dramatically improves performance for 1000+ marker datasets
//
// Usage in App.js:
//   import ClusterLayer from './components/ClusterLayer';
//   <ClusterLayer items={data.fires} type="fires" config={DISASTER_CONFIG.fires} map={map} />
// ============================================================================

import React, { useMemo, useState, useEffect } from 'react';
import { CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';

// ── Simple Grid-Based Clustering ────────────────────────────────────────────

/**
 * Cluster items by grid cells at the current zoom level.
 * Grid size decreases as zoom increases, so clusters break apart when you zoom in.
 */
function clusterByGrid(items, zoom, getCoords, options = {}) {
  const {
    minZoomForClusters = 2,
    maxZoomForClusters = 10,  // Above this zoom, show individual markers
    gridSizeDeg = null        // Override grid size in degrees
  } = options;

  if (zoom > maxZoomForClusters) {
    // Show all individual markers
    return items.map(item => ({
      type: 'marker',
      item,
      coords: getCoords(item),
      count: 1
    }));
  }

  // Grid cell size in degrees (gets smaller as zoom increases)
  const cellSize = gridSizeDeg || Math.max(0.5, 40 / Math.pow(2, zoom));
  const grid = new Map();

  items.forEach(item => {
    const coords = getCoords(item);
    if (!coords) return;

    const cellX = Math.floor(coords.lon / cellSize);
    const cellY = Math.floor(coords.lat / cellSize);
    const key = `${cellX}_${cellY}`;

    if (!grid.has(key)) {
      grid.set(key, {
        items: [],
        sumLat: 0,
        sumLon: 0
      });
    }

    const cell = grid.get(key);
    cell.items.push(item);
    cell.sumLat += coords.lat;
    cell.sumLon += coords.lon;
  });

  const results = [];
  for (const [key, cell] of grid) {
    const count = cell.items.length;
    const avgLat = cell.sumLat / count;
    const avgLon = cell.sumLon / count;

    if (count === 1) {
      results.push({
        type: 'marker',
        item: cell.items[0],
        coords: { lat: avgLat, lon: avgLon },
        count: 1
      });
    } else {
      results.push({
        type: 'cluster',
        items: cell.items,
        coords: { lat: avgLat, lon: avgLon },
        count
      });
    }
  }

  return results;
}

// ── Cluster Marker Component ───────────────────────────────────────────────

const ClusterMarker = ({ cluster, color, icon }) => {
  const { coords, count, items } = cluster;
  
  // Size based on count
  const radius = Math.min(8 + Math.log2(count) * 6, 35);
  
  // Find most severe item for color intensity
  const maxSeverity = items.reduce((max, item) => {
    const score = (item.alertLevel === 'Red' ? 3 : item.alertLevel === 'Orange' ? 2 : 1) +
                  ((item.magnitude || 0) / 3) + ((item.frp || 0) / 100);
    return Math.max(max, score);
  }, 0);
  const opacity = Math.min(0.4 + maxSeverity * 0.15, 0.9);

  // Tooltip with summary
  const severeCnt = items.filter(i => 
    i.alertLevel === 'Red' || (i.magnitude || 0) >= 6 || (i.frp || 0) > 100
  ).length;

  return (
    <CircleMarker
      center={[coords.lat, coords.lon]}
      radius={radius}
      fillColor={color}
      color={color}
      weight={2}
      opacity={opacity + 0.1}
      fillOpacity={opacity}
    >
      <Tooltip direction="top" offset={[0, -radius]} opacity={0.9}>
        <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
          <strong>{icon} {count} events</strong>
          {severeCnt > 0 && (
            <><br /><span style={{ color: '#ff4444' }}>🚨 {severeCnt} critical</span></>
          )}
          <br />
          <span style={{ color: '#888', fontSize: 10 }}>Zoom in for details</span>
        </div>
      </Tooltip>
    </CircleMarker>
  );
};

// ── Main ClusterLayer Component ────────────────────────────────────────────

const ClusterLayer = ({ 
  items, 
  type, 
  config, 
  enabled = true,
  renderMarker,           // Custom marker renderer: (item, index) => JSX
  clusterOptions = {}     // Override clustering options
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  // Track zoom changes
  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [map]);

  // Coordinate extractor
  const getCoords = (item) => {
    if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
      return { lat: item.coordinates[1], lon: item.coordinates[0] };
    }
    if (item.latitude !== undefined && item.longitude !== undefined) {
      return { lat: item.latitude, lon: item.longitude };
    }
    return null;
  };

  // Cluster computation
  const clusters = useMemo(() => {
    if (!items?.length || !enabled) return [];
    
    return clusterByGrid(items, zoom, getCoords, {
      maxZoomForClusters: type === 'fires' ? 8 : 10,  // Fires cluster longer
      ...clusterOptions
    });
  }, [items, zoom, enabled, type, clusterOptions]);

  if (!enabled || !items?.length) return null;

  return (
    <>
      {clusters.map((cluster, idx) => {
        if (cluster.type === 'marker') {
          // Individual marker — use custom renderer or default
          if (renderMarker) {
            return renderMarker(cluster.item, idx);
          }
          
          // Default marker
          const item = cluster.item;
          const coords = cluster.coords;
          const radius = config.getRadius ? config.getRadius(item) : 8;
          const opacity = config.getOpacity ? config.getOpacity(item) : 0.6;
          
          return (
            <CircleMarker
              key={`${type}_${item.id || idx}`}
              center={[coords.lat, coords.lon]}
              radius={radius}
              fillColor={config.color}
              color={config.color}
              weight={2}
              opacity={opacity + 0.2}
              fillOpacity={opacity}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {config.icon} {item.name || item.place || config.name}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        }

        // Cluster marker
        return (
          <ClusterMarker
            key={`cluster_${type}_${idx}`}
            cluster={cluster}
            color={config.color}
            icon={config.icon}
          />
        );
      })}
    </>
  );
};

export default ClusterLayer;
export { clusterByGrid };