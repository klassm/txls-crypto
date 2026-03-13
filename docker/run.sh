#!/bin/sh

echo "Starting TXLS - Crypto Tax Analysis..."

OPTIONS_FILE="/data/options.json"
JWT_SECRET_FILE="/data/jwt_secret"

if [ -f "$OPTIONS_FILE" ] && command -v jq >/dev/null 2>&1; then
  JWT_SECRET=$(jq -r '.jwt_secret // empty' "$OPTIONS_FILE")
  DB_CONNECTION_STRING=$(jq -r '.db_connection_string // empty' "$OPTIONS_FILE")
  LOG_LEVEL=$(jq -r '.log_level // empty' "$OPTIONS_FILE")
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "null" ] || [ "$JWT_SECRET" = "" ]; then
  if [ -f "$JWT_SECRET_FILE" ]; then
    JWT_SECRET=$(cat "$JWT_SECRET_FILE")
    echo "Loaded JWT_SECRET from $JWT_SECRET_FILE"
  else
    JWT_SECRET=$(openssl rand -base64 64 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
    echo "Generated new JWT_SECRET"
    mkdir -p /data
    echo -n "$JWT_SECRET" > "$JWT_SECRET_FILE"
    echo "Saved JWT_SECRET to $JWT_SECRET_FILE"
  fi
fi

export JWT_SECRET
export DB_CONNECTION_STRING="${DB_CONNECTION_STRING:-/data/txls.db}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export HOSTNAME="0.0.0.0"
export NODE_ENV="${NODE_ENV:-production}"

mkdir -p /data

cd /app

echo "Starting API server on port 3001..."
node /app/server/dist/index.js &

echo "Starting nginx on port 3000..."
exec nginx -g "daemon off;"
