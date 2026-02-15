#!/bin/bash

# refresh-all.sh - Clear old cache and get fresh data

echo "🧹 CLEARING OLD CACHED DATA..."
echo "═══════════════════════════════════════════"

# Clear all fire-related cache
redis-cli DEL "data:fires" > /dev/null
redis-cli DEL "data:wildfires" > /dev/null
redis-cli DEL "data:fires_merged" > /dev/null
redis-cli DEL "data:wildfires_fixed" > /dev/null

echo "✅ Cache cleared"

echo ""
echo "🔄 RESTARTING BACKEND..."
echo "═══════════════════════════════════════════"
pm2 restart realnow-backend

echo "⏳ Waiting for backend to start..."
sleep 3

echo ""
echo "📡 FORCING FRESH DATA FETCH..."
echo "═══════════════════════════════════════════"

# Force refresh each data type
echo "Fetching earthquakes..."
curl -X POST http://localhost:3001/api/refresh/earthquakes 2>/dev/null

echo "Fetching fires..."
curl -X POST http://localhost:3001/api/refresh/fires 2>/dev/null

echo "Fetching wildfires..."
curl -X POST http://localhost:3001/api/refresh/wildfires 2>/dev/null

echo "Fetching weather..."
curl -X POST http://localhost:3001/api/refresh/weather 2>/dev/null

echo ""
echo "⏳ Waiting for data processing..."
sleep 5

echo ""
echo "📊 CHECKING NEW DATA..."
echo "═══════════════════════════════════════════"

# Check what we have now
for type in fires wildfires earthquakes weather; do
  COUNT=$(redis-cli GET "data:$type" 2>/dev/null | jq -r '.count // 0')
  echo "$type: $COUNT events"
done

echo ""
echo "🌍 CHECKING REGIONAL DISTRIBUTION..."
echo "═══════════════════════════════════════════"

# Check fires by region
echo "NASA FIRMS fires:"
AMERICAS=$(redis-cli GET "data:fires" 2>/dev/null | jq '[.features[] | select(.longitude > -170 and .longitude < -30)] | length')
EUROPE=$(redis-cli GET "data:fires" 2>/dev/null | jq '[.features[] | select(.longitude > -25 and .longitude < 45 and .latitude > 35)] | length')
AFRICA=$(redis-cli GET "data:fires" 2>/dev/null | jq '[.features[] | select(.longitude > -20 and .longitude < 52 and .latitude > -35 and .latitude < 37)] | length')

echo "  Americas: $AMERICAS"
echo "  Europe: $EUROPE"
echo "  Africa: $AFRICA"

echo ""
echo "GDACS Wildfires:"
WF_COUNT=$(redis-cli GET "data:wildfires" 2>/dev/null | jq '.count // 0')
echo "  Total: $WF_COUNT"

# Show sample Americas fire if any
if [ "$AMERICAS" -gt "0" ]; then
  echo ""
  echo "✅ SAMPLE AMERICAS FIRE:"
  redis-cli GET "data:fires" 2>/dev/null | jq '.features[] | select(.longitude > -170 and .longitude < -30) | {lat: .latitude, lon: .longitude, frp: .frp, region: .region}' | head -20
fi

echo ""
echo "✅ Data refresh complete!"
echo ""
echo "📱 Visit https://realnow.com to see the updated map"
