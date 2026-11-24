# syntax=docker/dockerfile:1

# The production image: the built SPA, served by Caddy with its SPA fallback, cache headers and CSP
# (deploy/Caddyfile). It runs behind profound-baker-server's Caddy on the same domain, which
# terminates TLS and sends /api to the backend, so the API base URL is empty (same origin).
#   docker build -t profound-baker-web .

# ---- build ---------------------------------------------------------------------------------------
FROM node:26-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Inlined into the bundle by Vite. Empty: the API is on the same origin.
ARG VITE_API_BASE_URL=
ARG VITE_CURRENCY=CAD
ARG VITE_LOCALE=en-US
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_CURRENCY=$VITE_CURRENCY VITE_LOCALE=$VITE_LOCALE
# Types are checked in CI; the image only needs the bundle.
RUN npx vite build

# ---- runtime -------------------------------------------------------------------------------------
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
