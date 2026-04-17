# ── Build & Test Stage ──────────────────────────────────────────────────────
FROM node:18-alpine AS build

# bash is required by run_tests.sh (#!/bin/bash shebang)
RUN apk add --no-cache bash

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Produce production build (fails the image build if there are syntax errors)
RUN npm run build

# Run unit, component, and e2e tests (run_tests.sh handles the Node 18 crypto
# polyfill internally). Browser tests are excluded — they require Chromium,
# which is not present in the Alpine build image.
# Run browser tests locally: ./run_tests.sh --browser
RUN ./run_tests.sh --unit && ./run_tests.sh --component && ./run_tests.sh --e2e

# ── Production Stage ─────────────────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Carry over node_modules (contains vite for `vite preview`)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist

EXPOSE 4173

# Serve the production build on all interfaces
CMD ["node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
