// ============================================================================
// index.js — Backend Enhancements Integration Module
// Drop into: /var/www/realnow/backend/enhancements/index.js
// ============================================================================
//
// This module exports everything you need to wire the v5 enhancements
// into your existing server.js with just a few lines.
//
// Add to the TOP of server.js (after your existing requires):
//
//   const cookieParser = require('cookie-parser');
//   const enhancements = require('./enhancements');
//   app.use(cookieParser());
//
// Add BEFORE your existing routes:
//
//   enhancements.applyMiddleware(app, redis);
//
// Add AFTER aggregator is created:
//
//   enhancements.enhanceAggregator(aggregator, redis);
//
// Add AFTER server.listen():
//
//   enhancements.startServices(redis);
//
// NPM dependencies to add:
//   npm install cookie-parser uuid
//   npm install nodemailer    (optional, for email digests)
//
// ============================================================================

const CircuitBreaker = require('./circuit-breaker');
const { limiters } = require('./rate-limiter');
const { deduplicateEvents } = require('./geo-dedup');
const { preferencesRouter } = require('./preferences');
const { DigestService } = require('./digest');

// Singleton circuit breaker
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutBase: 30000,
  maxResetTimeout: 600000
});

// Redis TTL for cached data (2 hours)
const DATA_TTL = 2 * 60 * 60;

/**
 * Apply all middleware to the Express app.
 */
function applyMiddleware(app, redis) {
  // Rate limiting on routes
  app.use('/api/data', limiters.dataRead);
  app.use('/api/aggregate', limiters.dataRead);
  app.use('/api/stats', limiters.health);
  app.use('/api/refresh', limiters.refresh);
  app.use('/health', limiters.health);
  
  // User preferences routes
  app.use(preferencesRouter(redis));
  
  // Circuit breaker status endpoint
  app.get('/api/circuit-status', limiters.health, (req, res) => {
    res.json({
      circuitBreaker: circuitBreaker.getStatus(),
      timestamp: new Date().toISOString()
    });
  });

  // Digest test endpoint (admin use)
  app.post('/api/digest/test', limiters.refresh, async (req, res) => {
    try {
      const digest = new DigestService(redis);
      await digest.runDigest('test');
      res.json({ success: true, message: 'Test digest sent to all configured users' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('🔌 [Enhancements] Middleware applied: rate limiting, preferences, circuit status');
}

/**
 * Enhance the DisasterDataAggregator with circuit breaker and dedup.
 * Monkey-patches fetchData and storeInRedis to add the new behaviors.
 */
function enhanceAggregator(aggregator, redis) {
  // --- Patch: fetchData with circuit breaker ---
  const originalFetchData = aggregator.fetchData.bind(aggregator);
  
  aggregator.fetchData = async function(source) {
    const check = circuitBreaker.canRequest(source);
    
    if (!check.allowed) {
      console.log(`⚡ [CircuitBreaker] ${source}: Skipped (${check.reason})`);
      // Return cached data instead
      try {
        const cached = await redis.get(`data:${source}`);
        return cached ? JSON.parse(cached) : null;
      } catch (e) {
        return null;
      }
    }

    try {
      const result = await originalFetchData(source);
      circuitBreaker.onSuccess(source);
      return result;
    } catch (error) {
      circuitBreaker.onFailure(source);
      throw error;
    }
  };

  // --- Patch: storeInRedis with TTL + dedup ---
  const originalStoreInRedis = aggregator.storeInRedis.bind(aggregator);
  
  aggregator.storeInRedis = async function(type, data) {
    // Apply geo-deduplication before storing
    if (data && data.features && data.features.length > 0) {
      const { features, removedCount } = deduplicateEvents(data.features, type);
      data.features = features;
      data.count = features.length;
      if (removedCount > 0) {
        data.deduplicated = removedCount;
      }
    }
    
    // Store with TTL (2 hours safety net)
    const key = `data:${type}`;
    await redis.setEx(key, DATA_TTL, JSON.stringify(data));
    
    // Also emit to connected WebSocket clients
    if (aggregator.io) {
      aggregator.io.emit(`update:${type}`, data);
    }
    
    return data;
  };

  // --- Patch: mergeFloodData with dedup ---
  if (aggregator.mergeFloodData) {
    const originalMerge = aggregator.mergeFloodData.bind(aggregator);
    
    aggregator.mergeFloodData = async function() {
      const result = await originalMerge();
      
      if (result && result.features && result.features.length > 0) {
        const { features, removedCount } = deduplicateEvents(result.features, 'floods');
        result.features = features;
        result.count = features.length;
        if (removedCount > 0) {
          result.deduplicated = (result.deduplicated || 0) + removedCount;
          // Re-store the deduplicated data
          await redis.setEx('data:floods', DATA_TTL, JSON.stringify(result));
        }
      }
      
      return result;
    };
  }

  // Store the io reference on the aggregator for the patched storeInRedis
  if (!aggregator.io) {
    aggregator.io = null; // Will be set when io is available
  }

  console.log('🔌 [Enhancements] Aggregator enhanced: circuit breaker, geo-dedup, Redis TTL');
}

/**
 * Start background services (digest scheduler).
 */
function startServices(redis) {
  const digest = new DigestService(redis);
  digest.startSchedule();
  console.log('🔌 [Enhancements] Background services started');
}

module.exports = {
  applyMiddleware,
  enhanceAggregator,
  startServices,
  circuitBreaker,
  CircuitBreaker,
  deduplicateEvents,
  DigestService
};