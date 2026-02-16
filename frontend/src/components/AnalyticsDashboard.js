// ============================================================================
// AnalyticsDashboard.js — Full Analytics Panel
// Drop into: /var/www/realnow/frontend/src/components/AnalyticsDashboard.js
// ============================================================================
//
// Slide-out panel with:
// - Trend charts (events over time per type)
// - Geographic distribution
// - Severity breakdown
// - Most affected countries leaderboard
// - Source health monitoring
//
// Uses inline SVG charts (no external charting library needed).
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ── Mini SVG Chart Components ──────────────────────────────────────────────

const SparkBar = ({ values, colors, labels, maxH = 80, barW = 18, gap = 4 }) => {
  const max = Math.max(...values, 1);
  const w = values.length * (barW + gap) - gap;
  
  return (
    <svg width={w} height={maxH + 20} className="spark-bar">
      {values.map((v, i) => {
        const h = (v / max) * maxH;
        const x = i * (barW + gap);
        return (
          <g key={i}>
            <rect
              x={x} y={maxH - h} width={barW} height={Math.max(h, 2)}
              fill={colors?.[i] || '#4488ff'} rx={3} opacity={0.85}
            />
            <text
              x={x + barW / 2} y={maxH + 12}
              textAnchor="middle" fill="#888" fontSize="9" fontFamily="monospace"
            >
              {labels?.[i] || ''}
            </text>
            {v > 0 && (
              <text
                x={x + barW / 2} y={maxH - h - 4}
                textAnchor="middle" fill="#ccc" fontSize="10" fontFamily="monospace" fontWeight="600"
              >
                {v}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const DonutChart = ({ segments, size = 100, strokeWidth = 14 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let offset = 0;

  return (
    <svg width={size} height={size} className="donut-chart">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth}
      />
      {total > 0 && segments.filter(s => s.value > 0).map((seg, i) => {
        const pct = seg.value / total;
        const dashLen = pct * circumference;
        const currentOffset = offset;
        offset += dashLen;
        return (
          <circle
            key={i}
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={seg.color} strokeWidth={strokeWidth}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={-currentOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            opacity={0.85}
          />
        );
      })}
      <text
        x={size / 2} y={size / 2 - 6} textAnchor="middle"
        fill="#fff" fontSize="18" fontWeight="700" fontFamily="monospace"
      >
        {total}
      </text>
      <text
        x={size / 2} y={size / 2 + 10} textAnchor="middle"
        fill="#888" fontSize="9" fontFamily="monospace" textTransform="uppercase"
      >
        EVENTS
      </text>
    </svg>
  );
};

// ── Country Extraction ─────────────────────────────────────────────────────

function extractCountry(item) {
  if (item.country) return item.country;
  if (item.affectedCountries && item.affectedCountries.length > 0) {
    return item.affectedCountries[0];
  }
  const place = item.place || item.name || '';
  const parts = place.split(',');
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return place || 'Unknown';
}

// ── Severity Distribution ──────────────────────────────────────────────────

function getSeverityBucket(item, type) {
  if (type === 'earthquakes') {
    const m = item.magnitude || 0;
    if (m >= 6) return 'Critical';
    if (m >= 5) return 'Severe';
    if (m >= 4) return 'Moderate';
    return 'Minor';
  }
  const level = (item.alertLevel || '').toLowerCase();
  if (level === 'red') return 'Critical';
  if (level === 'orange') return 'Severe';
  if (item.isActive === false) return 'Inactive';
  return 'Moderate';
}

// ── Main Component ─────────────────────────────────────────────────────────

const DISASTER_META = {
  earthquakes:  { icon: '🌍', color: '#ff4444', label: 'Earthquakes' },
  wildfires:    { icon: '🔥', color: '#ff6600', label: 'Wildfires' },
  floods:       { icon: '🌊', color: '#4488ff', label: 'Floods' },
  cyclones:     { icon: '🌀', color: '#00ccff', label: 'Cyclones' },
  volcanoes:    { icon: '🌋', color: '#ff3333', label: 'Volcanoes' },
  droughts:     { icon: '🏜️', color: '#cc9900', label: 'Droughts' },
  landslides:   { icon: '⛰️', color: '#8B4513', label: 'Landslides' },
  tsunamis:     { icon: '🌊', color: '#0066cc', label: 'Tsunamis' },
  spaceweather: { icon: '☀️', color: '#ff00ff', label: 'Space Weather' },
  fires:        { icon: '🔥', color: '#ff8800', label: 'Hotspots' },
  weather:      { icon: '⚠️', color: '#ffaa00', label: 'Weather' },
};

const AnalyticsDashboard = ({ data, isOpen, onClose, connected }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [serverStats, setServerStats] = useState(null);

  // Fetch server stats
  useEffect(() => {
    if (!isOpen) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 
      (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
    
    fetch(`${backendUrl}/api/stats`)
      .then(r => r.json())
      .then(setServerStats)
      .catch(() => {});
  }, [isOpen]);

  // ── Computed Analytics ──────────────────────────────────────────────────

  const analytics = useMemo(() => {
    if (!data) return null;

    // Type counts
    const typeCounts = {};
    const typeColors = [];
    const typeLabels = [];
    const mainTypes = ['earthquakes', 'wildfires', 'floods', 'cyclones', 'volcanoes', 'droughts', 'landslides', 'tsunamis'];
    
    mainTypes.forEach(type => {
      const count = data[type]?.length || 0;
      typeCounts[type] = count;
      typeColors.push(DISASTER_META[type]?.color || '#888');
      typeLabels.push(DISASTER_META[type]?.label?.slice(0, 5) || type.slice(0, 5));
    });

    // Country leaderboard
    const countryCounts = {};
    Object.entries(data).forEach(([type, items]) => {
      if (!items?.length) return;
      items.forEach(item => {
        const country = extractCountry(item);
        if (country && country !== 'Unknown' && country.length < 40) {
          if (!countryCounts[country]) countryCounts[country] = { total: 0, types: {} };
          countryCounts[country].total++;
          countryCounts[country].types[type] = (countryCounts[country].types[type] || 0) + 1;
        }
      });
    });
    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 12);

    // Severity distribution
    const severityCounts = { Critical: 0, Severe: 0, Moderate: 0, Minor: 0, Inactive: 0 };
    Object.entries(data).forEach(([type, items]) => {
      if (!items?.length || type === 'fires' || type === 'weather') return;
      items.forEach(item => {
        const bucket = getSeverityBucket(item, type);
        severityCounts[bucket] = (severityCounts[bucket] || 0) + 1;
      });
    });

    // Active vs ended
    let activeCount = 0;
    let endedCount = 0;
    Object.entries(data).forEach(([type, items]) => {
      if (!items?.length || type === 'fires' || type === 'weather') return;
      items.forEach(item => {
        if (item.isActive === false) endedCount++;
        else activeCount++;
      });
    });

    // Total events
    const totalEvents = mainTypes.reduce((sum, type) => sum + (data[type]?.length || 0), 0);

    return {
      typeCounts,
      typeValues: mainTypes.map(t => typeCounts[t]),
      typeColors,
      typeLabels,
      topCountries,
      severityCounts,
      activeCount,
      endedCount,
      totalEvents,
      donutSegments: mainTypes.filter(t => typeCounts[t] > 0).map(t => ({
        value: typeCounts[t],
        color: DISASTER_META[t]?.color || '#888',
        label: DISASTER_META[t]?.label || t
      }))
    };
  }, [data]);

  if (!isOpen || !analytics) return null;

  const sevColors = {
    Critical: '#ff4444',
    Severe: '#ff8800',
    Moderate: '#ffcc00',
    Minor: '#88cc00',
    Inactive: '#666'
  };

  return (
    <div className="analytics-overlay" onClick={onClose}>
      <div className="analytics-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label="Analytics Dashboard" aria-modal="true">
        
        {/* Header */}
        <div className="analytics-header">
          <div className="analytics-title-row">
            <h2 className="analytics-title">📊 Analytics</h2>
            <button className="analytics-close" onClick={onClose} aria-label="Close analytics">✕</button>
          </div>
          <div className="analytics-tabs" role="tablist">
            {['overview', 'countries', 'severity', 'sources'].map(tab => (
              <button
                key={tab}
                className={`analytics-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="analytics-body">
          
          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="analytics-section">
              <div className="analytics-hero">
                <DonutChart segments={analytics.donutSegments} size={120} />
                <div className="analytics-hero-stats">
                  <div className="hero-stat">
                    <span className="hero-stat-val" style={{ color: '#00ff88' }}>{analytics.activeCount}</span>
                    <span className="hero-stat-label">Active</span>
                  </div>
                  <div className="hero-stat">
                    <span className="hero-stat-val" style={{ color: '#666' }}>{analytics.endedCount}</span>
                    <span className="hero-stat-label">Ended</span>
                  </div>
                  <div className="hero-stat">
                    <span className="hero-stat-val" style={{ color: connected ? '#00ff88' : '#ff4444' }}>
                      {connected ? '●' : '○'}
                    </span>
                    <span className="hero-stat-label">{connected ? 'Live' : 'Offline'}</span>
                  </div>
                </div>
              </div>

              <h3 className="analytics-subtitle">Events by Type</h3>
              <div className="analytics-chart-container">
                <SparkBar
                  values={analytics.typeValues}
                  colors={analytics.typeColors}
                  labels={analytics.typeLabels}
                  maxH={70}
                  barW={28}
                  gap={6}
                />
              </div>

              <div className="analytics-type-grid">
                {Object.entries(analytics.typeCounts).filter(([_, c]) => c > 0).map(([type, count]) => (
                  <div className="analytics-type-card" key={type}>
                    <span className="type-card-icon">{DISASTER_META[type]?.icon}</span>
                    <span className="type-card-count" style={{ color: DISASTER_META[type]?.color }}>{count}</span>
                    <span className="type-card-label">{DISASTER_META[type]?.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── COUNTRIES TAB ── */}
          {activeTab === 'countries' && (
            <div className="analytics-section">
              <h3 className="analytics-subtitle">Most Affected Regions</h3>
              <div className="country-leaderboard">
                {analytics.topCountries.map(([country, info], idx) => {
                  const maxCount = analytics.topCountries[0]?.[1]?.total || 1;
                  const pct = (info.total / maxCount) * 100;
                  
                  return (
                    <div className="country-row" key={country}>
                      <span className="country-rank">#{idx + 1}</span>
                      <div className="country-info">
                        <div className="country-name">{country}</div>
                        <div className="country-bar-track">
                          <div
                            className="country-bar-fill"
                            style={{ width: `${pct}%`, background: `linear-gradient(90deg, #4488ff, #00ccff)` }}
                          />
                        </div>
                        <div className="country-types">
                          {Object.entries(info.types).map(([type, cnt]) => (
                            <span key={type} className="country-type-pill" style={{ borderColor: DISASTER_META[type]?.color }}>
                              {DISASTER_META[type]?.icon} {cnt}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="country-count">{info.total}</span>
                    </div>
                  );
                })}
                {analytics.topCountries.length === 0 && (
                  <p className="analytics-empty">No country data available yet.</p>
                )}
              </div>
            </div>
          )}

          {/* ── SEVERITY TAB ── */}
          {activeTab === 'severity' && (
            <div className="analytics-section">
              <h3 className="analytics-subtitle">Severity Distribution</h3>
              <div className="severity-grid">
                {Object.entries(analytics.severityCounts).filter(([_, c]) => c > 0).map(([level, count]) => (
                  <div className="severity-card" key={level} style={{ borderColor: sevColors[level] }}>
                    <div className="severity-dot" style={{ background: sevColors[level] }} />
                    <div className="severity-count" style={{ color: sevColors[level] }}>{count}</div>
                    <div className="severity-label">{level}</div>
                  </div>
                ))}
              </div>
              
              <h3 className="analytics-subtitle" style={{ marginTop: 24 }}>Severity Bar</h3>
              <div className="severity-stacked-bar">
                {Object.entries(analytics.severityCounts).filter(([_, c]) => c > 0).map(([level, count]) => {
                  const totalSev = Object.values(analytics.severityCounts).reduce((s, c) => s + c, 0);
                  const pct = totalSev > 0 ? (count / totalSev) * 100 : 0;
                  return (
                    <div
                      key={level}
                      className="severity-bar-segment"
                      style={{ width: `${pct}%`, background: sevColors[level] }}
                      title={`${level}: ${count} (${pct.toFixed(0)}%)`}
                    />
                  );
                })}
              </div>
              <div className="severity-legend">
                {Object.entries(sevColors).map(([level, color]) => (
                  <span key={level} className="severity-legend-item">
                    <span className="severity-legend-dot" style={{ background: color }} />
                    {level}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── SOURCES TAB ── */}
          {activeTab === 'sources' && (
            <div className="analytics-section">
              <h3 className="analytics-subtitle">Data Source Health</h3>
              {serverStats?.data ? (
                <div className="source-health-grid">
                  {Object.entries(serverStats.data).map(([type, info]) => (
                    <div className="source-health-card" key={type}>
                      <div className="source-health-header">
                        <span>{DISASTER_META[type]?.icon || '❓'}</span>
                        <span className="source-name">{DISASTER_META[type]?.label || type}</span>
                        <span className={`source-status ${info.hasData ? 'online' : 'offline'}`}>
                          {info.hasData ? '● OK' : '○ NO DATA'}
                        </span>
                      </div>
                      <div className="source-health-details">
                        <span>Count: {info.count}</span>
                        <span>Updated: {info.lastUpdate ? new Date(info.lastUpdate).toLocaleTimeString() : 'Never'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analytics-empty">Loading server stats...</p>
              )}
              
              {serverStats?.lastFetch && (
                <>
                  <h3 className="analytics-subtitle" style={{ marginTop: 24 }}>Last Fetch Times</h3>
                  <div className="fetch-times-grid">
                    {Object.entries(serverStats.lastFetch).map(([source, time]) => (
                      <div className="fetch-time-row" key={source}>
                        <span className="fetch-source">{source}</span>
                        <span className="fetch-time">{time ? new Date(time).toLocaleTimeString() : '—'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;