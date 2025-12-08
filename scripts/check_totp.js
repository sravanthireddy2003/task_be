#!/usr/bin/env node
require('dotenv').config();
const speakeasy = require('speakeasy');

function usage() {
  console.log('Usage: node scripts/check_totp.js <secret> <token> [window]');
  console.log('Example: node scripts/check_totp.js GYZDE2ZBEZEG6JR7PF2EKSL2EFDHSVTX 123456 1');
}

const args = process.argv.slice(2);
if (args.length < 2) {
  usage();
  process.exit(1);
}

const [secret, token, win] = args;
const window = typeof win !== 'undefined' ? parseInt(win, 10) : 1;

try {
  const verified = speakeasy.totp.verify({ secret: String(secret), encoding: 'base32', token: String(token), window });
  const nowToken = speakeasy.totp({ secret: String(secret), encoding: 'base32' });
  console.log(JSON.stringify({ verified, nowToken, window }, null, 2));
  process.exit(verified ? 0 : 2);
} catch (e) {
  console.error('Error verifying token:', e && e.message);
  process.exit(3);
}
