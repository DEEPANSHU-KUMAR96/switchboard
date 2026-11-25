'use strict';
const http = require('http');
const cfg = require('./config');
const db = require('./lib/db');
const { createApp } = require('./app');
const worker = require('./modules/outbound/worker');
const realtime = require('./modules/realtime/ws');

async function main() {
  await db.init(); // /healthz answers only after this: server listens last
  const server = http.createServer(createApp());
  realtime.setup(server);
  server.listen(cfg.PORT, () => console.log('switchboard listening on ' + cfg.PORT));
  worker.start();
  const shutdown = () => { worker.stop(); server.close(); setTimeout(() => process.exit(0), 500); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((e) => { console.error(e); process.exit(1); });
