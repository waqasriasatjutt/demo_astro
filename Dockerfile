# =============================================================================
# Single-image deploy: build Astro (static), build BFF (TS -> JS), serve both
# from one Node + Hono process at $PORT (3000 by default).
# Typesense runs as a sidecar via docker-compose.
# =============================================================================

# ---- build web ----
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY web/package.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- build bff ----
FROM node:20-alpine AS bff-build
WORKDIR /app/bff
COPY bff/package.json bff/tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY bff/ ./
RUN npx tsc

# ---- runtime ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY bff/package.json ./bff/
RUN cd bff && npm install --omit=dev --no-audit --no-fund
COPY --from=bff-build /app/bff/dist ./bff/dist
COPY --from=web-build /app/web/dist ./web/dist
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/bff
CMD ["node", "dist/server.js"]
