'use strict';
const express = require('express');
const pigeon = require('./modules/webhooks/pigeon');

function createApp() {
  const app = express();
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  // The webhook needs the RAW body to check the signature, so it comes before express.json()
  app.post('/webhooks/pigeon', express.raw({ type: () => true, limit: '1mb' }), pigeon.handler);
  app.use(express.json());
  app.use('/auth', require('./modules/auth/routes'));
  app.use('/api', require('./modules/api/routes'));
  app.use('/__grader', require('./modules/grader/routes'));
  return app;
}
module.exports = { createApp };
