'use strict';
// Every setting comes from the environment (see .env.example).
const E = process.env;
const KEYS = {
  ws_acme: E.PIGEON_KEY_WS_ACME || 'pk_acme_7d1f0a',
  ws_globex: E.PIGEON_KEY_WS_GLOBEX || 'pk_globex_c93b22',
};
module.exports = {
  PORT: Number(E.PORT || 4000),
  MONGO_URL: E.MONGO_URL || 'mongodb://localhost:27017/switchboard',
  REDIS_URL: E.REDIS_URL || 'redis://localhost:6379',
  GRADER_TOKEN: E.GRADER_TOKEN || 'grader-dev-token',
  WEB_ORIGIN: E.WEB_ORIGIN || 'http://localhost:5173',
  PIGEON_URL: E.PIGEON_URL || 'http://localhost:4010',
  PIGEON_SECRET: E.PIGEON_WEBHOOK_SECRET || 'whsec_pigeon_dev',
  KEYS,
  WORKSPACES: Object.keys(KEYS),
  OIDC: {
    issuer: E.OIDC_ISSUER || 'http://localhost:4020',
    clientId: E.OIDC_CLIENT_ID || 'switchboard-web',
    clientSecret: E.OIDC_CLIENT_SECRET || 'dev-secret-not-for-production',
    redirectUri: E.OIDC_REDIRECT_URI || 'http://localhost:4000/auth/callback',
  },
};
