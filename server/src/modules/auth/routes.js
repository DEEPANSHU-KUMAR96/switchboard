'use strict';
// OpenID Connect: authorization code + PKCE (S256).
const crypto = require('crypto');
const express = require('express');
const cfg = require('../../config');
const { redis } = require('../../lib/db');
const { b64u } = require('../../lib/util');

const router = express.Router();
const { issuer, clientId, clientSecret, redirectUri } = cfg.OIDC;

router.get('/login', async (req, res) => {
  const verifier = b64u(crypto.randomBytes(32));
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
  const state = b64u(crypto.randomBytes(16));
  await redis.set('login:' + state, verifier, 'EX', 600);
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state });
  res.redirect(issuer + '/authorize?' + q);
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const verifier = state && (await redis.getdel('login:' + state)); // one use only
    if (!code || !verifier) return res.status(400).send('bad login state');
    const tr = await fetch(issuer + '/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier, client_id: clientId, client_secret: clientSecret }),
    });
    if (!tr.ok) return res.status(400).send('token exchange failed');
    const tok = await tr.json();
    // userinfo comes straight from the IdP over the back channel, so no JWT parsing needed
    const ur = await fetch(issuer + '/userinfo', { headers: { authorization: 'Bearer ' + tok.access_token } });
    if (!ur.ok) return res.status(400).send('userinfo failed');
    const u = await ur.json();
    const sid = b64u(crypto.randomBytes(24));
    await redis.set('sess:' + sid, JSON.stringify({ sub: u.sub, name: u.name, email: u.email, workspaces: u.workspaces || [] }), 'EX', 8 * 3600);
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8 * 3600}`);
    res.redirect(cfg.WEB_ORIGIN);
  } catch (e) { console.error(e); res.status(500).send('login error'); }
});

module.exports = router;
