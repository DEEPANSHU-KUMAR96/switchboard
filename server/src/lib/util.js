'use strict';
exports.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.isDup = (e) => !!e && e.code === 11000; // Mongo duplicate-key error
exports.b64u = (buf) => buf.toString('base64url');
