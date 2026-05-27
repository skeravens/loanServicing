# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && cp -R node_modules /tmp/prod_node_modules \
 && npm ci

# ─── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: development ────────────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ─── Stage 4: production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production
ENV NODE_ENV=production
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
WORKDIR /app
COPY --from=deps /tmp/prod_node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"
CMD ["node", "dist/main.js"]
