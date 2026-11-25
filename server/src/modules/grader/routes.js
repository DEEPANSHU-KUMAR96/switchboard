'use strict';
// Endpoints the automatic check calls. They use the same services as the UI.
const express = require('express');
const cfg = require('../../config');
const { col, redis } = require('../../lib/db');
const { queueReply } = require('../outbound/queue');
const { claim } = require('../conversations/service');

const router = express.Router();
router.use((req, res, next) => (req.get('x-grader-token') === cfg.GRADER_TOKEN ? next() : res.sendStatus(401)));

router.post('/reset', async (req, res) => {
  await Promise.all(['messages', 'outbound', 'convs', 'feed', 'counters'].map((n) => col[n].deleteMany({})));
  let cursor = '0';
  do { // delete our Redis keys, keep login sessions
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'sb:*', 'COUNT', 200);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
  res.sendStatus(200);
});

router.get('/snapshot', async (req, res) => {
  const out = { workspaces: {} };
  for (const ws of cfg.WORKSPACES) out.workspaces[ws] = { contacts: {}, outbound: {} };
  for (const c of await col.convs.find({}).toArray()) {
    if (out.workspaces[c.ws]) out.workspaces[c.ws].contacts[c.contact] = { inbound: [], assignee: c.assignee };
  }
  // oldest first: by occurred_at, then message id
  for (const m of await col.messages.find({}).sort({ occurred_at: 1, message_id: 1 }).toArray()) {
    const w = out.workspaces[m.ws];
    if (!w) continue;
    (w.contacts[m.contact] = w.contacts[m.contact] || { inbound: [], assignee: null }).inbound.push(m.message_id);
  }
  for (const o of await col.outbound.find({}).toArray()) {
    if (out.workspaces[o.ws]) out.workspaces[o.ws].outbound[o._id] = o.status;
  }
  res.json(out);
});

router.post('/reply', async (req, res) => {
  const { workspace, contact, text, client_ref } = req.body || {};
  if (!cfg.WORKSPACES.includes(workspace)) return res.status(404).json({ error: 'unknown workspace' });
  if (typeof contact !== 'string' || typeof text !== 'string' || typeof client_ref !== 'string' || !client_ref) {
    return res.status(400).json({ error: 'contact, text, client_ref required' });
  }
  await queueReply(workspace, contact, text, client_ref);
  res.sendStatus(202);
});

router.post('/claim', async (req, res) => {
  const { workspace, contact, agent } = req.body || {};
  if (!cfg.WORKSPACES.includes(workspace) || typeof contact !== 'string' || typeof agent !== 'string') return res.sendStatus(400);
  res.sendStatus((await claim(workspace, contact, agent)) ? 200 : 409);
});

module.exports = router;
