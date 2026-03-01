#!/bin/sh

echo "Starting TXLS - Crypto Tax Analysis..."

OPTIONS_FILE="/data/options.json"

if [ -f "$OPTIONS_FILE" ] && command -v jq >/dev/null 2>&1; then
  JWT_SECRET=$(jq -r '.jwt_secret // empty' "$OPTIONS_FILE")
  DB_CONNECTION_STRING=$(jq -r '.db_connection_string // empty' "$OPTIONS_FILE")
  LOG_LEVEL=$(jq -r '.log_level // empty' "$OPTIONS_FILE")
elif [ -f "$OPTIONS_FILE" ]; then
  JWT_SECRET=$(grep -o '"jwt_secret"[ ]*:[ ]*"[^"]*"' "$OPTIONS_FILE" | head -1 | sed 's/.*: *"\([^"]*\)"/\1/')
  DB_CONNECTION_STRING=$(grep -o '"db_connection_string"[ ]*:[ ]*"[^"]*"' "$OPTIONS_FILE" | head -1 | sed 's/.*: *"\([^"]*\)"/\1/')
  LOG_LEVEL=$(grep -o '"log_level"[ ]*:[ ]*"[^"]*"' "$OPTIONS_FILE" | head -1 | sed 's/.*: *"\([^"]*\)"/\1/')
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "null" ] || [ "$JWT_SECRET" = "" ]; then
  JWT_SECRET=$(openssl rand -base64 64 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
  echo "Generated random JWT_SECRET"
fi

export JWT_SECRET
export DB_CONNECTION_STRING="${DB_CONNECTION_STRING:-./data/txls.db}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export HOSTNAME="0.0.0.0"
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN:-}"
export NODE_ENV="production"

mkdir -p /data

cd /app

exec node /app/node_modules/next/dist/bin/next start -H 0.0.0.0
