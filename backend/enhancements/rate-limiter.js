// ============================================================================
// rate-limiter.js — API Rate Limiting Middleware
// Drop into: /var/www/realnow/backend/enhancements/rate-limiter.js
// ============================================================================
//
// In-memory rate limiter (no extra dependencies). Uses a sliding window
// approach per IP. Configurable per route group.
// ============================================================================

class RateLimiter {
  constructor() {
    this.windows = new Map();
    // Clean up stale entries every 5 minutes
    this.cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create Express middleware with the given limits.
   * @param {Object} options
   * @param {number} options.windowMs   — Time window in ms (default 60000 = 1 min)
   * @param {number} options.max        — Max requests per window (default 60)
   * @param {string} options.message    — Error message when limited
   * @param {string} options.keyPrefix  — Prefix to separate different limiters
   */
  middleware(options = {}) {
    const {
      windowMs = 60000,
      max = 60,
      message = 'Too many requests, please try again later.',
      keyPrefix = 'global'
    } = options;

    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const key = `${keyPrefix}:${ip}`;
      const now = Date.now();

      if (!this.windows.has(key)) {
        this.windows.set(key, []);
      }

      const timestamps = this.windows.get(key);
      
      // Remove timestamps outside the window
      const windowStart = now - windowMs;
      while (timestamps.length > 0 && timestamps[0] < windowStart) {
        timestamps.shift();
      }

      if (timestamps.length >= max) {
        const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
        res.set('Retry-After', retryAfter);
        res.set('X-RateLimit-Limit', max);
        res.set('X-RateLimit-Remaining', 0);
        res.set('X-RateLimit-Reset', new Date(timestamps[0] + windowMs).toISOString());
        return res.status(429).json({ 
          error: message, 
          retryAfter 
        });
      }

      timestamps.push(now);
      
      res.set('X-RateLimit-Limit', max);
      res.set('X-RateLimit-Remaining', Math.max(0, max - timestamps.length));
      
      next();
    };
  }

  _cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 min
    for (const [key, timestamps] of this.windows) {
      if (timestamps.length === 0 || (now - timestamps[timestamps.length - 1]) > maxAge) {
        this.windows.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.windows.clear();
  }
}

// Pre-configured limiters
const rateLimiter = new RateLimiter();

const limiters = {
  // General data reads — generous
  dataRead: rateLimiter.middleware({
    windowMs: 60000,
    max: 120,
    keyPrefix: 'data-read',
    message: 'Too many data requests. Please wait a moment.'
  }),

  // Manual refresh — strict (protects upstream APIs)
  refresh: rateLimiter.middleware({
    windowMs: 60000,
    max: 5,
    keyPrefix: 'refresh',
    message: 'Too many refresh requests. Max 5 per minute to protect upstream data sources.'
  }),

  // Preferences — moderate
  preferences: rateLimiter.middleware({
    windowMs: 60000,
    max: 30,
    keyPrefix: 'prefs',
    message: 'Too many preference updates.'
  }),

  // Health/stats — generous
  health: rateLimiter.middleware({
    windowMs: 60000,
    max: 60,
    keyPrefix: 'health',
    message: 'Too many health check requests.'
  })
};

module.exports = { RateLimiter, rateLimiter, limiters };