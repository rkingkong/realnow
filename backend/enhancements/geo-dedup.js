// ============================================================================
// geo-dedup.js — Geographic Proximity Deduplication
// Drop into: /var/www/realnow/backend/enhancements/geo-dedup.js
// ============================================================================
//
// Merges events of the same type that are within a configurable radius
// and time window. Uses the Haversine formula for distance calculation.
// ============================================================================

/**
 * Haversine distance between two lat/lon points in kilometers.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract lat/lon from a disaster event item (handles multiple formats).
 */
function getCoords(item) {
  if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
    return { lat: item.coordinates[1], lon: item.coordinates[0] };
  }
  if (item.latitude !== undefined && item.longitude !== undefined) {
    return { lat: item.latitude, lon: item.longitude };
  }
  return null;
}

/**
 * Extract a timestamp from a disaster event.
 */
function getTimestamp(item) {
  const raw = item.date || item.fromDate || item.time || item.timestamp || item.created;
  return raw ? new Date(raw).getTime() : Date.now();
}

/**
 * Deduplication configuration per disaster type.
 */
const DEDUP_CONFIG = {
  floods: {
    radiusKm: 80,           // Floods can cover large areas
    timeWindowDays: 14,
    mergeStrategy: 'keep_highest_alert',
    nameWeight: 0.5          // Also check name similarity
  },
  wildfires: {
    radiusKm: 50,
    timeWindowDays: 7,
    mergeStrategy: 'keep_highest_alert',
    nameWeight: 0.3
  },
  earthquakes: {
    radiusKm: 30,
    timeWindowDays: 1,       // Earthquakes are point-in-time
    mergeStrategy: 'keep_strongest',
    nameWeight: 0
  },
  cyclones: {
    radiusKm: 200,           // Cyclones are very large
    timeWindowDays: 3,
    mergeStrategy: 'keep_latest',
    nameWeight: 0.8          // Storm names are reliable
  },
  volcanoes: {
    radiusKm: 15,
    timeWindowDays: 30,
    mergeStrategy: 'keep_highest_alert',
    nameWeight: 0.7
  },
  droughts: {
    radiusKm: 150,
    timeWindowDays: 30,
    mergeStrategy: 'keep_highest_alert',
    nameWeight: 0.4
  },
  landslides: {
    radiusKm: 10,
    timeWindowDays: 3,
    mergeStrategy: 'keep_latest',
    nameWeight: 0.2
  },
  tsunamis: {
    radiusKm: 100,
    timeWindowDays: 2,
    mergeStrategy: 'keep_latest',
    nameWeight: 0.5
  }
};

/**
 * Simple name similarity (Jaccard on word tokens).
 */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/**
 * Alert level to numeric score for comparison.
 */
function alertScore(item) {
  const level = (item.alertLevel || '').toLowerCase();
  if (level === 'red') return 3;
  if (level === 'orange') return 2;
  if (level === 'green') return 1;
  return 0;
}

/**
 * Merge strategy: pick which item to keep from a duplicate cluster.
 */
function pickWinner(items, strategy) {
  if (items.length === 1) return items[0];

  switch (strategy) {
    case 'keep_highest_alert':
      return items.reduce((best, item) => {
        const bs = alertScore(best);
        const is = alertScore(item);
        if (is > bs) return item;
        if (is === bs) {
          // Tie-break: prefer active, then newer
          if (item.isActive && !best.isActive) return item;
          if (getTimestamp(item) > getTimestamp(best)) return item;
        }
        return best;
      });

    case 'keep_strongest':
      return items.reduce((best, item) => {
        const bMag = best.magnitude || best.frp || 0;
        const iMag = item.magnitude || item.frp || 0;
        return iMag > bMag ? item : best;
      });

    case 'keep_latest':
      return items.reduce((best, item) =>
        getTimestamp(item) > getTimestamp(best) ? item : best
      );

    default:
      return items[0];
  }
}

/**
 * Main deduplication function.
 * 
 * @param {Array} features — Array of disaster event objects
 * @param {string} type — Disaster type key (e.g., 'floods', 'wildfires')
 * @returns {{ features: Array, removedCount: number, clusters: number }}
 */
function deduplicateEvents(features, type) {
  if (!features || features.length === 0) {
    return { features: [], removedCount: 0, clusters: 0 };
  }

  const config = DEDUP_CONFIG[type];
  if (!config) {
    // No dedup config for this type — return as-is
    return { features, removedCount: 0, clusters: 0 };
  }

  const timeWindowMs = config.timeWindowDays * 24 * 60 * 60 * 1000;
  const used = new Set();
  const clusters = [];

  for (let i = 0; i < features.length; i++) {
    if (used.has(i)) continue;

    const cluster = [features[i]];
    used.add(i);
    const coordsA = getCoords(features[i]);
    const tsA = getTimestamp(features[i]);
    const nameA = features[i].name || features[i].place || '';

    if (!coordsA) continue;

    for (let j = i + 1; j < features.length; j++) {
      if (used.has(j)) continue;

      const coordsB = getCoords(features[j]);
      if (!coordsB) continue;

      const tsB = getTimestamp(features[j]);
      const nameB = features[j].name || features[j].place || '';

      // Time check
      if (Math.abs(tsA - tsB) > timeWindowMs) continue;

      // Distance check
      const dist = haversineKm(coordsA.lat, coordsA.lon, coordsB.lat, coordsB.lon);
      if (dist > config.radiusKm) {
        // Maybe still a dupe by name?
        if (config.nameWeight > 0 && nameSimilarity(nameA, nameB) >= 0.6) {
          // Name match overrides distance for floods/cyclones
          cluster.push(features[j]);
          used.add(j);
          continue;
        }
        continue;
      }

      // Close enough geographically — check name bonus
      const nameScore = config.nameWeight > 0 ? nameSimilarity(nameA, nameB) : 0;
      const geoScore = 1 - (dist / config.radiusKm);
      const combinedScore = geoScore * (1 - config.nameWeight) + nameScore * config.nameWeight;

      if (combinedScore >= 0.3) {
        cluster.push(features[j]);
        used.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Pick winners from each cluster
  const dedupedFeatures = clusters.map(cluster =>
    pickWinner(cluster, config.mergeStrategy)
  );

  const removedCount = features.length - dedupedFeatures.length;
  if (removedCount > 0) {
    console.log(`🔄 [GeoDedup] ${type}: ${features.length} → ${dedupedFeatures.length} (removed ${removedCount} duplicates across ${clusters.filter(c => c.length > 1).length} clusters)`);
  }

  return {
    features: dedupedFeatures,
    removedCount,
    clusters: clusters.filter(c => c.length > 1).length
  };
}

module.exports = { deduplicateEvents, haversineKm, getCoords, DEDUP_CONFIG };