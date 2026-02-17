// ============================================================================
// AnalyticsDashboard.js — v5.2 COMPLETE i18n
// Drop into: /var/www/realnow/frontend/src/components/AnalyticsDashboard.js
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n/i18n';

// ── Spark Bar Chart ────────────────────────────────────────────────────────

const SparkBar = ({ values, colors, labels, maxH = 70, barW = 28, gap = 6 }) => {
  const max = Math.max(...values, 1);
  const totalW = values.length * (barW + gap) - gap;
  return (
    <svg width={totalW} height={maxH + 20} style={{ display: 'block', margin: '0 auto' }}>
      {values.map((v, i) => {
        const h = (v / max) * maxH;
        const x = i * (barW + gap);
        return (
          <g key={i}>
            <rect x={x} y={maxH - h} width={barW} height={h} rx={4} fill={colors[i]} opacity={0.85} />
            <text x={x + barW / 2} y={maxH - h - 4} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="600">
              {v > 0 ? v : ''}
            </text>
            <text x={x + barW / 2} y={maxH + 13} textAnchor="middle" fill="#888" fontSize="8">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Donut Chart ────────────────────────────────────────────────────────────

const DonutChart = ({ segments, size = 120, eventsLabel = 'EVENTS' }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#222" strokeWidth="12" />
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * circumference;
        const el = (
          <circle
            key={i}
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={seg.color} strokeWidth="12"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            opacity={0.85}
          />
        );
        offset += dash;
        return el;
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
        {eventsLabel}
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
  earthquakes:  { icon: '🌍', color: '#ff4444', labelKey: 'earthquakes' },
  wildfires:    { icon: '🔥', color: '#ff6600', labelKey: 'wildfires' },
  floods:       { icon: '🌊', color: '#4488ff', labelKey: 'floods' },
  cyclones:     { icon: '🌀', color: '#00ccff', labelKey: 'cyclones' },
  volcanoes:    { icon: '🌋', color: '#ff3333', labelKey: 'volcanoes' },
  droughts:     { icon: '🏜️', color: '#cc9900', labelKey: 'droughts' },
  landslides:   { icon: '⛰️', color: '#8B4513', labelKey: 'landslides' },
  tsunamis:     { icon: '🌊', color: '#0066cc', labelKey: 'tsunamis' },
  spaceweather: { icon: '☀️', color: '#ff00ff', labelKey: 'spaceweather' },
  fires:        { icon: '🔥', color: '#ff8800', labelKey: 'fires' },
  weather:      { icon: '⚠️', color: '#ffaa00', labelKey: 'weather' },
};

const AnalyticsDashboard = ({ data, isOpen, onClose, connected }) => {
  const { t } = useTranslation();
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

    const typeCounts = {};
    const typeColors = [];
    const typeLabels = [];
    const mainTypes = ['earthquakes', 'wildfires', 'floods', 'cyclones', 'volcanoes', 'droughts', 'landslides', 'tsunamis'];
    
    mainTypes.forEach(type => {
      const count = data[type]?.length || 0;
      typeCounts[type] = count;
      typeColors.push(DISASTER_META[type]?.color || '#888');
      // Use first 5 chars of the translated label for the chart
      typeLabels.push((t(DISASTER_META[type]?.labelKey) || type).slice(0, 5));
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

    const totalEvents = mainTypes.reduce((sum, type) => sum + (data[type]?.length || 0), 0);

    return {
      typeCounts,
      typeValues: mainTypes.map(tp => typeCounts[tp]),
      typeColors,
      typeLabels,
      topCountries,
      severityCounts,
      activeCount,
      endedCount,
      totalEvents,
      donutSegments: mainTypes.filter(tp => typeCounts[tp] > 0).map(tp => ({
        value: typeCounts[tp],
        color: DISASTER_META[tp]?.color || '#888',
        label: t(DISASTER_META[tp]?.labelKey) || tp
      }))
    };
  }, [data, t]);

  if (!isOpen || !analytics) return null;

  const sevColors = {
    Critical: '#ff4444',
    Severe: '#ff8800',
    Moderate: '#ffcc00',
    Minor: '#88cc00',
    Inactive: '#666'
  };

  const tabNames = {
    overview: t('overview'),
    countries: t('countries'),
    severity: t('severityTab'),
    sources: t('sourcesTab')
  };

  return (
    <div className="analytics-overlay" onClick={onClose}>
      <div className="analytics-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('analytics')} aria-modal="true">
        
        {/* Header */}
        <div className="analytics-header">
          <div className="analytics-title-row">
            <h2 className="analytics-title">📊 {t('analytics')}</h2>
            <button className="analytics-close" onClick={onClose} aria-label={t('close')}>✕</button>
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
                {tabNames[tab]}
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
                <DonutChart segments={analytics.donutSegments} size={120} eventsLabel={t('events')} />
                <div className="analytics-hero-stats">
                  <div className="hero-stat">
                    <span className="hero-stat-val" style={{ color: '#00ff88' }}>{analytics.activeCount}</span>
                    <span className="hero-stat-label">{t('active')}</span>
                  </div>
                  <div className="hero-stat">
                    <span className="hero-stat-val" style={{ color: '#666' }}>{analytics.endedCount}</span>
                    <span className="hero-stat-label">{t('ended')}</span>
                  </div>
                  <div className="hero-stat">
                    <span className="hero-stat-val" style={{ color: connected ? '#00ff88' : '#ff4444' }}>
                      {connected ? '●' : '○'}
                    </span>
                    <span className="hero-stat-label">{connected ? t('live') : t('offline')}</span>
                  </div>
                </div>
              </div>

              <h3 className="analytics-subtitle">{t('eventsByType')}</h3>
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
                    <span className="type-card-label">{t(DISASTER_META[type]?.labelKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── COUNTRIES TAB ── */}
          {activeTab === 'countries' && (
            <div className="analytics-section">
              <h3 className="analytics-subtitle">{t('mostAffectedRegions')}</h3>
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
                  <p className="analytics-empty">{t('noCountryData')}</p>
                )}
              </div>
            </div>
          )}

          {/* ── SEVERITY TAB ── */}
          {activeTab === 'severity' && (
            <div className="analytics-section">
              <h3 className="analytics-subtitle">{t('severityDistribution')}</h3>
              <div className="severity-grid">
                {Object.entries(analytics.severityCounts).filter(([_, c]) => c > 0).map(([level, count]) => (
                  <div className="severity-card" key={level} style={{ borderColor: sevColors[level] }}>
                    <div className="severity-dot" style={{ background: sevColors[level] }} />
                    <div className="severity-count" style={{ color: sevColors[level] }}>{count}</div>
                    <div className="severity-label">{level}</div>
                  </div>
                ))}
              </div>
              
              <h3 className="analytics-subtitle" style={{ marginTop: 24 }}>{t('severityBar')}</h3>
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
              <h3 className="analytics-subtitle">{t('dataSourceHealth')}</h3>
              {serverStats?.data ? (
                <div className="source-health-grid">
                  {Object.entries(serverStats.data).map(([type, info]) => (
                    <div className="source-health-card" key={type}>
                      <div className="source-health-header">
                        <span>{DISASTER_META[type]?.icon || '❓'}</span>
                        <span className="source-name">{t(DISASTER_META[type]?.labelKey) || type}</span>
                        <span className={`source-status ${info.hasData ? 'online' : 'offline'}`}>
                          {info.hasData ? `● ${t('ok')}` : `○ ${t('noDataLabel')}`}
                        </span>
                      </div>
                      <div className="source-health-details">
                        <span>{t('count')}: {info.count}</span>
                        <span>{t('updated')}: {info.lastUpdate ? new Date(info.lastUpdate).toLocaleTimeString() : t('never')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analytics-empty">{t('loadingServerStats')}</p>
              )}
              
              {serverStats?.lastFetch && (
                <>
                  <h3 className="analytics-subtitle" style={{ marginTop: 24 }}>{t('lastFetchTimes')}</h3>
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