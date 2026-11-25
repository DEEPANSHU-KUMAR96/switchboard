'use strict';
// Background sender. Safe with many copies and after kill -9:
//  - a job is "leased" for 10 s; if the copy dies, the lease expires and
//    another copy picks it up
//  - Pigeon gets Idempotency-Key = client_ref, so a retry never double-sends
//  - rate limit lives in Redis, shared by all copies (per workspace)
const cfg = require('../../config');
const { col, redis } = require('../../lib/db');
const { sleep } = require('../../lib/util');
const { emit } = require('../../lib/feed');

const BUCKET = `
local d=redis.call('HMGET',KEYS[1],'t','ts')
local cap=tonumber(ARGV[1]) local rate=tonumber(ARGV[2]) local now=tonumber(ARGV[3])
local t=tonumber(d[1]) or cap local ts=tonumber(d[2]) or now
t=math.min(cap,t+(now-ts)/1000*rate)
local ok=0 if t>=1 then t=t-1 ok=1 end
redis.call('HMSET',KEYS[1],'t',t,'ts',now) redis.call('PEXPIRE',KEYS[1],10000)
return ok`;
// Pigeon allows 8 burst / 4 per second; we stay a little under that.
const takeToken = async (ws) => (await redis.eval(BUCKET, 1, 'sb:bucket:' + ws, 5, 3, Date.now())) === 1;

async function sendJob(job) {
  const release = (set) => col.outbound.updateOne({ _id: job._id }, { $set: { leaseUntil: 0, ...set }, $inc: { attempts: 1 } });
  const backoff = Date.now() + Math.min(300 * 2 ** Math.min(job.attempts, 4), 3000);
  try {
    const r = await fetch(cfg.PIGEON_URL + '/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.KEYS[job.ws], 'idempotency-key': job._id },
      body: JSON.stringify({ to: job.contact, text: job.text, client_ref: job._id }),
      signal: AbortSignal.timeout(4000),
    });
    if (r.status === 200) { await col.outbound.updateOne({ _id: job._id }, { $set: { accepted: true, leaseUntil: 0 } }); return; }
    if (r.status === 429) {
      const wait = (Number(r.headers.get('retry-after')) || 2) * 1000 + 300;
      await redis.set('sb:cool:' + job.ws, '1', 'PX', wait); // all copies stop sending to this workspace
      await release({ nextAttemptAt: Date.now() + wait });
      return;
    }
    if (r.status >= 500) { await release({ nextAttemptAt: backoff }); return; }
    // any other 4xx will never succeed
    await col.outbound.updateOne({ _id: job._id }, { $set: { accepted: true, leaseUntil: 0, status: 'failed', rank: 2 } });
    await emit(job.ws, 'st:' + job._id + ':failed', { type: 'message.status', contact: job.contact, client_ref: job._id, status: 'failed' });
  } catch (e) {
    // timeout or network error: Pigeon may have accepted. Retry with the SAME idempotency key.
    await release({ nextAttemptAt: backoff }).catch(() => {});
  }
}

const inflight = {};
async function pump(ws) {
  inflight[ws] = inflight[ws] || 0;
  while (inflight[ws] < 6) {
    if (await redis.exists('sb:cool:' + ws)) return;
    const now = Date.now();
    const job = await col.outbound.findOneAndUpdate(
      { ws, accepted: false, nextAttemptAt: { $lte: now }, leaseUntil: { $lt: now } },
      { $set: { leaseUntil: now + 10000 } },
      { sort: { createdAt: 1 }, returnDocument: 'after' });
    if (!job) return;
    if (!(await takeToken(ws))) { await col.outbound.updateOne({ _id: job._id }, { $set: { leaseUntil: 0 } }); return; }
    inflight[ws]++;
    sendJob(job).finally(() => { inflight[ws]--; });
  }
}

let stopping = false;
async function loop() {
  while (!stopping) {
    await Promise.all(cfg.WORKSPACES.map((ws) => pump(ws).catch((e) => console.error('pump', e.message))));
    await sleep(200);
  }
}
module.exports = { start: () => { loop(); }, stop: () => { stopping = true; } };
