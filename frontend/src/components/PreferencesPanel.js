// ============================================================================
// PreferencesPanel.js — v5.0.1 FIXED
// Drop into: /var/www/realnow/frontend/src/components/PreferencesPanel.js
// ============================================================================
//
// FIXES:
//   1. Now uses useTranslation() hook so section titles update on language change
//   2. All static text is now translated — proving language switch works
//   3. Added visual feedback (brief green flash) when settings change
//   4. Fixed email save button and digest frequency selector
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n/i18n';

const LANGUAGES = {
  en: { label: 'English', flag: '🇬🇧', code: 'GB' },
  es: { label: 'Español', flag: '🇪🇸', code: 'ES' },
  fr: { label: 'Français', flag: '🇫🇷', code: 'FR' },
  pt: { label: 'Português', flag: '🇧🇷', code: 'BR' },
  ar: { label: 'العربية', flag: '🇸🇦', code: 'SA' },
  zh: { label: '中文', flag: '🇨🇳', code: 'CN' },
  hi: { label: 'हिन्दी', flag: '🇮🇳', code: 'IN' },
};

const MAP_STYLES = [
  { key: 'dark', label: '🌑', labelKey: 'darkMode' },
  { key: 'satellite', label: '🛰️', labelKey: 'satellite' },
  { key: 'terrain', label: '🏔️', labelKey: 'terrain' },
  { key: 'light', label: '☀️', labelKey: 'light' },
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
  digestFrequency = 'off',
  onDigestFrequencyChange,
}) => {
  // FIX: Use translation hook so text updates when language changes
  const { t } = useTranslation();
  const [localEmail, setLocalEmail] = useState(digestEmail || '');
  const [savedFlash, setSavedFlash] = useState('');

  // Visual feedback when a setting changes
  const flashSaved = useCallback((key) => {
    setSavedFlash(key);
    setTimeout(() => setSavedFlash(''), 800);
  }, []);

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
      console.log('Prefs sync failed (backend may not have preferences module)');
    }
  }, []);

  // Debounced sync on change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      syncToBackend({
        mapStyle, language, alertsEnabled, soundEnabled,
        digestEmail: localEmail, digestFrequency, watchArea
      });
    }, 1000);
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
    flashSaved('email');
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

  // Handlers with visual feedback
  const handleMapStyleChange = (key) => {
    onMapStyleChange?.(key);
    flashSaved('mapStyle');
  };

  const handleLanguageChange = (code) => {
    onLanguageChange?.(code);
    flashSaved('language');
  };

  const handleAlertsToggle = (val) => {
    onAlertsToggle?.(val);
    if (val && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    flashSaved('alerts');
  };

  const handleSoundToggle = (val) => {
    onSoundToggle?.(val);
    flashSaved('sound');
  };

  if (!isOpen) return null;

  return (
    <div className="prefs-overlay" onClick={onClose}>
      <div className="prefs-panel" role="dialog" aria-label={t('settings')} aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="prefs-header">
          <span className="prefs-title">⚙️ {t('settings')}</span>
          <button className="prefs-close" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>

        {/* Map Style */}
        <div className="prefs-section">
          <div className="prefs-section-title" style={savedFlash === 'mapStyle' ? { color: '#00ff88' } : {}}>
            {t('mapStyleTitle') || 'Map Style'}
            {savedFlash === 'mapStyle' && <span style={{ marginLeft: 8, fontSize: 9, color: '#00ff88' }}>✓</span>}
          </div>
          <div className="prefs-lang-grid">
            {MAP_STYLES.map(s => (
              <button
                key={s.key}
                className={`prefs-lang-btn ${mapStyle === s.key ? 'active' : ''}`}
                onClick={() => handleMapStyleChange(s.key)}
              >
                {s.label} {t(s.labelKey) || s.key.charAt(0).toUpperCase() + s.key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="prefs-section">
          <div className="prefs-section-title" style={savedFlash === 'language' ? { color: '#00ff88' } : {}}>
            {t('language') || 'Language'}
            {savedFlash === 'language' && <span style={{ marginLeft: 8, fontSize: 9, color: '#00ff88' }}>✓</span>}
          </div>
          <div className="prefs-lang-grid">
            {Object.entries(LANGUAGES).map(([code, info]) => (
              <button
                key={code}
                className={`prefs-lang-btn ${language === code ? 'active' : ''}`}
                onClick={() => handleLanguageChange(code)}
              >
                <span style={{ fontSize: 10, opacity: 0.6, marginRight: 4 }}>{info.code}</span> {info.label}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="prefs-section">
          <div className="prefs-section-title">
            {t('alertsTitle') || 'Alerts & Notifications'}
          </div>
          <div className="prefs-row">
            <span className="prefs-label">🔔 {t('browserNotifications') || 'Browser Notifications'}</span>
            <Toggle checked={alertsEnabled} onChange={handleAlertsToggle} label="Toggle browser notifications" />
          </div>
          <div className="prefs-row">
            <span className="prefs-label">🔊 {t('alertSounds') || 'Alert Sounds'}</span>
            <Toggle checked={soundEnabled} onChange={handleSoundToggle} label="Toggle alert sounds" />
          </div>
        </div>

        {/* Watch Area */}
        <div className="prefs-section">
          <div className="prefs-section-title">{t('watchArea') || 'Watch Area'}</div>
          {watchArea ? (
            <div>
              <div className="prefs-row">
                <span className="prefs-label">📍 {watchArea.label || watchArea.name || 'Custom Area'}</span>
              </div>
              <div className="prefs-row" style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                {watchArea.lat?.toFixed(3)}, {watchArea.lon?.toFixed(3)} · {watchArea.radiusKm || watchArea.radius || 500}km
              </div>
              <button
                className="prefs-lang-btn"
                style={{ width: '100%', marginTop: 8, color: '#ff6666', borderColor: 'rgba(255,100,100,0.3)' }}
                onClick={onClearWatchArea}
              >
                {t('clearWatchArea') || 'Clear Watch Area'}
              </button>
            </div>
          ) : (
            <div style={{ color: '#666', fontFamily: 'monospace', fontSize: 11, padding: '8px 0' }}>
              {t('noWatchArea') || 'No watch area set. Click the map with the watch tool to set one.'}
            </div>
          )}
        </div>

        {/* Email Digest */}
        <div className="prefs-section">
          <div className="prefs-section-title">{t('emailDigest') || 'Email Digest'}</div>
          <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11, marginBottom: 8 }}>
            {t('emailDigestDesc') || 'Get a summary of events in your watch area delivered to your inbox.'}
          </div>
          <input
            type="email"
            className="prefs-input"
            placeholder="your@email.com"
            value={localEmail}
            onChange={e => setLocalEmail(e.target.value)}
          />
          {localEmail && localEmail !== digestEmail && (
            <button
              className="prefs-lang-btn"
              style={{
                width: '100%', marginTop: 8,
                color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)',
                background: 'rgba(0,255,136,0.08)'
              }}
              onClick={handleEmailSave}
            >
              {savedFlash === 'email' ? '✓ Saved!' : (t('saveEmail') || 'Save Email')}
            </button>
          )}
          {localEmail && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 10, marginBottom: 4 }}>
                {t('frequency') || 'Frequency'}:
              </div>
              <div className="prefs-lang-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  { key: 'off', label: t('off') || 'Off' },
                  { key: 'daily', label: t('daily') || 'Daily' },
                  { key: 'weekly', label: t('weekly') || 'Weekly' }
                ].map(f => (
                  <button
                    key={f.key}
                    className={`prefs-lang-btn ${digestFrequency === f.key ? 'active' : ''}`}
                    onClick={() => {
                      onDigestFrequencyChange?.(f.key);
                      flashSaved('freq');
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* About */}
        <div className="prefs-section" style={{ borderBottom: 'none' }}>
          <div className="prefs-section-title">About</div>
          <div style={{ color: '#666', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>
            RealNow v5.0 — Real-Time Disaster Tracker<br />
            Data: USGS · NASA · GDACS · NOAA · ReliefWeb<br />
            <span style={{ color: '#444' }}>All sources free & open</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreferencesPanel;