'use strict';
const crypto = require('crypto');
const { col } = require('../../lib/db');
const { isDup } = require('../../lib/util');
const { emit } = require('../../lib/feed');

// Create the conversation if missing (safe when many requests race).
async function ensureConv(ws, contact, activity) {
  const _id = ws + ':' + contact;
  for (let i = 0; i < 3; i++) {
    try {
      await col.convs.updateOne(
        { _id },
        { $setOnInsert: { ws, contact, assignee: null, status: 'open' }, $max: { lastActivity: activity || new Date(0) } },
        { upsert: true });
      return _id;
    } catch (e) { if (!isDup(e)) throw e; }
  }
  return _id;
}

// Atomic claim: succeeds if free or already ours. If someone else holds it the
// filter does not match, the upsert tries to insert the same _id and Mongo
// raises a duplicate-key error -> we answer "taken".
async function claim(ws, contact, agent) {
  const _id = ws + ':' + contact;
  try {
    const r = await col.convs.updateOne(
      { _id, $or: [{ assignee: null }, { assignee: agent }] },
      { $set: { assignee: agent }, $setOnInsert: { ws, contact, status: 'open', lastActivity: new Date() } },
      { upsert: true });
    if (r.modifiedCount || r.upsertedCount) {
      await emit(ws, 'as:' + crypto.randomUUID(), { type: 'conversation.assigned', contact, assignee: agent });
    }
    return true;
  } catch (e) { if (isDup(e)) return false; throw e; }
}

module.exports = { ensureConv, claim };
