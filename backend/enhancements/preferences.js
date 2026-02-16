// ============================================================================
// preferences.js — Anonymous User Preferences API
// Drop into: /var/www/realnow/backend/enhancements/preferences.js
// ============================================================================
//
// Provides /api/preferences endpoints backed by Redis.
// Users get a UUID cookie (no login required). Preferences persist
// across devices if the cookie is shared, and across sessions on
// the same browser.
//
// Usage in server.js:
//   const { preferencesRouter } = require('./enhancements/preferences');
//   app.use(preferencesRouter(redis));
// ============================================================================

const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const express = require('express');

const PREFS_PREFIX = 'prefs:';
const PREFS_TTL = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * Default preferences for new users.
 */
const DEFAULT_PREFS = {
  enabledLayers: {
    earthquakes: true,
    volcanoes: true,
    cyclones: true,
    floods: true,
    wildfires: true,
    fires: false,
    weather: false,
    droughts: true,
    spaceweather: false,
    landslides: true,
    tsunamis: true
  },
  watchArea: null,           // { lat, lon, radiusKm, label }
  alertsEnabled: false,
  alertThresholds: {
    earthquakeMinMag: 6.0,
    cycloneMinWind: 119,
    floodAlertLevel: 'Orange',
    wildfireAlertLevel: 'Orange'
  },
  mapStyle: 'dark',          // 'dark' | 'satellite' | 'terrain'
  language: 'en',
  soundEnabled: true,
  digestEmail: null,          // email address for daily digest
  digestFrequency: 'daily',  // 'daily' | 'weekly' | 'off'
  createdAt: null,
  updatedAt: null
};

/**
 * Extract or create user ID from cookie.
 */
function getUserId(req, res) {
  let userId = req.cookies?.realnow_uid;
  
  if (!userId) {
    // Check header fallback (for API clients without cookie support)
    userId = req.headers['x-realnow-uid'];
  }
  
  if (!userId) {
    userId = uuidv4();
    res.cookie('realnow_uid', userId, {
      maxAge: PREFS_TTL * 1000,
      httpOnly: false,       // Frontend needs to read it
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production'
    });
  }
  
  return userId;
}

/**
 * Create the preferences Express router.
 * @param {RedisClient} redis — Connected Redis client
 */
function preferencesRouter(redis) {
  const router = express.Router();

  // GET /api/preferences — Retrieve user preferences
  router.get('/api/preferences', async (req, res) => {
    try {
      const userId = getUserId(req, res);
      const key = `${PREFS_PREFIX}${userId}`;
      
      const cached = await redis.get(key);
      
      if (cached) {
        const prefs = JSON.parse(cached);
        return res.json({ userId, preferences: prefs });
      }
      
      // New user — return defaults
      const newPrefs = { 
        ...DEFAULT_PREFS, 
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await redis.setEx(key, PREFS_TTL, JSON.stringify(newPrefs));
      return res.json({ userId, preferences: newPrefs, isNew: true });
      
    } catch (error) {
      console.error('❌ Preferences GET error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve preferences' });
    }
  });

  // PUT /api/preferences — Update user preferences (partial merge)
  router.put('/api/preferences', async (req, res) => {
    try {
      const userId = getUserId(req, res);
      const key = `${PREFS_PREFIX}${userId}`;
      const updates = req.body;
      
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Request body must be a JSON object' });
      }
      
      // Sanitize — only allow known preference keys
      const allowedKeys = Object.keys(DEFAULT_PREFS);
      const sanitized = {};
      for (const [k, v] of Object.entries(updates)) {
        if (allowedKeys.includes(k)) {
          sanitized[k] = v;
        }
      }
      
      // Load existing
      const cached = await redis.get(key);
      const existing = cached ? JSON.parse(cached) : { ...DEFAULT_PREFS };
      
      // Deep merge for nested objects
      const merged = { ...existing };
      for (const [k, v] of Object.entries(sanitized)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && existing[k] && typeof existing[k] === 'object') {
          merged[k] = { ...existing[k], ...v };
        } else {
          merged[k] = v;
        }
      }
      merged.updatedAt = new Date().toISOString();
      
      await redis.setEx(key, PREFS_TTL, JSON.stringify(merged));
      
      return res.json({ userId, preferences: merged, updated: true });
      
    } catch (error) {
      console.error('❌ Preferences PUT error:', error.message);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  });

  // DELETE /api/preferences — Reset to defaults
  router.delete('/api/preferences', async (req, res) => {
    try {
      const userId = getUserId(req, res);
      const key = `${PREFS_PREFIX}${userId}`;
      
      await redis.del(key);
      
      return res.json({ userId, reset: true, preferences: DEFAULT_PREFS });
      
    } catch (error) {
      console.error('❌ Preferences DELETE error:', error.message);
      res.status(500).json({ error: 'Failed to reset preferences' });
    }
  });

  // GET /api/preferences/watch-areas — Get all active watch areas (for digest)
  router.get('/api/preferences/watch-areas', async (req, res) => {
    try {
      // Scan Redis for all preference keys with watch areas
      const watchAreas = [];
      let cursor = '0';
      
      do {
        const result = await redis.scan(cursor, { MATCH: `${PREFS_PREFIX}*`, COUNT: 100 });
        cursor = result.cursor.toString();
        
        for (const key of result.keys) {
          const data = await redis.get(key);
          if (data) {
            const prefs = JSON.parse(data);
            if (prefs.watchArea && prefs.digestEmail) {
              watchAreas.push({
                userId: key.replace(PREFS_PREFIX, ''),
                watchArea: prefs.watchArea,
                email: prefs.digestEmail,
                frequency: prefs.digestFrequency,
                alertThresholds: prefs.alertThresholds
              });
            }
          }
        }
      } while (cursor !== '0');
      
      res.json({ count: watchAreas.length, watchAreas });
      
    } catch (error) {
      console.error('❌ Watch areas scan error:', error.message);
      res.status(500).json({ error: 'Failed to scan watch areas' });
    }
  });

  return router;
}

module.exports = { preferencesRouter, DEFAULT_PREFS, getUserId };