#!/bin/sh

cd /app

OPTIONS_FILE="/data/options.json"

if [ -f "$OPTIONS_FILE" ] && command -v jq >/dev/null 2>&1; then
  JWT_SECRET=$(jq -r '.jwt_secret // empty' "$OPTIONS_FILE")
  DB_CONNECTION_STRING=$(jq -r '.db_connection_string // empty' "$OPTIONS_FILE")
  LOG_LEVEL=$(jq -r '.log_level // empty' "$OPTIONS_FILE")
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "null" ] || [ "$JWT_SECRET" = "" ]; then
  JWT_SECRET=$(openssl rand -base64 64 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
  echo "Generated random JWT_SECRET"
fi

REPLACEMENT=""
if [ -n "$SUPERVISOR_TOKEN" ]; then
  INGRESS_URL=$(curl -s -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
    http://supervisor/addons/self/info 2>/dev/null | jq -r '.data.ingress_url // empty')
  if [ -n "$INGRESS_URL" ] && [ "$INGRESS_URL" != "null" ] && [ "$INGRESS_URL" != "" ]; then
    REPLACEMENT="$INGRESS_URL"
    echo "Ingress URL: $REPLACEMENT"
  fi
fi

echo "Replacing /__INGRESS_PATH__ with '$REPLACEMENT' in .next files..."
find /app/.next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.rsc" -o -name "*.map" \) -exec sed -i "s|/__INGRESS_PATH__|$REPLACEMENT|g" {} \;
echo "Done replacing paths"

export JWT_SECRET
export DB_CONNECTION_STRING="${DB_CONNECTION_STRING:-./data/txls.db}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"

mkdir -p /data

echo "Starting TXLS..."
exec node /app/node_modules/next/dist/bin/next start -H 0.0.0.0
