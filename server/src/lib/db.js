'use strict';
const Redis = require('ioredis');
const { MongoClient } = require('mongodb');
const cfg = require('../config');

const redis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
const sub = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null }); // pub/sub needs its own connection
const mongo = new MongoClient(cfg.MONGO_URL);
const col = {}; // filled by init(); modules read col.xxx at call time

async function init() {
  await mongo.connect();
  const db = mongo.db();
  for (const n of ['messages', 'outbound', 'convs', 'feed', 'counters']) col[n] = db.collection(n);
  await col.messages.createIndex({ ws: 1, contact: 1, occurred_at: 1, message_id: 1 });
  await col.outbound.createIndex({ ws: 1, accepted: 1, nextAttemptAt: 1, leaseUntil: 1, createdAt: 1 });
  await col.feed.createIndex({ ws: 1, seq: 1 });
  await col.convs.createIndex({ ws: 1, lastActivity: -1 });
}

module.exports = { redis, sub, mongo, col, init };
