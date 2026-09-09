# ============================================================
# VARAI API — container image
# Works on Fly.io, Koyeb, Railway, Cloud Run, or any Docker host.
# ============================================================

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public
COPY contracts ./contracts
COPY db ./db
# Kept so `npm run db:check` works from the platform's shell when a deploy fails.
COPY scripts ./scripts

# Never run as root.
USER node

EXPOSE 4000
CMD ["node", "dist/src/server.js"]
