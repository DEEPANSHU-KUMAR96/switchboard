'use strict';
// Run once in your packet folder:  node fix.js
// 1) start the server with plain node (no npm in between), so "kill -9" hits the real server
// 2) server exits by itself if the process that started it dies (no orphan left holding the port)
const fs = require('fs');

fs.writeFileSync('switchboard.json', JSON.stringify({
  install: 'npm --prefix server install',
  start: 'node server/src/index.js',
  health: '/healthz',
}, null, 2) + '\n');

fs.writeFileSync('server/src/index.js', `'use strict';
const http = require('http');
const cfg = require('./config');
const db = require('./lib/db');
const { createApp } = require('./app');
const worker = require('./modules/outbound/worker');
const realtime = require('./modules/realtime/ws');

// If whoever started us dies (for example kill -9 on the wrapper shell), exit too,
// so no orphan keeps the port. Only armed when the parent can be seen at start-up.
function exitWithParent() {
  const parent = process.ppid;
  if (!parent || parent <= 1) return;
  try { process.kill(parent, 0); } catch { return; }
  let misses = 0;
  setInterval(() => {
    try { process.kill(parent, 0); misses = 0; }
    catch (e) { if (e.code === 'ESRCH' && ++misses >= 2) process.exit(1); }
  }, 500).unref();
}

async function main() {
  await db.init(); // /healthz answers only after this: server listens last
  const server = http.createServer(createApp());
  realtime.setup(server);
  server.listen(cfg.PORT, () => console.log('switchboard listening on ' + cfg.PORT));
  worker.start();
  exitWithParent();
  const shutdown = () => { worker.stop(); server.close(); setTimeout(() => process.exit(0), 500); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((e) => { console.error(e); process.exit(1); });
`);
console.log('fixed: switchboard.json and server/src/index.js');
