'use strict';
const { col } = require('../../lib/db');
const { isDup } = require('../../lib/util');
const { ensureConv } = require('../conversations/service');

// Store first, send later. client_ref is the primary key, so asking twice
// (even at the same instant) is one reply.
async function queueReply(ws, contact, text, clientRef) {
  await ensureConv(ws, contact, new Date());
  try {
    await col.outbound.insertOne({
      _id: clientRef, ws, contact, text,
      status: 'queued', rank: 0, accepted: false,
      attempts: 0, nextAttemptAt: 0, leaseUntil: 0, createdAt: new Date(),
    });
  } catch (e) { if (!isDup(e)) throw e; }
}

module.exports = { queueReply };
