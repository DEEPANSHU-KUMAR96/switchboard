'use strict';
// Real-time frames. Each frame gets a per-workspace increasing `seq`,
// is stored (so clients can replay with ?after=N) and published on Redis
// (so every copy of the server can push it to its own browsers).
const { col, redis } = require('./db');
const { isDup } = require('./util');

async function nextSeq(ws) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await col.counters.findOneAndUpdate({ _id: ws }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
      return r.seq;
    } catch (e) { if (!isDup(e)) throw e; }
  }
  throw new Error('could not allocate seq');
}

// `key` makes emit idempotent: the same event never produces two frames.
async function emit(ws, key, frame) {
  const _id = ws + ':' + key;
  if (await col.feed.findOne({ _id }, { projection: { _id: 1 } })) return;
  const seq = await nextSeq(ws);
  const full = { seq, ...frame };
  try { await col.feed.insertOne({ _id, ws, seq, frame: full }); } catch (e) { if (isDup(e)) return; throw e; }
  redis.publish('feed:' + ws, JSON.stringify(full)).catch(() => {});
}

module.exports = { emit };
