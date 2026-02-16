// ============================================================================
// digest.js — Email/SMS Digest Service
// Drop into: /var/www/realnow/backend/enhancements/digest.js
// ============================================================================
//
// Sends daily/weekly email digests to users with watch areas configured.
// Uses Nodemailer with configurable SMTP (works with SendGrid, Mailgun,
// Gmail, etc.). Falls back to a console log if no SMTP is configured.
//
// ENV vars needed:
//   SMTP_HOST=smtp.sendgrid.net
//   SMTP_PORT=587
//   SMTP_USER=apikey
//   SMTP_PASS=SG.xxxxx
//   SMTP_FROM=alerts@realnow.app
//
// Usage in server.js:
//   const { DigestService } = require('./enhancements/digest');
//   const digest = new DigestService(redis, aggregator);
//   digest.startSchedule();   // Starts daily 8am UTC cron
// ============================================================================

const cron = require('node-cron');

// Distance helper (same as geo-dedup)
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

function getEventCoords(item) {
  if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
    return { lat: item.coordinates[1], lon: item.coordinates[0] };
  }
  if (item.latitude !== undefined && item.longitude !== undefined) {
    return { lat: item.latitude, lon: item.longitude };
  }
  return null;
}

const DISASTER_LABELS = {
  earthquakes: '🌍 Earthquake',
  wildfires: '🔥 Wildfire',
  fires: '🔥 Fire Hotspot',
  floods: '🌊 Flood',
  cyclones: '🌀 Cyclone',
  volcanoes: '🌋 Volcano',
  droughts: '🏜️ Drought',
  spaceweather: '☀️ Space Weather',
  landslides: '⛰️ Landslide',
  tsunamis: '🌊 Tsunami'
};

class DigestService {
  constructor(redis) {
    this.redis = redis;
    this.transporter = null;
    this._initMailer();
  }

  async _initMailer() {
    const host = process.env.SMTP_HOST;
    if (!host) {
      console.log('📧 [Digest] No SMTP_HOST configured — digest emails will be logged to console only');
      return;
    }

    try {
      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      console.log('📧 [Digest] SMTP mailer configured');
    } catch (e) {
      console.log('📧 [Digest] nodemailer not installed — run: npm install nodemailer');
    }
  }

  /**
   * Find all events within a watch area from the last N hours.
   */
  async findEventsInWatchArea(watchArea, hoursBack = 24) {
    const types = [
      'earthquakes', 'wildfires', 'floods', 'cyclones',
      'volcanoes', 'droughts', 'landslides', 'tsunamis'
    ];
    
    const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
    const nearbyEvents = [];

    for (const type of types) {
      try {
        const cached = await this.redis.get(`data:${type}`);
        if (!cached) continue;
        
        const data = JSON.parse(cached);
        if (!data.features) continue;

        for (const item of data.features) {
          const coords = getEventCoords(item);
          if (!coords) continue;

          // Check timestamp
          const ts = new Date(item.date || item.time || item.fromDate || item.timestamp || 0).getTime();
          if (ts < cutoff && ts > 0) continue;

          // Check distance
          const dist = haversineKm(
            watchArea.lat, watchArea.lon,
            coords.lat, coords.lon
          );

          if (dist <= (watchArea.radiusKm || 500)) {
            nearbyEvents.push({
              type,
              label: DISASTER_LABELS[type] || type,
              name: item.name || item.place || item.event || 'Unknown',
              distance: Math.round(dist),
              severity: item.alertLevel || item.severity || '',
              magnitude: item.magnitude,
              windSpeed: item.windSpeed,
              isActive: item.isActive !== false,
              coordinates: coords,
              date: item.date || item.time || item.fromDate || ''
            });
          }
        }
      } catch (e) {
        // Skip this type on error
      }
    }

    // Sort by distance
    nearbyEvents.sort((a, b) => a.distance - b.distance);
    return nearbyEvents;
  }

  /**
   * Generate HTML email body for a digest.
   */
  generateDigestHTML(watchArea, events, hoursBack) {
    const eventRows = events.map(ev => {
      const severity = ev.severity ? `<span style="color: ${ev.severity === 'Red' ? '#ff4444' : ev.severity === 'Orange' ? '#ff8800' : '#88cc00'}; font-weight: bold;">[${ev.severity}]</span>` : '';
      const mag = ev.magnitude ? ` M${ev.magnitude.toFixed(1)}` : '';
      const wind = ev.windSpeed ? ` ${ev.windSpeed}km/h` : '';
      const active = ev.isActive ? '🔴' : '⚪';
      
      return `
        <tr style="border-bottom: 1px solid #333;">
          <td style="padding: 8px; font-size: 14px;">${active} ${ev.label}${mag}${wind}</td>
          <td style="padding: 8px; font-size: 14px;">${ev.name}</td>
          <td style="padding: 8px; font-size: 14px;">${ev.distance} km</td>
          <td style="padding: 8px; font-size: 14px;">${severity}</td>
        </tr>`;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="background: #0a0a12; color: #ccc; font-family: -apple-system, sans-serif; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h1 style="color: #00ff88; font-size: 24px; margin-bottom: 4px;">🌍 RealNow Digest</h1>
          <p style="color: #888; font-size: 13px; margin-top: 0;">
            ${events.length} event${events.length !== 1 ? 's' : ''} near 
            <strong>${watchArea.label || 'your watch area'}</strong> 
            in the last ${hoursBack} hours
          </p>
          
          ${events.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <thead>
                <tr style="border-bottom: 2px solid #333; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <th style="padding: 8px; text-align: left;">Type</th>
                  <th style="padding: 8px; text-align: left;">Event</th>
                  <th style="padding: 8px; text-align: left;">Dist</th>
                  <th style="padding: 8px; text-align: left;">Severity</th>
                </tr>
              </thead>
              <tbody>${eventRows}</tbody>
            </table>
          ` : `
            <p style="color: #66cc88; font-size: 16px; text-align: center; padding: 30px 0;">
              ✅ All clear — no significant events in your watch area.
            </p>
          `}
          
          <p style="color: #666; font-size: 11px; margin-top: 30px; text-align: center;">
            <a href="${process.env.APP_URL || 'https://realnow.app'}" style="color: #4488ff;">Open RealNow</a>
            &nbsp;·&nbsp;
            Reply STOP to unsubscribe
          </p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send a digest email to one user.
   */
  async sendDigest(email, watchArea, events, hoursBack = 24) {
    const html = this.generateDigestHTML(watchArea, events, hoursBack);
    const subject = events.length > 0
      ? `🚨 RealNow: ${events.length} event${events.length !== 1 ? 's' : ''} near ${watchArea.label || 'your watch area'}`
      : `✅ RealNow: All clear near ${watchArea.label || 'your watch area'}`;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: process.env.SMTP_FROM || 'alerts@realnow.app',
          to: email,
          subject,
          html
        });
        console.log(`📧 [Digest] Sent to ${email}: ${events.length} events`);
      } catch (error) {
        console.error(`❌ [Digest] Failed to send to ${email}:`, error.message);
      }
    } else {
      // Console fallback
      console.log(`📧 [Digest] (console) To: ${email}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Events: ${events.length}`);
      events.slice(0, 5).forEach(ev => {
        console.log(`   - ${ev.label}: ${ev.name} (${ev.distance}km)`);
      });
    }
  }

  /**
   * Run the digest for all users with watch areas.
   */
  async runDigest(frequency = 'daily') {
    console.log(`\n📧 [Digest] Running ${frequency} digest...`);
    
    const hoursBack = frequency === 'weekly' ? 168 : 24;
    
    try {
      // Scan for all user prefs with watch areas
      let cursor = '0';
      let sent = 0;
      
      do {
        const result = await this.redis.scan(cursor, { MATCH: 'prefs:*', COUNT: 100 });
        cursor = result.cursor.toString();
        
        for (const key of result.keys) {
          const data = await this.redis.get(key);
          if (!data) continue;
          
          const prefs = JSON.parse(data);
          if (!prefs.watchArea || !prefs.digestEmail) continue;
          if (prefs.digestFrequency !== frequency && frequency !== 'test') continue;
          
          const events = await this.findEventsInWatchArea(prefs.watchArea, hoursBack);
          await this.sendDigest(prefs.digestEmail, prefs.watchArea, events, hoursBack);
          sent++;
        }
      } while (cursor !== '0');
      
      console.log(`📧 [Digest] Completed: ${sent} digests sent`);
      
    } catch (error) {
      console.error('❌ [Digest] Run error:', error.message);
    }
  }

  /**
   * Start the cron schedule.
   */
  startSchedule() {
    // Daily digest at 8:00 AM UTC
    cron.schedule('0 8 * * *', () => {
      this.runDigest('daily');
    });
    console.log('📧 [Digest] Scheduled: daily at 08:00 UTC');

    // Weekly digest every Monday at 8:00 AM UTC
    cron.schedule('0 8 * * 1', () => {
      this.runDigest('weekly');
    });
    console.log('📧 [Digest] Scheduled: weekly on Mondays at 08:00 UTC');
  }
}

module.exports = { DigestService };