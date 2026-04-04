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

# In Node 18, `crypto` is available as `globalThis.crypto` but NOT as a bare
# global identifier (that landed in Node 20). The polyfill below sets
# global.crypto once via --require so every node invocation in the test suite
# (including those inside run_tests.sh) sees `crypto` as a plain global.
#
# Browser tests (Playwright) are excluded from this stage — they require
# Chromium, which is not present in the Alpine build image.
# Run browser tests locally: ./run_tests.sh --browser
RUN printf 'if (!global.crypto) global.crypto = require("crypto").webcrypto;\n' \
      > /tmp/n18-crypto-polyfill.cjs && \
    NODE_OPTIONS="--require /tmp/n18-crypto-polyfill.cjs" bash -c \
      './run_tests.sh --unit && ./run_tests.sh --api && ./run_tests.sh --e2e'

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
