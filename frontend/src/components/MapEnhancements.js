// ============================================================================
// MapEnhancements.js — Satellite Toggle, Polygon Overlays, Wind Field
// Drop into: /var/www/realnow/frontend/src/components/MapEnhancements.js
// ============================================================================
//
// Components:
// 1. MapStyleSwitcher — Toggle between dark, satellite, terrain base maps
// 2. DisasterPolygons — Flood extent and cyclone track polygons
// 3. CycloneTrackLine — Animated cyclone path visualization
//
// Usage in App.js:
//   import { MapStyleSwitcher, DisasterPolygons, CycloneTrackLine } from './components/MapEnhancements';
//   
//   Inside <MapContainer>:
//     <MapStyleSwitcher style={mapStyle} />
//     <DisasterPolygons data={data} enabledLayers={enabledLayers} />
//     <CycloneTrackLine cyclones={data.cyclones} enabled={enabledLayers.cyclones} />
// ============================================================================

import React, { useMemo } from 'react';
import { TileLayer, Polygon, Polyline, CircleMarker, Tooltip } from 'react-leaflet';

// ── Map Tile Styles ────────────────────────────────────────────────────────

const MAP_STYLES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    label: '🌑 Dark',
    maxZoom: 19
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, DigitalGlobe, GeoEye, Earthstar',
    label: '🛰️ Satellite',
    maxZoom: 18
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap',
    label: '🏔️ Terrain',
    maxZoom: 17
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    label: '☀️ Light',
    maxZoom: 19
  }
};

/**
 * MapStyleSwitcher — Renders the TileLayer based on the selected style.
 * Also provides a small toggle button overlay.
 */
export const MapStyleSwitcher = ({ style = 'dark', onStyleChange }) => {
  const tileConfig = MAP_STYLES[style] || MAP_STYLES.dark;

  return (
    <>
      <TileLayer
        key={style}
        url={tileConfig.url}
        attribution={tileConfig.attribution}
        maxZoom={tileConfig.maxZoom}
      />
      {onStyleChange && (
        <div className="map-style-switcher" role="radiogroup" aria-label="Map style">
          {Object.entries(MAP_STYLES).map(([key, cfg]) => (
            <button
              key={key}
              className={`map-style-btn ${style === key ? 'active' : ''}`}
              onClick={() => onStyleChange(key)}
              title={cfg.label}
              role="radio"
              aria-checked={style === key}
              aria-label={cfg.label}
            >
              {cfg.label.split(' ')[0]}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

// ── Disaster Area Polygons ─────────────────────────────────────────────────

/**
 * Generate a rough circle polygon for disaster-affected areas.
 * Used when we have a center point + affected area (in km²).
 */
function generateImpactCircle(lat, lon, areaKm2, points = 24) {
  if (!areaKm2 || areaKm2 <= 0) return null;
  
  const radiusKm = Math.sqrt(areaKm2 / Math.PI);
  const radiusDeg = radiusKm / 111; // rough conversion
  
  const polygon = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const pLat = lat + radiusDeg * Math.sin(angle);
    const pLon = lon + (radiusDeg * Math.cos(angle)) / Math.cos(lat * Math.PI / 180);
    polygon.push([pLat, pLon]);
  }
  polygon.push(polygon[0]); // Close the polygon
  return polygon;
}

function getItemCoords(item) {
  if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
    return { lat: item.coordinates[1], lon: item.coordinates[0] };
  }
  if (item.latitude !== undefined && item.longitude !== undefined) {
    return { lat: item.latitude, lon: item.longitude };
  }
  return null;
}

/**
 * DisasterPolygons — Renders affected-area polygons for floods, wildfires, and droughts.
 */
export const DisasterPolygons = ({ data, enabledLayers }) => {
  const polygons = useMemo(() => {
    const results = [];

    // Flood affected areas
    if (enabledLayers?.floods && data.floods?.length) {
      data.floods.forEach((item, i) => {
        const coords = getItemCoords(item);
        if (!coords) return;
        const area = item.affectedArea || item.area;
        if (!area || area < 10) return; // Skip tiny areas
        
        const poly = generateImpactCircle(coords.lat, coords.lon, area);
        if (poly) {
          results.push({
            key: `flood_poly_${item.id || i}`,
            positions: poly,
            color: '#4488ff',
            fillColor: '#4488ff',
            opacity: item.isActive !== false ? 0.3 : 0.1,
            weight: 1,
            name: item.name || 'Flood zone',
            type: 'flood',
            area
          });
        }
      });
    }

    // Wildfire affected areas
    if (enabledLayers?.wildfires && data.wildfires?.length) {
      data.wildfires.forEach((item, i) => {
        const coords = getItemCoords(item);
        if (!coords) return;
        const area = item.affectedArea || item.area;
        if (!area || area < 5) return;
        
        const poly = generateImpactCircle(coords.lat, coords.lon, area);
        if (poly) {
          results.push({
            key: `fire_poly_${item.id || i}`,
            positions: poly,
            color: item.isActive !== false ? '#ff6600' : '#884400',
            fillColor: item.isActive !== false ? '#ff4400' : '#663300',
            opacity: item.isActive !== false ? 0.25 : 0.08,
            weight: item.isActive !== false ? 2 : 1,
            name: item.name || 'Wildfire zone',
            type: 'wildfire',
            area
          });
        }
      });
    }

    // Drought affected areas (these tend to be very large)
    if (enabledLayers?.droughts && data.droughts?.length) {
      data.droughts.forEach((item, i) => {
        const coords = getItemCoords(item);
        if (!coords) return;
        const area = item.affectedArea || item.area || 5000; // Droughts default large
        
        const poly = generateImpactCircle(coords.lat, coords.lon, area, 20);
        if (poly) {
          results.push({
            key: `drought_poly_${item.id || i}`,
            positions: poly,
            color: '#cc9900',
            fillColor: '#996600',
            opacity: 0.15,
            weight: 1,
            name: item.name || 'Drought zone',
            type: 'drought',
            area
          });
        }
      });
    }

    return results;
  }, [data, enabledLayers]);

  return (
    <>
      {polygons.map(p => (
        <Polygon
          key={p.key}
          positions={p.positions}
          pathOptions={{
            color: p.color,
            fillColor: p.fillColor,
            fillOpacity: p.opacity,
            weight: p.weight,
            dashArray: p.type === 'drought' ? '5 5' : undefined
          }}
        >
          <Tooltip direction="center" opacity={0.8}>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
              {p.name}<br />
              <span style={{ color: '#888' }}>~{Math.round(p.area).toLocaleString()} km²</span>
            </span>
          </Tooltip>
        </Polygon>
      ))}
    </>
  );
};

// ── Cyclone Track Lines ────────────────────────────────────────────────────

/**
 * CycloneTrackLine — Renders historical track + forecast cone for cyclones.
 * Uses track data if available, or just shows a circle otherwise.
 */
export const CycloneTrackLine = ({ cyclones, enabled }) => {
  if (!enabled || !cyclones?.length) return null;

  return (
    <>
      {cyclones.map((cyclone, i) => {
        const coords = getItemCoords(cyclone);
        if (!coords) return null;

        // If track data is available, draw it
        if (cyclone.track && Array.isArray(cyclone.track) && cyclone.track.length > 1) {
          const trackPositions = cyclone.track.map(p => [p.lat, p.lon]);
          
          return (
            <React.Fragment key={`cyclone_track_${cyclone.id || i}`}>
              {/* Track line */}
              <Polyline
                positions={trackPositions}
                pathOptions={{
                  color: '#00ccff',
                  weight: 3,
                  opacity: 0.6,
                  dashArray: '8 4'
                }}
              />
              {/* Track points */}
              {cyclone.track.map((point, j) => (
                <CircleMarker
                  key={`tp_${i}_${j}`}
                  center={[point.lat, point.lon]}
                  radius={3}
                  fillColor="#00ccff"
                  color="#00ccff"
                  weight={1}
                  fillOpacity={0.8}
                />
              ))}
            </React.Fragment>
          );
        }

        // No track data — show wind radius as a circle
        const windKm = cyclone.windSpeed ? cyclone.windSpeed * 1.5 : 200;
        const windCircle = generateImpactCircle(coords.lat, coords.lon, Math.PI * (windKm / 111) ** 2 * 111 * 111, 32);
        
        if (!windCircle) return null;

        return (
          <Polygon
            key={`cyclone_wind_${cyclone.id || i}`}
            positions={windCircle}
            pathOptions={{
              color: '#00ccff',
              fillColor: '#00ccff',
              fillOpacity: cyclone.isActive ? 0.12 : 0.05,
              weight: cyclone.isActive ? 2 : 1,
              dashArray: '6 4'
            }}
          >
            <Tooltip direction="center" opacity={0.8}>
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {cyclone.stormType}: {cyclone.name}<br />
                <span style={{ color: '#00ccff' }}>
                  Wind: {cyclone.windSpeed || '?'} km/h
                </span>
              </span>
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
};

export { MAP_STYLES };