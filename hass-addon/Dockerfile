FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache sqlite jq openssl nginx

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/dist ./dist

COPY hass-addon/run-hass.sh /run-hass.sh
RUN chmod a+x /run-hass.sh

ENV DATA_DIR=/data
EXPOSE 8080

CMD ["/run-hass.sh"]
