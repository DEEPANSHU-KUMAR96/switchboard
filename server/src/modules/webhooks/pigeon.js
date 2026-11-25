'use strict';
const crypto = require('crypto');
const cfg = require('../../config');
const { col } = require('../../lib/db');
const { isDup } = require('../../lib/util');
const { emit } = require('../../lib/feed');
const { ensureConv } = require('../conversations/service');

const RANK = { queued: 0, sent: 1, delivered: 2, failed: 2 }; // statuses only move forward

function verifySig(raw, header) {
  if (!header || typeof header !== 'string') return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2));
  const t = Number(parts.t);
  if (!parts.t || !parts.v1 || !Number.isFinite(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false; // replay protection
  const want = crypto.createHmac('sha256', cfg.PIGEON_SECRET).update(t + '.').update(raw).digest('hex');
  const a = Buffer.from(want), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function onInbound(ws, ev) {
  const d = ev.data;
  if (typeof d.message_id !== 'string' || typeof d.from !== 'string') return false;
  const at = new Date(ev.occurred_at);
  const occurred = isNaN(at) ? new Date() : at;
  const text = String(d.text || '');
  try {
    await col.messages.insertOne({ _id: ws + ':' + d.message_id, ws, contact: d.from, message_id: d.message_id, text, occurred_at: occurred });
  } catch (e) { if (!isDup(e)) throw e; } // duplicate delivery: already stored
  await ensureConv(ws, d.from, occurred);
  await emit(ws, 'in:' + d.message_id, { type: 'message.inbound', contact: d.from, message_id: d.message_id, text });
  return true;
}

async function onStatus(ws, ev) {
  const d = ev.data;
  const rank = RANK[d.status];
  if (typeof d.client_ref !== 'string' || rank === undefined) return true; // ignore
  const r = await col.outbound.findOneAndUpdate(
    { _id: d.client_ref, ws, rank: { $lt: rank } },
    { $set: { status: d.status, rank } }, { returnDocument: 'after' });
  if (r) await emit(ws, 'st:' + d.client_ref + ':' + d.status, { type: 'message.status', contact: r.contact, client_ref: d.client_ref, status: d.status });
  return true; // status for unknown message: ignored
}

// Rule: answer 2xx ONLY after the event is safely stored.
async function handler(req, res) {
  const raw = req.body;
  if (!Buffer.isBuffer(raw) || !verifySig(raw, req.get('x-pigeon-signature'))) return res.sendStatus(401);
  let ev;
  try { ev = JSON.parse(raw.toString('utf8')); } catch { return res.sendStatus(400); }
  if (!ev || typeof ev !== 'object' || typeof ev.data !== 'object' || ev.data === null) return res.sendStatus(400);
  try {
    if (!cfg.WORKSPACES.includes(ev.workspace)) return res.sendStatus(200); // unknown workspace
    let ok = true;
    if (ev.type === 'message.inbound') ok = await onInbound(ev.workspace, ev);
    else if (ev.type === 'message.status') ok = await onStatus(ev.workspace, ev);
    return res.sendStatus(ok ? 200 : 400); // unknown event types -> 200
  } catch (e) {
    console.error('webhook error', e);
    return res.sendStatus(500); // not stored -> Pigeon will retry
  }
}

module.exports = { handler };
