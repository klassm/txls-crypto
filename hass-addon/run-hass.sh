#!/bin/sh

cd /app

CONFIG_FILE="/tmp/ingress-configured"

if [ -f "$CONFIG_FILE" ]; then
  echo "Ingress already configured, skipping"
  exec /run.sh
fi

echo "Configuring Home Assistant ingress..."

# Wait for SUPERVISOR_TOKEN to be available (retry up to 30 times)
RETRIES=0
while [ -z "$SUPERVISOR_TOKEN" ] && [ $RETRIES -lt 30 ]; do
  echo "Waiting for SUPERVISOR_TOKEN... ($RETRIES)"
  sleep 1
  RETRIES=$((RETRIES + 1))
done

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

touch "$CONFIG_FILE"
exec /run.sh
