'use strict';
const http = require('http');
const cfg = require('./config');
const db = require('./lib/db');
const { createApp } = require('./app');
const worker = require('./modules/outbound/worker');
const realtime = require('./modules/realtime/ws');
const { sleep } = require('./lib/util');

// Windows-only: when the harness runs `kill -9` on the wrapper shell (sh.exe),
// the real node.exe child survives and holds the port. Find it via `netstat -ano`
// and kill it with `taskkill /F` so the restart can bind.
// On Linux this function returns immediately (no-op).
async function evictPort(port) {
  if (process.platform !== 'win32') return;
  try {
    const { execSync } = require('child_process');
    const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 3000 });
    const pids = new Set();
    for (const line of out.split('\n')) {
      // Match lines where the local-address column ends in :PORT (not e.g. :40010)
      if (new RegExp(':' + port + '\\b').test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (pid && pid !== process.pid) pids.add(pid);
      }
    }
    for (const pid of pids) {
      try { execSync('taskkill /PID ' + pid + ' /F', { timeout: 2000 }); } catch {}
    }
  } catch {}
}

// If the parent process (the shell the harness spawned) dies, exit too,
// so no orphan keeps the port. Only armed when the parent is visible at start-up.
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

// Try server.listen(). Returns the error on failure, or null on success.
function tryListen(server, port) {
  return new Promise((resolve) => {
    const onErr = (e) => { server.removeListener('error', onErr); resolve(e); };
    server.once('error', onErr);
    server.listen(port, () => { server.removeListener('error', onErr); resolve(null); });
  });
}

async function main() {
  await db.init(); // /healthz answers only after this; server listens last
  const server = http.createServer(createApp());
  realtime.setup(server);

  // Retry loop: on Windows a stale node.exe may hold the port after a kill -9.
  // Evict it, wait a moment, and try again. On Linux the first attempt always wins.
  for (let attempt = 0; attempt < 6; attempt++) {
    const err = await tryListen(server, cfg.PORT);
    if (!err) break; // bound successfully
    if (err.code !== 'EADDRINUSE' || attempt >= 5) { console.error(err); process.exit(1); }
    console.log('[switchboard] port ' + cfg.PORT + ' busy (attempt ' + (attempt + 1) + '), evicting stale process...');
    await evictPort(cfg.PORT);
    await sleep(300);
  }

  console.log('switchboard listening on ' + cfg.PORT);
  worker.start();
  exitWithParent();
  const shutdown = () => { worker.stop(); server.close(); setTimeout(() => process.exit(0), 500); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((e) => { console.error(e); process.exit(1); });
