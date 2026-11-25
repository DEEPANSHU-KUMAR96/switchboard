'use strict';
// GET /ws?workspace=ID[&after=N]
// Replays every frame after N, then streams live. Redis pub/sub carries frames
// between server copies.
const { WebSocketServer } = require('ws');
const { col, sub } = require('../../lib/db');
const { getSession, memberOf } = require('../auth/session');

const clients = new Map(); // workspace id -> Set of clients

async function attach(sock, wsId, after) {
  const wantReplay = after !== null;
  let last = wantReplay ? after : 0;
  let replaying = wantReplay;
  let buffered = [];
  const send = (f) => {
    if (sock.readyState === 1 && f.seq > last) { sock.send(JSON.stringify(f)); last = f.seq; }
  };
  const client = { push: (f) => (replaying ? buffered.push(f) : send(f)) };

  if (!clients.has(wsId)) { clients.set(wsId, new Set()); await sub.subscribe('feed:' + wsId); }
  clients.get(wsId).add(client); // subscribe BEFORE replay so nothing is missed in between
  sock.on('close', () => clients.get(wsId).delete(client));
  sock.on('error', () => {});

  if (wantReplay) {
    for (const row of await col.feed.find({ ws: wsId, seq: { $gt: after } }).sort({ seq: 1 }).toArray()) send(row.frame);
    replaying = false;
    buffered.sort((a, b) => a.seq - b.seq).forEach(send);
    buffered = [];
  }
}

function setup(server) {
  const wss = new WebSocketServer({ noServer: true });
  sub.on('message', (channel, msg) => {
    const set = clients.get(channel.slice('feed:'.length));
    if (set) for (const c of set) c.push(JSON.parse(msg));
  });
  server.on('upgrade', async (req, socket, head) => {
    const deny = (line) => { socket.write(`HTTP/1.1 ${line}\r\n\r\n`); socket.destroy(); };
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname !== '/ws') return deny('404 Not Found');
      const s = await getSession(req);
      if (!s) return deny('401 Unauthorized');
      const wsId = url.searchParams.get('workspace');
      if (!memberOf(s, wsId)) return deny('403 Forbidden');
      const raw = url.searchParams.get('after');
      const after = raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
      wss.handleUpgrade(req, socket, head, (sock) => attach(sock, wsId, after));
    } catch { deny('400 Bad Request'); }
  });
}
module.exports = { setup };
