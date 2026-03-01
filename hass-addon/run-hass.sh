#!/bin/sh

echo "Configuring Home Assistant ingress..."

cd /app

# Get ingress path from Supervisor API
if [ -n "$SUPERVISOR_TOKEN" ]; then
  INGRESS_PATH=$(wget -qO- --header "Authorization: Bearer $SUPERVISOR_TOKEN" \
    http://supervisor/addons/self/info 2>/dev/null | jq -r '.data.ingress_url' 2>/dev/null)
fi

if [ -n "$INGRESS_PATH" ] && [ "$INGRESS_PATH" != "null" ]; then
  echo "Detected ingress path: $INGRESS_PATH"
  find .next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" \) \
    -exec sed -i "s|/__INGRESS_PATH_HOLDER__|$INGRESS_PATH|g" {} + 2>/dev/null
  echo "Ingress path configured"
else
  echo "No ingress path detected, using root path"
  find .next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" \) \
    -exec sed -i "s|/__INGRESS_PATH_HOLDER__||g" {} + 2>/dev/null
fi

exec /run.sh
