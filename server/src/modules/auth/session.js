'use strict';
const { redis } = require('../../lib/db');

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('='))
    .filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]));
}
async function getSession(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const raw = await redis.get('sess:' + sid);
  return raw ? JSON.parse(raw) : null;
}
const memberOf = (session, ws) => !!session && session.workspaces.some((w) => w.id === ws);

module.exports = { getSession, memberOf };
