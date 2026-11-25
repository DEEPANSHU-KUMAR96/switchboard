'use strict';
const express = require('express');
const { col } = require('../../lib/db');
const { getSession, memberOf } = require('../auth/session');

const router = express.Router();

router.get('/me', async (req, res) => {
  const s = await getSession(req);
  if (!s) return res.sendStatus(401);
  res.json({ sub: s.sub, name: s.name, workspaces: s.workspaces });
});

// Tenant isolation: the workspace must be one the signed-in user belongs to.
router.get('/conversations', async (req, res) => {
  const s = await getSession(req);
  if (!s) return res.sendStatus(401);
  const ws = String(req.query.workspace || '');
  if (!memberOf(s, ws)) return res.sendStatus(403);
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const filter = { ws };
  if (req.query.before) filter.lastActivity = { $lt: new Date(String(req.query.before)) };
  const list = await col.convs.find(filter).sort({ lastActivity: -1 }).limit(limit).toArray();
  res.json({
    conversations: list.map((c) => ({ contact: c.contact, assignee: c.assignee, status: c.status, lastActivity: c.lastActivity })),
    next: list.length === limit ? list[list.length - 1].lastActivity : null,
  });
});

module.exports = router;
