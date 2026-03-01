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

cat > /etc/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 8080;
        server_name _;

        allow 172.30.32.2;
        deny all;

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Accept-Encoding "";

            sub_filter 'src="/_next/' 'src="$http_x_ingress_path/_next/';
            sub_filter 'href="/_next/' 'href="$http_x_ingress_path/_next/';
            sub_filter 'href="/api/' 'href="$http_x_ingress_path/api/';
            sub_filter 'action="/api/' 'action="$http_x_ingress_path/api/';
            sub_filter '"/api/' '"$http_x_ingress_path/api/';
            sub_filter "'/api/" "'$http_x_ingress_path/api/";
            sub_filter 'url("/_next/' 'url("$http_x_ingress_path/_next/';
            sub_filter "url('/_next/" "url('$http_x_ingress_path/_next/";
            sub_filter_once off;
            sub_filter_types *;
        }
    }
}
EOF

echo "Starting TXLS..."
node /app/node_modules/next/dist/bin/next start -H 0.0.0.0 &

sleep 2

echo "Starting nginx..."
nginx -g "daemon off;"
