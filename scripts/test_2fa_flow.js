#!/usr/bin/env node
require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
const speakeasy = require('speakeasy');

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

if (!EMAIL || !PASSWORD) {
  console.error('Please set TEST_EMAIL and TEST_PASSWORD in environment to run this script');
  process.exit(1);
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function get(path, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  try {
    console.log('1) Login (password)');
    const login = await post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    if (login.status !== 200 || !login.data.token) {
      console.error('Login failed or did not return token:', login.status, login.data);
      process.exit(2);
    }
    const token = login.data.token;
    console.log('Logged in, token obtained');

    console.log('2) Start 2FA setup: POST /api/auth/2fa/enable');
    const enable = await post('/api/auth/2fa/enable', {}, token);
    console.log('Enable response:', enable.status, enable.data);
    if (enable.status !== 200 || !enable.data.secret) {
      console.error('Enable did not return secret — aborting');
      process.exit(3);
    }
    const secret = enable.data.secret;

    console.log('3) Generate TOTP locally using secret and verify');
    const totp = speakeasy.totp({ secret: String(secret), encoding: 'base32' });
    console.log('Generated TOTP (for testing):', totp);

    console.log('4) Verify TOTP: POST /api/auth/2fa/verify');
    const verify = await post('/api/auth/2fa/verify', { token: totp }, token);
    console.log('Verify response:', verify.status, verify.data);

    if (verify.status === 200 && verify.data.token) {
      console.log('2FA enabled and new token returned — test complete');
      // optional: call profile to verify token works
      const profile = await get('/api/auth/profile', verify.data.token);
      console.log('/api/auth/profile ->', profile.status, profile.data);
      process.exit(0);
    }

    console.error('2FA verify did not return tokens. Response body:', verify.data);
    process.exit(4);
  } catch (e) {
    console.error('Test failed:', e && e.message);
    process.exit(5);
  }
})();
