// ============================================================================
// PreferencesPanel.js — User Settings Panel
// Drop into: /var/www/realnow/frontend/src/components/PreferencesPanel.js
// ============================================================================
//
// Slide-in settings panel for:
// - Map style (dark/satellite/terrain/light)
// - Language selection
// - Alert toggles (sound, notifications)
// - Watch area management
// - Email digest configuration
// - Syncs with backend /api/preferences
//
// Usage in App.js:
//   import PreferencesPanel from './components/PreferencesPanel';
//   <PreferencesPanel
//     isOpen={prefsOpen}
//     onClose={() => setPrefsOpen(false)}
//     mapStyle={mapStyle}
//     onMapStyleChange={setMapStyle}
//     language={language}
//     onLanguageChange={setLanguage}
//     alertsEnabled={alertsEnabled}
//     onAlertsToggle={setAlertsEnabled}
//     soundEnabled={soundEnabled}
//     onSoundToggle={setSoundEnabled}
//     watchArea={watchArea}
//     onClearWatchArea={() => setWatchArea(null)}
//     digestEmail={digestEmail}
//     onDigestEmailChange={setDigestEmail}
//   />
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

const LANGUAGES = {
  en: { label: 'English', flag: '🇬🇧' },
  es: { label: 'Español', flag: '🇪🇸' },
  fr: { label: 'Français', flag: '🇫🇷' },
  pt: { label: 'Português', flag: '🇧🇷' },
  ar: { label: 'العربية', flag: '🇸🇦' },
  zh: { label: '中文', flag: '🇨🇳' },
  hi: { label: 'हिन्दी', flag: '🇮🇳' },
};

const MAP_STYLES = [
  { key: 'dark', label: '🌑 Dark' },
  { key: 'satellite', label: '🛰️ Satellite' },
  { key: 'terrain', label: '🏔️ Terrain' },
  { key: 'light', label: '☀️ Light' },
];

const Toggle = ({ checked, onChange, label }) => (
  <label className="prefs-toggle" aria-label={label}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    <span className="prefs-toggle-track" />
    <span className="prefs-toggle-thumb" />
  </label>
);

const PreferencesPanel = ({
  isOpen,
  onClose,
  mapStyle = 'dark',
  onMapStyleChange,
  language = 'en',
  onLanguageChange,
  alertsEnabled = false,
  onAlertsToggle,
  soundEnabled = true,
  onSoundToggle,
  watchArea = null,
  onClearWatchArea,
  digestEmail = '',
  onDigestEmailChange,
  digestFrequency = 'daily',
  onDigestFrequencyChange,
}) => {
  const [localEmail, setLocalEmail] = useState(digestEmail || '');

  // Sync preferences to backend
  const syncToBackend = useCallback(async (updates) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
      
      await fetch(`${backendUrl}/api/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
    } catch (e) {
      // Silent fail — local storage still works
      console.log('Prefs sync failed (backend may not have preferences module)');
    }
  }, []);

  // Sync on change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      syncToBackend({
        mapStyle,
        language,
        alertsEnabled,
        soundEnabled,
        digestEmail: localEmail,
        digestFrequency,
        watchArea
      });
    }, 1000); // Debounce
    return () => clearTimeout(timer);
  }, [mapStyle, language, alertsEnabled, soundEnabled, localEmail, digestFrequency, watchArea, isOpen, syncToBackend]);

  // Load from backend on open
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 
          (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
        const res = await fetch(`${backendUrl}/api/preferences`, { credentials: 'include' });
        const data = await res.json();
        if (data.preferences?.digestEmail) {
          setLocalEmail(data.preferences.digestEmail);
        }
      } catch (e) { /* fallback to local */ }
    };
    load();
  }, [isOpen]);

  const handleEmailSave = () => {
    onDigestEmailChange?.(localEmail);
    syncToBackend({ digestEmail: localEmail });
  };

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="prefs-overlay" onClick={onClose} />
      <div className="prefs-panel" role="dialog" aria-label="Settings" aria-modal="true">
        <div className="prefs-header">
          <span className="prefs-title">⚙️ Settings</span>
          <button className="prefs-close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        {/* Map Style */}
        <div className="prefs-section">
          <div className="prefs-section-title">Map Style</div>
          <div className="prefs-lang-grid">
            {MAP_STYLES.map(s => (
              <button
                key={s.key}
                className={`prefs-lang-btn ${mapStyle === s.key ? 'active' : ''}`}
                onClick={() => onMapStyleChange?.(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="prefs-section">
          <div className="prefs-section-title">Language</div>
          <div className="prefs-lang-grid">
            {Object.entries(LANGUAGES).map(([code, info]) => (
              <button
                key={code}
                className={`prefs-lang-btn ${language === code ? 'active' : ''}`}
                onClick={() => onLanguageChange?.(code)}
              >
                {info.flag} {info.label}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="prefs-section">
          <div className="prefs-section-title">Alerts & Notifications</div>
          <div className="prefs-row">
            <span className="prefs-label">🔔 Browser Notifications</span>
            <Toggle checked={alertsEnabled} onChange={onAlertsToggle} label="Toggle browser notifications" />
          </div>
          <div className="prefs-row">
            <span className="prefs-label">🔊 Alert Sounds</span>
            <Toggle checked={soundEnabled} onChange={onSoundToggle} label="Toggle alert sounds" />
          </div>
        </div>

        {/* Watch Area */}
        <div className="prefs-section">
          <div className="prefs-section-title">Watch Area</div>
          {watchArea ? (
            <div>
              <div className="prefs-row">
                <span className="prefs-label">📍 {watchArea.label || 'Custom Area'}</span>
              </div>
              <div className="prefs-row" style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                {watchArea.lat?.toFixed(3)}, {watchArea.lon?.toFixed(3)} · {watchArea.radiusKm || 500}km radius
              </div>
              <button
                className="prefs-lang-btn"
                style={{ width: '100%', marginTop: 8, color: '#ff6666', borderColor: 'rgba(255,100,100,0.3)' }}
                onClick={onClearWatchArea}
              >
                Clear Watch Area
              </button>
            </div>
          ) : (
            <div style={{ color: '#666', fontFamily: 'monospace', fontSize: 11, padding: '8px 0' }}>
              No watch area set. Click the map with the watch tool to set one.
            </div>
          )}
        </div>

        {/* Email Digest */}
        <div className="prefs-section">
          <div className="prefs-section-title">Email Digest</div>
          <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11, marginBottom: 8 }}>
            Get a summary of events in your watch area delivered to your inbox.
          </div>
          <input
            type="email"
            className="prefs-input"
            placeholder="your@email.com"
            value={localEmail}
            onChange={e => setLocalEmail(e.target.value)}
            onBlur={handleEmailSave}
            aria-label="Email address for digest"
          />
          {localEmail && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {['daily', 'weekly', 'off'].map(freq => (
                <button
                  key={freq}
                  className={`prefs-lang-btn ${digestFrequency === freq ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => onDigestFrequencyChange?.(freq)}
                >
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* About */}
        <div className="prefs-section" style={{ borderBottom: 'none' }}>
          <div className="prefs-section-title">About</div>
          <div style={{ color: '#666', fontFamily: 'monospace', fontSize: 10, lineHeight: 1.6 }}>
            RealNow v5.0 — Real-Time Disaster Tracker<br />
            Data: USGS · NASA FIRMS · GDACS · NOAA · ReliefWeb<br />
            11 disaster types · 7 languages · PWA enabled
          </div>
        </div>
      </div>
    </>
  );
};

export default PreferencesPanel;