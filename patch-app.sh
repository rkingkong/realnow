#!/bin/bash
# ============================================================================
# patch-app.sh — Fix App.js bugs in-place
# Run from: /var/www/realnow/
# Usage: bash patch-app.sh
# ============================================================================
#
# Fixes:
#   1. useSmartAlerts args are in wrong order: (data, watchArea, enabled)
#      should be: (data, alertsEnabled, watchArea, { soundEnabled })
#   2. ClusterLayer receives 'data=' but component expects 'items='
# ============================================================================

APP_JS="frontend/src/App.js"

if [ ! -f "$APP_JS" ]; then
  echo "❌ $APP_JS not found. Run this from /var/www/realnow/"
  exit 1
fi

echo "🔧 Patching $APP_JS..."

# Backup
cp "$APP_JS" "${APP_JS}.bak.$(date +%s)"
echo "  ✓ Backup created"

# ──────────────────────────────────────────────────
# FIX 1: useSmartAlerts argument order
# ──────────────────────────────────────────────────
# BEFORE: useSmartAlerts(data, watchArea, alertsEnabled && soundEnabled);
# AFTER:  useSmartAlerts(data, alertsEnabled, watchArea, { soundEnabled });
sed -i 's/useSmartAlerts(data, watchArea, alertsEnabled && soundEnabled)/useSmartAlerts(data, alertsEnabled, watchArea, { soundEnabled })/' "$APP_JS"

# Also handle alternate forms that might exist:
sed -i 's/useSmartAlerts(data, watchArea, alertsEnabled)/useSmartAlerts(data, alertsEnabled, watchArea, { soundEnabled })/' "$APP_JS"

echo "  ✓ Fixed useSmartAlerts argument order"

# ──────────────────────────────────────────────────
# FIX 2: ClusterLayer prop name: data → items
# ──────────────────────────────────────────────────
# BEFORE: <ClusterLayer data={data.fires} type="fires" ...
# AFTER:  <ClusterLayer items={data.fires} type="fires" ...
sed -i 's/<ClusterLayer\n\?\s*data={data\.fires}/<ClusterLayer\n              items={data.fires}/' "$APP_JS"
# Also try single-line version
sed -i 's/<ClusterLayer data={data\.fires}/<ClusterLayer items={data.fires}/' "$APP_JS"

echo "  ✓ Fixed ClusterLayer prop name (data → items)"

# ──────────────────────────────────────────────────
# Verify patches
# ──────────────────────────────────────────────────
echo ""
echo "📋 Verification:"
echo ""

echo "  useSmartAlerts call:"
grep -n "useSmartAlerts" "$APP_JS" | head -3
echo ""

echo "  ClusterLayer props:"
grep -n "ClusterLayer" "$APP_JS" | head -3
echo ""

echo "✅ Patches applied! Run 'npm run build' in frontend/ to rebuild."