FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Set basePath placeholder - will be replaced at runtime by run.sh
RUN sed -i 's/const nextConfig: NextConfig = {/const nextConfig: NextConfig = {\n  basePath: "\/__INGRESS_PATH_HOLDER__",/' next.config.ts
RUN npm run build

FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache sqlite jq openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/dist ./dist

COPY docker/run.sh /run.sh
RUN chmod a+x /run.sh

ENV DATA_DIR=/data
EXPOSE 3000

CMD ["/run.sh"]
