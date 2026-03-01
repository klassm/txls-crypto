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

export JWT_SECRET
export DB_CONNECTION_STRING="${DB_CONNECTION_STRING:-./data/txls.db}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"

mkdir -p /data

INGRESS_PATH=""
if [ -n "$SUPERVISOR_TOKEN" ]; then
  INGRESS_PATH=$(wget -qO- --header "Authorization: Bearer $SUPERVISOR_TOKEN" \
    http://supervisor/addons/self/info 2>/dev/null | jq -r '.data.ingress_url' 2>/dev/null)
  INGRESS_PATH="${INGRESS_PATH%/}"
fi

if [ -n "$INGRESS_PATH" ] && [ "$INGRESS_PATH" != "null" ]; then
  echo "Detected ingress path: $INGRESS_PATH"
  cat > /etc/nginx/nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 8080;
        server_name _;

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;

            sub_filter 'src="/_next/' 'src="$INGRESS_PATH/_next/';
            sub_filter 'href="/_next/' 'href="$INGRESS_PATH/_next/';
            sub_filter 'href="/api/' 'href="$INGRESS_PATH/api/';
            sub_filter 'action="/api/' 'action="$INGRESS_PATH/api/';
            sub_filter 'url("/_next/' 'url("$INGRESS_PATH/_next/';
            sub_filter "url('/_next/" "url('$INGRESS_PATH/_next/";
            sub_filter_once off;
            sub_filter_types text/html text/css application/javascript application/json;
        }
    }
}
EOF
else
  echo "No ingress path, using simple proxy"
  cat > /etc/nginx/nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 8080;
        server_name _;

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
    }
}
EOF
fi

echo "Starting TXLS..."
node /app/node_modules/next/dist/bin/next start -H 0.0.0.0 &
NEXT_PID=$!

sleep 2

echo "Starting nginx..."
nginx -g "daemon off;"
