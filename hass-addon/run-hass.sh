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

INGRESS_PATH=""
if [ -n "$SUPERVISOR_TOKEN" ]; then
  echo "Fetching ingress URL from Supervisor API..."
  for i in 1 2 3 4 5; do
    RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
      http://supervisor/addons/self/info 2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Attempt $i: HTTP $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ] && [ -n "$BODY" ]; then
      INGRESS_PATH=$(echo "$BODY" | jq -r '.data.ingress_url // empty' | sed 's:/$::')
      if [ -n "$INGRESS_PATH" ] && [ "$INGRESS_PATH" != "null" ] && [ "$INGRESS_PATH" != "" ]; then
        echo "Ingress path: $INGRESS_PATH"
        break
      fi
    fi
    echo "Response: $BODY" | head -c 200
    sleep 2
  done
else
  echo "No SUPERVISOR_TOKEN found"
fi

if [ -z "$INGRESS_PATH" ] || [ "$INGRESS_PATH" = "null" ]; then
  echo "WARNING: No ingress path available, using empty path"
  INGRESS_PATH=""
fi

echo "Replacing /__INGRESS_PATH__ with '$INGRESS_PATH' in .next files..."
find /app/.next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.rsc" -o -name "*.map" \) -exec sed -i "s|/__INGRESS_PATH__|$INGRESS_PATH|g" {} \;
echo "Done replacing paths"

echo "Verifying replacement..."
COUNT=$(grep -r "__INGRESS_PATH__" /app/.next 2>/dev/null | wc -l)
echo "Remaining placeholders: $COUNT"
if [ "$COUNT" -gt 0 ]; then
  echo "WARNING: Some placeholders not replaced!"
  grep -r "__INGRESS_PATH__" /app/.next 2>/dev/null | head -5
fi

export JWT_SECRET
export DB_CONNECTION_STRING="${DB_CONNECTION_STRING:-./data/txls.db}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"
export NEXT_BASE_PATH="$INGRESS_PATH"

mkdir -p /data

echo "Starting TXLS with basePath: $NEXT_BASE_PATH"
exec node /app/node_modules/next/dist/bin/next start -H 0.0.0.0
