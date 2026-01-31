#!/usr/bin/env node

/**
 * Rate Limit Reset Script
 *
 * This script provides utilities to manage rate limiting during development.
 * Run with: node scripts/reset-rate-limits.js
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

console.log('🔧 Rate Limit Management Script');
console.log('================================\n');

// Check current environment
const isDevelopment = process.env.NODE_ENV !== 'production';
console.log(`Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
console.log(`Rate Limit: ${isDevelopment ? '1000 requests/15min' : '200 requests/15min'}`);
console.log(`Auth Rate Limit: ${isDevelopment ? '50 requests/15min' : '10 requests/15min'}\n`);

console.log('📋 Current Rate Limiting Configuration:');
console.log('- Global routes: 1000 requests per 15 minutes (development)');
console.log('- Auth routes: 50 requests per 15 minutes (development)');
console.log('- Production: 200 global, 10 auth requests per 15 minutes\n');

console.log('🛠️  Troubleshooting Steps:');
console.log('1. Wait for the retry-after period (check response headers)');
console.log('2. Clear browser cache and cookies');
console.log('3. Use a different IP address or VPN');
console.log('4. Restart the server to reset in-memory rate limits');
console.log('5. Set NODE_ENV=development for more permissive limits\n');

console.log('⚡ Quick Fix Commands:');
console.log('# Restart server (resets in-memory limits)');
console.log('npm restart\n');

console.log('# Set development mode');
console.log('export NODE_ENV=development');
console.log('npm start\n');

console.log('# Check current rate limit headers');
console.log('curl -I http://localhost:4000/api/auth/login\n');

console.log('📊 Rate Limit Headers to Check:');
console.log('- x-ratelimit-limit: Maximum requests allowed');
console.log('- x-ratelimit-remaining: Requests remaining');
console.log('- x-ratelimit-reset: Time when limit resets');
console.log('- retry-after: Seconds to wait before retrying\n');

console.log('🔍 If still rate limited:');
console.log('- The limit is stored in memory and resets when server restarts');
console.log('- Different routes may have different limits');
console.log('- OPTIONS preflight requests count toward the limit');
console.log('- Failed requests also count toward the limit\n');

console.log('✅ Solution Applied:');
console.log('- Increased development limits (1000 global, 50 auth)');
console.log('- Separate auth route limits for login flexibility');
console.log('- Environment-aware configuration\n');

process.exit(0);