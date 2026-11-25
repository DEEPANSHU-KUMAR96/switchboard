# Switchboard

Shared team inbox: customers write via Pigeon, agents reply in real time.

## Run from a clean clone
```
npm run up                     # MongoDB, Redis, simulators (Docker)
npm --prefix server install
npm --prefix server start      # http://localhost:4000  (reads .env.example names from the environment)
npm run check                  # level 1 (stop the server first)
npm run check:full             # levels 1,2,3,5 -> CHECK_REPORT.json
```

## Layout
```
server/src/
  index.js            start-up and shutdown
  app.js              express wiring
  config.js           all settings from the environment
  lib/                db connections, realtime feed, small helpers
  modules/
    webhooks/         Pigeon webhook (signature, dedupe, store, then 2xx)
    conversations/    create / claim conversations
    outbound/         reply queue + background sender (leases, retries, rate limit)
    auth/             OpenID Connect login (PKCE), sessions
    api/              /api/me, /api/conversations
    grader/           endpoints the automatic check calls
    realtime/         WebSocket with replay (?after=N)
web/                  React app (not built yet)
ai-logs/              exported AI conversations
```
