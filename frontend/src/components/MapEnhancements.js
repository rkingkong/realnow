// ============================================================================
// MapEnhancements.js — v5.0.1 FIXED
// Drop into: /var/www/realnow/frontend/src/components/MapEnhancements.js
// ============================================================================
//
// FIXES:
//   1. MapStyleSwitcher now accepts BOTH 'style' and 'mapStyle' props
//      (App.js passes 'mapStyle' but old component only read 'style')
//   2. CycloneTrackLine now handles BOTH single cyclone and array of cyclones
//      (App.js maps over cyclones and passes single 'cyclone' prop)
//   3. Added 'mapStyle' as primary prop name for consistency with App.js
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
 * 
 * FIX: Now accepts BOTH 'mapStyle' (from App.js) and 'style' (legacy) props.
 * App.js passes: <MapStyleSwitcher mapStyle={mapStyle} onStyleChange={setMapStyle} />
 * Old component only read 'style', so mapStyle was ignored and always defaulted to 'dark'.
 */
export const MapStyleSwitcher = ({ mapStyle, style, onStyleChange }) => {
  // FIX: Accept mapStyle (primary, from App.js) OR style (legacy fallback)
  const activeStyle = mapStyle || style || 'dark';
  const tileConfig = MAP_STYLES[activeStyle] || MAP_STYLES.dark;

  return (
    <>
      <TileLayer
        key={activeStyle}
        url={tileConfig.url}
        attribution={tileConfig.attribution}
        maxZoom={tileConfig.maxZoom}
      />
      {onStyleChange && (
        <div className="map-style-switcher" role="radiogroup" aria-label="Map style">
          {Object.entries(MAP_STYLES).map(([key, cfg]) => (
            <button
              key={key}
              className={`map-style-btn ${activeStyle === key ? 'active' : ''}`}
              onClick={() => onStyleChange(key)}
              title={cfg.label}
              role="radio"
              aria-checked={activeStyle === key}
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

function generateImpactCircle(lat, lon, areaKm2, points = 24) {
  if (!areaKm2 || areaKm2 <= 0) return null;
  
  const radiusKm = Math.sqrt(areaKm2 / Math.PI);
  const radiusDeg = radiusKm / 111;
  
  const polygon = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const pLat = lat + radiusDeg * Math.sin(angle);
    const pLon = lon + (radiusDeg * Math.cos(angle)) / Math.cos(lat * Math.PI / 180);
    polygon.push([pLat, pLon]);
  }
  polygon.push(polygon[0]);
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
        if (!area || area < 10) return;
        
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

    // Drought affected areas
    if (enabledLayers?.droughts && data.droughts?.length) {
      data.droughts.forEach((item, i) => {
        const coords = getItemCoords(item);
        if (!coords) return;
        const area = item.affectedArea || item.area || 5000;
        
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
 *
 * FIX: Now handles THREE calling conventions:
 *   1. <CycloneTrackLine cyclone={singleCyclone} />         (App.js v5 usage in .map())
 *   2. <CycloneTrackLine cyclones={array} enabled={bool} /> (original component API)
 *   3. Both props at once (graceful handling)
 */
export const CycloneTrackLine = ({ cyclone, cyclones, enabled = true }) => {
  // FIX: Build a unified list from either prop
  const cycloneList = useMemo(() => {
    if (cyclone) return [cyclone]; // Single cyclone from App.js .map()
    if (cyclones && Array.isArray(cyclones)) return cyclones;
    return [];
  }, [cyclone, cyclones]);

  if (!enabled || !cycloneList.length) return null;

  return (
    <>
      {cycloneList.map((c, i) => {
        const coords = getItemCoords(c);
        if (!coords) return null;

        // If track data is available, draw it
        if (c.track && Array.isArray(c.track) && c.track.length > 1) {
          const trackPositions = c.track.map(p => [p.lat, p.lon]);
          
          return (
            <React.Fragment key={`cyclone_track_${c.id || i}`}>
              <Polyline
                positions={trackPositions}
                pathOptions={{
                  color: '#00ccff',
                  weight: 3,
                  opacity: 0.6,
                  dashArray: '8 4'
                }}
              />
              {c.track.map((point, j) => (
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
        const windKm = c.windSpeed ? c.windSpeed * 1.5 : 200;
        const windCircle = generateImpactCircle(coords.lat, coords.lon, Math.PI * (windKm / 111) ** 2 * 111 * 111, 32);
        
        if (!windCircle) return null;

        return (
          <Polygon
            key={`cyclone_wind_${c.id || i}`}
            positions={windCircle}
            pathOptions={{
              color: '#00ccff',
              fillColor: '#00ccff',
              fillOpacity: c.isActive ? 0.12 : 0.05,
              weight: c.isActive ? 2 : 1,
              dashArray: '6 4'
            }}
          >
            <Tooltip direction="center" opacity={0.8}>
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {c.stormType}: {c.name}<br />
                <span style={{ color: '#00ccff' }}>
                  Wind: {c.windSpeed || '?'} km/h
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