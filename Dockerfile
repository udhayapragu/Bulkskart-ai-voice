# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY server/ server/
RUN cd server && npm run build && npm prune --omit=dev

COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web/ web/
RUN cd web && npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST_DIR=/app/web/dist
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/server/package.json ./server/package.json
COPY --from=build --chown=app:app /app/server/node_modules ./server/node_modules
COPY --from=build --chown=app:app /app/server/dist ./server/dist
COPY --from=build --chown=app:app /app/server/migrations ./server/migrations
COPY --from=build --chown=app:app /app/web/dist ./web/dist

WORKDIR /app/server
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
# Run migrations as a one-off before starting the service:
#   docker run --rm --env-file server/.env <image> node dist/db/migrate.js
CMD ["node", "dist/index.js"]
