# Build stage for native deps
FROM node:24-alpine AS native-builder
WORKDIR /app

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --filter @txls/shared --filter @txls/server --frozen-lockfile --prod

RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npx node-gyp rebuild --release

# Runtime stage
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
RUN apk add --no-cache nginx curl sqlite jq openssl

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --filter @txls/shared --filter @txls/server --frozen-lockfile --prod

COPY --from=native-builder /app/node_modules ./node_modules
COPY shared/dist ./shared/dist
COPY server/dist ./server/dist
COPY client/dist ./client/dist
COPY public ./public

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/run.sh /run.sh
RUN chmod a+x /run.sh

ENV DATA_DIR=/data
EXPOSE 3000

CMD ["/run.sh"]
